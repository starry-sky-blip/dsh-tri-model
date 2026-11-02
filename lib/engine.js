import { buildRequest, errorText, parseReply, protocolOf } from './protocols.js'
import { findEndpoint, findModel } from './config.js'

/* ------------------------------------------------------------------ 小工具 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function clampNumber(value, min, max, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

/** 把 caps 与层参数合成一次请求真正要用的参数。 */
function mergeParams(model, layer) {
  const caps = model.caps || {}
  const params = { ...(layer?.params || {}) }

  if (caps.temperature === 'unset') delete params.temperature
  else if (typeof caps.temperature === 'number') params.temperature = caps.temperature

  if (caps.thinking === false) delete params.thinking
  else if (caps.thinking === true && !params.thinking) params.thinking = 'enabled'

  if (caps.json === false) params.json = false

  return params
}

/** 每类层默认输出预算：规划短、成品长、裁决更短。层里写了 maxTokens 就以层为准。 */
const KIND_BUDGET = { plan: 700, execute: 3000, custom: 3000, judge: 600 }

/** 从报错文案里认出是哪一项参数不被接受。 */
function culpritParam(text) {
  const t = String(text || '')
  if (/temperature/i.test(t)) return 'temperature'
  if (/response_format|json_object|responseMimeType/i.test(t)) return 'json'
  if (/thinking|reasoning|budget_tokens|thinkingBudget/i.test(t)) return 'thinking'
  if (/max_tokens|max_output_tokens|maxOutputTokens|too large/i.test(t)) return 'maxTokens'
  return null
}

/* ------------------------------------------------------------------ 单次调用 */

/**
 * 调一个模型，一次往返。
 * @returns {Promise<{content:string, reasoning:string, finish:string, usage:object, protocol:string, notes:string[], degraded:string[], ms:number}>}
 */
export async function callModel({ cfg, model, messages, layer, maxTokens, timeoutMs, resolveKey, onNote }) {
  const endpoint = findEndpoint(cfg, model.endpoint)
  if (!endpoint) throw new Error(`模型 ${model.id} 指向不存在的端点 ${model.endpoint}，先在设置里补上。`)

  const protocol = protocolOf(model, endpoint)
  const key = await resolveKey(endpoint)
  if (!key) {
    throw new Error(`端点 ${endpoint.id} 没有可用的密钥：在设置里填一次，或设置环境变量 ${endpoint.envKey || endpoint.apiKeyRef || endpoint.id}。`)
  }

  const params = mergeParams(model, layer)
  let budget = clampNumber(maxTokens ?? layer?.params?.maxTokens, 256, 128000, 4096)
  if (model.caps?.minOutputTokens) budget = Math.max(budget, model.caps.minOutputTokens)

  const notes = []
  const degraded = []
  const started = Date.now()

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rebuilt = buildRequest({ protocol, endpoint, model, key, messages, params, maxTokens: budget })
    for (const note of rebuilt.notes) if (!notes.includes(note)) notes.push(note)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? cfg.settings.timeoutMs)
    let response
    try {
      response = await fetch(rebuilt.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...rebuilt.headers },
        body: JSON.stringify(rebuilt.body),
        signal: controller.signal,
      })
    } catch (error) {
      clearTimeout(timer)
      if (error?.name === 'AbortError') throw new Error(`请求超时（${timeoutMs ?? cfg.settings.timeoutMs}ms）：${endpoint.id} / ${model.model}`)
      throw new Error(`连不上 ${endpoint.baseUrl}：${error?.message || error}`)
    }
    clearTimeout(timer)

    const text = await response.text()
    let json
    try {
      json = text ? JSON.parse(text) : {}
    } catch {
      json = undefined
    }

    if (!response.ok) {
      const message = errorText(protocol, json, text, response.status)
      const culprit = response.status >= 400 && response.status < 500 ? culpritParam(message) : null
      if (culprit && attempt < 3) {
        if (culprit === 'temperature') delete params.temperature
        else if (culprit === 'json') params.json = false
        else if (culprit === 'thinking') delete params.thinking
        else if (culprit === 'maxTokens') budget = Math.max(256, Math.floor(budget / 2))
        degraded.push(culprit === 'maxTokens' ? '预算减半' : culprit)
        onNote?.(`降级：${culprit}`)
        continue
      }
      throw new Error(message)
    }

    if (!json) throw new Error(`响应不是 JSON：${text.slice(0, 300)}`)
    const reply = parseReply(protocol, json)
    return { ...reply, protocol, notes, degraded, ms: Date.now() - started }
  }

  throw new Error('连续降级 4 次仍未成功，检查模型与参数是否匹配。')
}

