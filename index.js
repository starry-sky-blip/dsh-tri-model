import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { Config, DEFAULT_ENDPOINTS, DEFAULT_MODELS, DEFAULT_LAYERS, describeConfig, findEndpoint, normalizeConfig, validateConfig } from './lib/config.js'
import { doctor, reviewWith, runPipeline } from './lib/engine.js'
import { ACTIONS, applyConfigAction } from './lib/ops.js'
import { buildModelsRequest, parseModels } from './lib/protocols.js'

export { Config }

/** Loader 里的行 id，同时也是设置文档里的 namespace。 */
const NS = 'tri-model'

const DEFAULTS = {
  endpoints: DEFAULT_ENDPOINTS,
  models: DEFAULT_MODELS,
  layers: DEFAULT_LAYERS,
  settings: { maxRounds: 2, timeoutMs: 120000 },
}

export const inject = ['tools', 'commands']

/* ------------------------------------------------------------------ 密钥 */

const envName = (endpoint) => endpoint.envKey || endpoint.id.toUpperCase().replace(/[^A-Z0-9]+/g, '_')

/** 兼容老配置：CodeBuddy 那份 tri-model/config.json 里的明文或 env:/file: 写法。 */
async function fromLegacyConfig(endpointId) {
  try {
    const file = join(homedir(), '.codebuddy', 'tri-model', 'config.json')
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    const raw = parsed?.endpoints?.[endpointId]?.apiKey
    if (typeof raw !== 'string' || !raw.trim()) return undefined
    if (raw.startsWith('env:')) return process.env[raw.slice(4).trim()] || undefined
    if (raw.startsWith('file:')) {
      const [path, field] = raw.slice(5).split('#')
      const text = await readFile(path.replace(/^~/, homedir()).trim(), 'utf8')
      if (!field) return text.trim() || undefined
      const body = JSON.parse(text)
      return body?.[field.trim()] ? String(body[field.trim()]) : undefined
    }
    return raw.trim()
  } catch {
    return undefined
  }
}

/* ------------------------------------------------------------------ 插件 */