/* ------------------------------------------------------------------ 审查 */

const VERDICT_SYSTEM = `你是审查者。判断下面的内容是否满足任务要求。
只输出一个 JSON 对象，形如 {"pass":true,"score":8,"issues":["…"]}，score 取 0-10。不要输出别的文字。`

function parseVerdict(text) {
  const raw = String(text || '')
  const match = raw.match(/\{[\s\S]*\}/)
  if (match) {
    try {
      const parsed = JSON.parse(match[0])
      const pass = parsed.pass === true || parsed.verdict === 'PASS'
      const score = typeof parsed.score === 'number' ? parsed.score : pass ? 8 : 4
      const issues = Array.isArray(parsed.issues) ? parsed.issues.map(String) : []
      return { pass: typeof parsed.pass === 'boolean' ? parsed.pass : pass, score, issues }
    } catch {
      /* 落到下面的关键词判断 */
    }
  }
  return { pass: /\bPASS\b/i.test(raw), score: /\bPASS\b/i.test(raw) ? 8 : 4, issues: raw ? [raw.slice(0, 400)] : [] }
}

/** 审查一段内容；超长时按 chunkChars 分段，合并结论。 */
export async function reviewWith({ cfg, model, task, content, timeoutMs, resolveKey }) {
  const limit = clampNumber(model.caps?.chunkChars, 400, 20000, 4000)
  const chunks = []
  if (content.length <= limit) chunks.push(content)
  else for (let i = 0; i < content.length; i += limit) chunks.push(content.slice(i, i + limit))

  const verdicts = []
  for (let i = 0; i < chunks.length; i += 1) {
    const head = chunks.length > 1 ? `（第 ${i + 1}/${chunks.length} 段）\n` : ''
    const result = await callModel({
      cfg,
      model,
      messages: [
        { role: 'system', content: VERDICT_SYSTEM },
        { role: 'user', content: `${head}任务：\n${task}\n\n待审内容：\n${chunks[i]}` },
      ],
      maxTokens: 2048,
      timeoutMs,
      resolveKey,
    })
    verdicts.push(parseVerdict(result.content))
  }

  const pass = verdicts.every((v) => v.pass)
  const score = Math.min(...verdicts.map((v) => v.score))
  const issues = verdicts.flatMap((v) => v.issues)
  return { pass, score, issues, segments: verdicts.length }
}

/* ------------------------------------------------------------------ 流水线 */

function renderTemplate(template, vars) {
  if (!template) return vars.output || vars.task || ''
  return String(template).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => (vars[key] == null ? '' : String(vars[key])))
}

function issuesBlock(issues) {
  if (!issues || !issues.length) return ''
  return `\n\n上一轮的具体问题（逐条修掉，不要重写无关部分）：\n${issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}`
}

/**
 * 按配置的层级顺序跑一次协同。
 * @returns {{output:string, steps:object[], rounds:number}}
 */
export async function runPipeline({ cfg, task, layers, timeoutMs, resolveKey, onStep }) {
  const order = (layers && layers.length
    ? layers.map((id) => cfg.layers.find((l) => l.id === id)).filter(Boolean)
    : cfg.layers.filter((l) => l.enabled !== false))

  if (!order.length) throw new Error('没有可执行的层级，先在设置里启用一层。')

  const vars = { task, plan: '', draft: '', output: '', issuesBlock: '' }
  const steps = []
  let rounds = 0
  let final = ''

  for (let index = 0; index < order.length; index += 1) {
    const layer = order[index]
    const model = findModel(cfg, layer.model)
    if (!model) throw new Error(`层级 ${layer.id} 指向不存在的模型 ${layer.model}`)

    if (layer.kind === 'review' || layer.kind === 'judge') {
      const content = final || vars.draft || vars.output
      if (!content) {
        steps.push({ layer: layer.id, kind: layer.kind, model: layer.model, skipped: '没有待审内容' })
        continue
      }
      const started = Date.now()
      const verdict = layer.kind === 'review'
        ? await reviewWith({ cfg, model, task, content, timeoutMs, resolveKey })
        : (() => {
            return callModel({
              cfg,
              model,
              messages: [
                { role: 'system', content: layer.system || VERDICT_SYSTEM },
                { role: 'user', content: renderTemplate(layer.template, { ...vars, draft: content }) },
              ],
              layer,
              timeoutMs,
              resolveKey,
            }).then((reply) => parseVerdict(reply.content))
          })()
      const settled = await verdict
      steps.push({
        layer: layer.id,
        kind: layer.kind,
        model: layer.model,
        pass: settled.pass,
        score: settled.score,
        issues: settled.issues,
        segments: settled.segments,
        ms: Date.now() - started,
      })
      onStep?.(steps[steps.length - 1])

      if (!settled.pass && layer.gate?.reworkTo) {
        const maxRounds = clampNumber(layer.gate.maxRounds, 0, 10, cfg.settings.maxRounds)
        const targetIndex = order.findIndex((l) => l.id === layer.gate.reworkTo)
        if (targetIndex >= 0 && rounds < maxRounds) {
          rounds += 1
          vars.issuesBlock = issuesBlock(settled.issues)
          index = targetIndex - 1
          continue
        }
      }
      continue
    }

    const started = Date.now()
    const messages = [
      ...(layer.system ? [{ role: 'system', content: layer.system }] : []),
      { role: 'user', content: renderTemplate(layer.template, vars) },
    ]
    const budget = layer?.params?.maxTokens || KIND_BUDGET[layer.kind] || 2000
    let reply = await callModel({ cfg, model, messages, layer, maxTokens: budget, timeoutMs, resolveKey })

    /* 思考模型可能把预算全花在 reasoning 上、正文一个字不剩：先加一倍预算重试一次，
       仍为空就报清楚是哪一层、哪个模型、钱花在哪了，而不是笼统说「没有产出」。 */
    if (!String(reply.content || '').trim() && reply.finish === 'length') {
      const retried = await callModel({
        cfg,
        model,
        messages,
        layer,
        maxTokens: Math.min(budget * 2, 32000),
        timeoutMs,
        resolveKey,
      })
      retried.degraded = [...(retried.degraded || []), `空正文重试(预算 ${budget}→${Math.min(budget * 2, 32000)})`]
      reply = retried
    }

    if (!String(reply.content || '').trim()) {
      const thought = reply.usage?.completion_tokens_details?.reasoning_tokens
      throw new Error(
        `层 ${layer.id}（${model.id} → ${model.model}）返回空正文：finish=${reply.finish}，output_tokens=${reply.usage?.completion_tokens ?? '?'}${thought ? `，其中思考 ${thought}` : ''}。在设置里把这一层的「最大输出」调大，或换一个不把预算全用在思考上的模型。`,
      )
    }

    if (layer.kind === 'plan') vars.plan = reply.content
    else vars.draft = reply.content
    vars.output = reply.content
    if (layer.kind === 'execute' || layer.kind === 'custom') final = reply.content

    const step = {
      layer: layer.id,
      kind: layer.kind,
      model: layer.model,
      protocol: reply.protocol,
      finish: reply.finish,
      usage: reply.usage,
      notes: [...reply.notes, ...reply.degraded.map((d) => `降级:${d}`)],
      chars: reply.content.length,
      ms: Date.now() - started,
    }
    steps.push(step)
    onStep?.(step)
  }

  if (!final) {
    const last = [...steps].reverse().find((s) => s.chars)
    final = vars.output || ''
    if (!final) {
      const seen = steps.map((s) => `${s.layer}(${s.kind})=${s.skipped ? '跳过:' + s.skipped : (s.chars ?? 0) + '字'}`).join('，')
      throw new Error(`整条流水线没有产出正文。各层情况：${seen || '没有执行任何层'}。检查是否有启用的执行层（kind=execute）。`)
    }
    if (last) last.final = true
  }

  return { output: final, steps, rounds }
}

/* ------------------------------------------------------------------ 体检 */

/** 逐个模型发一条最小请求，报告延迟与降级。 */
export async function doctor({ cfg, only, timeoutMs, resolveKey }) {
  const targets = only ? cfg.models.filter((m) => m.id === only) : cfg.models
  if (!targets.length) return [{ id: only || '(all)', ok: false, error: only ? `没有模型 ${only}` : '没有配置任何模型' }]

  const results = []
  for (const model of targets) {
    const started = Date.now()
    try {
      const reply = await callModel({
        cfg,
        model,
        messages: [{ role: 'user', content: '回一个字：ok' }],
        maxTokens: 16,
        timeoutMs: clampNumber(timeoutMs, 1000, 120000, 20000),
        resolveKey,
      })
      results.push({
        id: model.id,
        ok: true,
        protocol: reply.protocol,
        ms: Date.now() - started,
        degraded: reply.degraded,
        notes: reply.notes,
        sample: String(reply.content || '').trim().slice(0, 40),
      })
    } catch (error) {
      results.push({ id: model.id, ok: false, ms: Date.now() - started, error: String(error?.message || error) })
      await sleep(0)
    }
  }
  return results
}