export function apply(ctx, config) {
  const boot = normalizeConfig(config)

  const resolveKey = async (endpoint) => {
    if (endpoint.apiKey) return endpoint.apiKey
    const credentials = ctx.get('credentials')
    if (credentials) {
      try {
        const resolved = await credentials.resolve(endpoint.apiKeyRef || `tri-model.${endpoint.id}`)
        if (resolved?.value) return resolved.value
      } catch {
        /* 凭据服务不可用时继续往下找 */
      }
    }
    const ambient = process.env[envName(endpoint)]
    if (ambient) return ambient
    return fromLegacyConfig(endpoint.id)
  }

  /** 每次工具调用都重新读一遍配置：设置面板改完不必重启。 */
  const readConfig = async () => {
    const settings = ctx.get('settings')
    if (settings) {
      try {
        const rows = await settings.describe()
        const row = Array.isArray(rows) ? rows.find((item) => item?.ns === NS) : undefined
        if (row?.value) return normalizeConfig(row.value)
      } catch {
        /* 退回启动时的配置 */
      }
    }
    return normalizeConfig(boot)
  }

  const writeOps = async (ops) => {
    const settings = ctx.get('settings')
    if (!settings?.mutate) throw new Error('当前部署没有暴露设置服务，配置只能在设置面板里改。')
    await settings.mutate(NS, ops)
  }

  const textOutput = (schema = { type: 'string' }) => ({
    schema,
    render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
  })

  /* 自带设置页，就别再让通用表单重复铺一遍。 */
  const settingsService = ctx.get('settings')
  if (settingsService?.configure) {
    ctx.effect(() => settingsService.configure({ auto: false }), 'tri-model: page policy')
  }

  /* ---------------------------------------------------------------- tri_run */

  /**
   * 输出详略跟随宿主设置：`ui-chat.transcriptView` 是 detailed 时才附过程，
   * 其余（compact/简洁档、以及用户没显式选过）只给成品。设置读不到就按详细处理。
   */
  const wantsProcess = () => {
    try {
      const rows = ctx.get('settings')?.describe?.() || []
      const view = rows.find((row) => row?.ns === 'ui-chat')?.value?.transcriptView
      if (typeof view === 'string' && view && view !== 'detailed') return false
    } catch {}
    return true
  }

  /** 跑一轮流水线并排版结果：工具与 /tri 命令共用同一段逻辑。 */
  const runTask = async (task, layers, verbose = true) => {
    const cfg = await readConfig()
    const problems = validateConfig(cfg)
    if (problems.length) throw new Error(`配置还不能跑：\n- ${problems.join('\n- ')}`)
    const result = await runPipeline({
      cfg,
      task: String(task || ''),
      layers: Array.isArray(layers) ? layers : undefined,
      resolveKey,
    })

    const lines = [`## 成品\n\n${result.output}`]
    if (!verbose) return lines[0]
    lines.push(`\n---\n\n### 过程\n`)
    for (const step of result.steps) {
      if (step.skipped) {
        lines.push(`- ${step.layer}（${step.kind}）· ${step.model} · 跳过：${step.skipped}`)
        continue
      }
      if (step.pass !== undefined) {
        lines.push(`- ${step.layer}（${step.kind}）· ${step.model} · ${step.pass ? 'PASS' : 'FAIL'} ${step.score}/10${step.issues?.length ? ` · ${step.issues.length} 个问题` : ''} · ${step.ms}ms`)
        continue
      }
      lines.push(`- ${step.layer}（${step.kind}）· ${step.model} · ${step.protocol} · ${step.chars} 字 · ${step.ms}ms${step.notes?.length ? ` · ${step.notes.join('、')}` : ''}`)
    }
    if (result.rounds) lines.push(`- 返工轮次：${result.rounds}`)
    return lines.join('\n')
  }

  ctx.tools.register({
    name: 'tri_run',
    description:
      '用配置好的层级流水线完成一个任务：规划 → 执行 → 审查 → 自动返工。层级、模型、地址、密钥与协议（openai / anthropic / gemini）都来自 DSH 设置里的「多模型协同」，不用在任务里重复。',
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string', description: '要完成的完整任务：目标、约束、交付形态。' },
        layers: {
          type: 'array',
          items: { type: 'string' },
          description: '只跑指定层级 id（按配置顺序执行）。省略则跑所有启用的层级。',
        },
      },
      required: ['task'],
    },
    output: textOutput(),
    execute: async (args) => runTask(args.task, args.layers),
  })

  /* ------------------------------------------------------------- tri_review */

  ctx.tools.register({
    name: 'tri_review',
    description: '只审不改：把内容交给审查层模型判定 PASS/FAIL、打分并列出具体问题。支持超长内容自动分段。',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: '待审内容。' },
        task: { type: 'string', description: '这份内容本来要满足什么要求（审查依据）。' },
        reviewer: { type: 'string', description: '审查模型 id，省略时用第一个启用的审查层。' },
      },
      required: ['content'],
    },
    output: textOutput(),
    execute: async (args) => {
      const cfg = await readConfig()
      const reviewLayer = cfg.layers.find((layer) => layer.kind === 'review' && layer.enabled !== false)
      const modelId = args.reviewer || reviewLayer?.model
      const model = cfg.models.find((item) => item.id === modelId)
      if (!model) throw new Error(`没有可用的审查模型：配置里既没有启用的审查层，也不存在模型 ${modelId || '(未指定)'}。`)

      const verdict = await reviewWith({ cfg, model, task: String(args.task || '（未提供，按常识判断）'), content: String(args.content || ''), resolveKey })
      const lines = [
        `结论：**${verdict.pass ? 'PASS' : 'FAIL'}** · ${verdict.score}/10 · ${verdict.segments} 段 · 模型 ${model.id}`,
      ]
      if (verdict.issues.length) {
        lines.push('\n问题：')
        verdict.issues.forEach((issue, index) => lines.push(`${index + 1}. ${issue}`))
      } else {
        lines.push('\n没有列出问题。')
      }
      return lines.join('\n')
    },
  })

  /* ------------------------------------------------------------- tri_config */

  ctx.tools.register({
    name: 'tri_config',
    description:
      '读写「多模型协同」的配置：端点（地址、密钥引用、协议）、模型、层级与全局设置。' +
      `动作：${ACTIONS.join(' / ')}。用户也可以直接在 DSH 设置面板里改，两条路写的是同一份配置。`,
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ACTIONS, description: '要做什么。' },
        id: { type: 'string', description: '端点 / 模型 / 层级的 id。' },
        spec: { type: 'object', description: '新增或更新的字段。端点：{baseUrl, protocol, apiKey, apiKeyRef, envKey, path, label, headers}；模型：{model, endpoint, protocol, label, caps, extraBody}；层级：{kind, model, enabled, system, template, target, gate, params}。' },
        index: { type: 'number', description: 'add-layer / move-layer 的目标位置（从 0 开始）。' },
        settings: { type: 'object', description: 'set-settings 用：{maxRounds, timeoutMs}。' },
      },
      required: ['action'],
    },
    output: textOutput(),
    execute: async (args) => {
      const cfg = await readConfig()
      if (args.action === 'show' || args.action === 'validate') {
        const problems = validateConfig(cfg)
        const head = args.action === 'show'
          ? `配置（设置文档 namespace：${NS}）\n\n${describeConfig(cfg)}`
          : `校验结果：${problems.length ? '有问题' : '通过'}`
        return problems.length ? `${head}\n\n问题：\n- ${problems.join('\n- ')}` : head
      }

      const outcome = applyConfigAction({
        action: String(args.action),
        id: args.id,
        spec: args.spec || {},
        index: args.index,
        settings: args.settings,
        current: cfg,
        defaults: DEFAULTS,
      })
      await writeOps(outcome.ops)
      return outcome.message
    },
  })

  /* ------------------------------------------------------------- tri_doctor */

  /** doctor 结果的纯文本表：tri_doctor 工具与 /tri-doctor 命令共用一份格式。 */
  const doctorLines = (cfg, results) => {
    const lines = [`配置 namespace：${NS} · 端点 ${cfg.endpoints.length} · 模型 ${cfg.models.length} · 层级 ${cfg.layers.length}`, '']
    for (const row of results) {
      if (row.ok) {
        const extra = [row.degraded?.length ? `降级:${row.degraded.join(',')}` : '', row.notes?.length ? row.notes.join(',') : ''].filter(Boolean).join(' · ')
        lines.push(`✓ ${row.id} · ${row.protocol} · ${row.ms}ms${extra ? ` · ${extra}` : ''} · 回包「${row.sample}」`)
      } else {
        lines.push(`✗ ${row.id} · ${row.ms == null ? '—' : `${row.ms}ms`} · ${row.error}`)
      }
    }
    const okCount = results.filter((row) => row.ok).length
    lines.push('', `${okCount}/${results.length} 个模型可用。`)
    return lines.join('\n')
  }

  ctx.tools.register({
    name: 'tri_doctor',
    description: '连通性自检：对配置里的每个模型发一条最小请求，报告地址、协议、延迟、降级情况与错误。装好或改完配置先跑这个。',
    parameters: {
      type: 'object',
      properties: {
        model: { type: 'string', description: '只测某个模型 id，省略则测全部。' },
      },
      required: [],
    },
    output: textOutput(),
    execute: async (args) => {
      const cfg = await readConfig()
      const results = await doctor({ cfg, only: args.model, resolveKey })
      return doctorLines(cfg, results)
    },
  })

  /* ------------------------------------------------------------ /tri 命令 */
  /*
   * 命令结果是一个 `command/done` 事件，不属于对话消息，所以用户看不见、也追问不了。
   * 所以这里把任务排进当前会话队列，由主 agent 调 tri_run 跑一遍：结果是正常的一轮
   * 对话，能进上下文、能看到工具卡、能中途取消。
   */

  /*
   * 消息就地造：宿主的 `createUserMessage` 实现就是
   * `{ ...input, role: 'user', id: randomUUID() }`。不 import 它是因为本插件用
   * junction 挂在 profile 外（D:\浏览器安装\deepseek\dsh-plugins\tri-model），
   * 宿主只为 profile 内的模块解析 `@deepseek-ai/*`，从软链真身那边 import 会
   * ERR_MODULE_NOT_FOUND，整个插件装载失败。
   */
  const userMessage = (text) => ({
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'tri-model' },
  })

  /** 把一句话排进当前会话，作为下一轮用户输入。返回是否排进去了。 */
  const queuePrompt = async (agent, text) => {
    if (typeof agent?.followup !== 'function') return false
    try {
      agent.followup(userMessage(text))
      return true
    } catch {
      return false
    }
  }

  const commands = ctx.commands
  if (commands?.register) {
    ctx.effect(
      () =>
        commands.register({
          name: 'tri',
          description: '把一句话交给多模型流水线：规划 → 执行 → 审查 → 自动返工',
          input: { hint: '要完成的任务，例如：给 X 写一份 800 字方案，必须包含预算表' },
          handler: async (invocation) => {
            const task = String(invocation?.rawInput || '').trim()
            if (!task) {
              return { kind: 'success', text: '用法：`/tri <任务>`，例如 `/tri 给 tri-model 写一段 200 字的项目简介`。\n\n配置在设置 → 「多模型协同」里改；想先验证连通性，直接跟 agent 说「跑一下 tri_doctor」。' }
            }

            const brief = [
              '调用 `tri_run` 完成下面这个任务，`task` 参数用原文，不要自己改写或代写。',
              '',
              task,
              '',
              '（用户用 `/tri` 提交的。拿到结果把成品原样贴出来，过程照常附在后面。）',
            ].join('\n')

            if (await queuePrompt(invocation?.agent, brief)) {
              return { kind: 'success', text: '已排进队列，流水线的结果会作为下一轮对话出现在这里。' }
            }

            /* 拿不到会话通路时退回同步执行：至少把结果给出来。 */
            try {
              return { kind: 'success', text: await runTask(task, undefined, wantsProcess()) }
            } catch (error) {
              return { kind: 'error', text: String(error?.message || error) }
            }
          },
        }),
      'tri-model: /tri command',
    )

    /*
     * 设置面板做不了「测试连接」：客户端的网络请求会被 CORS 挡住，宿主也没有给客户端
     * 暴露任意 RPC。于是把连通性自检做成命令，跑完直接贴进会话——同样是「点一下就知道
     * 密钥通不通」，只是入口从按钮挪到了输入框。
     */
    ctx.effect(
      () =>
        commands.register({
          name: 'tri-doctor',
          description: '连通性自检：逐个模型发一条最小请求，把延迟表贴进当前会话',
          input: { hint: '可留空测全部，或填一个模型 id 只测它' },
          handler: async (invocation) => {
            const only = String(invocation?.rawInput || '').trim() || undefined
            let text
            try {
              const cfg = await readConfig()
              text = doctorLines(cfg, await doctor({ cfg, only, resolveKey }))
            } catch (error) {
              return { kind: 'error', text: String(error?.message || error) }
            }

            const brief = [
              '这是我刚跑的多模型协同连通性自检（`/tri-doctor`）结果，请原样贴出来，不要改写表格：',
              '',
              '```',
              text,
              '```',
            ].join('\n')

            if (await queuePrompt(invocation?.agent, brief)) {
              return { kind: 'success', text: '自检完成，结果会作为下一轮对话出现在这里。' }
            }
            return { kind: 'success', text }
          },
        }),
      'tri-model: /tri-doctor command',
    )

    /*
     * 面板里那些「候选模型 ID」不能靠猜。让用户在自己的端点上直接问服务商要列表，
     * 比插件内置一张会过期的表可靠。
     */
    ctx.effect(
      () =>
        commands.register({
          name: 'tri-models',
          description: '列出某个端点上有哪些模型 ID（问服务商的 /models），把结果贴进会话',
          input: { hint: '可留空列全部端点，或填端点 id 只看它，例如 ark-plan' },
          handler: async (invocation) => {
            const only = String(invocation?.rawInput || '').trim() || undefined
            let text
            try {
              const cfg = await readConfig()
              text = await modelLines(cfg, only)
            } catch (error) {
              return { kind: 'error', text: String(error?.message || error) }
            }

            const brief = [
              '这是我刚拉取的多模型协同端点模型清单（`/tri-models`）结果，请原样贴出来，不要改写：',
              '',
              '```',
              text,
              '```',
              '',
              '然后把设置 → 「多模型协同」里各模型的「真实模型名」改成本清单里存在的 ID，改完在本会话发 `/tri-doctor` 复核。',
            ].join('\n')

            if (await queuePrompt(invocation?.agent, brief)) {
              return { kind: 'success', text: '已拉取，清单会作为下一轮对话出现在这里。' }
            }
            return { kind: 'success', text }
          },
        }),
      'tri-model: /tri-models command',
    )
  }

  /** 逐个端点问服务商要模型清单；不支持 /models 的端点如实说明。 */
  async function modelLines(cfg, only) {
    const targets = cfg.endpoints.filter((endpoint) => !only || endpoint.id === only)
    if (!targets.length) return `没有找到端点${only ? `「${only}」` : ''}。可用端点：${cfg.endpoints.map((e) => e.id).join('、') || '（无）'}`

    const lines = [`配置 namespace：${NS} · 端点 ${cfg.endpoints.length}`]
    for (const endpoint of targets) {
      const protocol = endpoint.protocol || 'openai'
      const key = await resolveKey(endpoint)
      if (!key) {
        lines.push('', `✗ ${endpoint.id} · ${protocol} · 没有可用密钥（先保存密钥或设置环境变量 ${envName(endpoint)}）`)
        continue
      }

      const request = buildModelsRequest({ protocol, endpoint, key })
      const started = Date.now()
      try {
        const response = await fetch(request.url, {
          method: 'GET',
          headers: request.headers,
          signal: AbortSignal.timeout(15000),
        })
        const elapsed = Date.now() - started
        const body = await response.text()
        if (!response.ok) {
          lines.push('', `✗ ${endpoint.id} · ${protocol} · HTTP ${response.status}（${elapsed}ms）`)
          const detail = body.trim()
          if (detail) lines.push(`  ${detail.slice(0, 220).replace(/\s+/g, ' ')}`)
          else lines.push('  （服务商没有返回内容）')
          if (response.status === 404) lines.push('  该端点没有 /models 接口，去服务商文档核对模型 ID。')
          if (response.status === 401 || response.status === 403) lines.push('  密钥对不上这个端点，先确认密钥属于这家服务商。')
          continue
        }
        let json
        try {
          json = JSON.parse(body)
        } catch {
          lines.push('', `✗ ${endpoint.id} · ${protocol} · 回包不是 JSON（${elapsed}ms）`)
          continue
        }
        const ids = parseModels(protocol, json)
        lines.push('', `✓ ${endpoint.id} · ${protocol} · ${ids.length} 个模型（${elapsed}ms）`)
        if (!ids.length) lines.push('  接口可用但没返回模型，检查密钥权限。')
        for (const id of ids.slice(0, 200)) lines.push(`  ${id}`)
        if (ids.length > 200) lines.push(`  …另有 ${ids.length - 200} 个`)
      } catch (error) {
        lines.push('', `✗ ${endpoint.id} · ${protocol} · ${String(error?.message || error).slice(0, 200)}`)
      }
    }
    return lines.join('\n')
  }
}
