/**
 * 协议适配层：把同一份「system + messages + 参数」翻译成不同厂商的线上请求，
 * 再把各自的响应折回统一结构。
 *
 * 为什么需要它：所谓「OpenAI 兼容」只是名义上的，原生 API 根本不认
 * /chat/completions 这套形状——Anthropic 用 /v1/messages，Gemini 用
 * models/{model}:generateContent，鉴权头、body 字段、思考开关、结束原因
 * 全都不一样。这些差异全部关在这个文件里，engine.mjs 只处理统一结构。
 *
 * 新增一家协议 = 在这里加一个分支，引擎与配置结构都不用动。
 */

/** 支持的协议。openai 指「OpenAI chat/completions 形状」，含所有兼容网关。 */
export const PROTOCOLS = ['openai', 'anthropic', 'gemini']

export const PROTOCOL_LABELS = {
  openai: 'OpenAI 兼容（/chat/completions）',
  anthropic: 'Anthropic Messages（/v1/messages）',
  gemini: 'Gemini generateContent',
}

export const isProtocol = (p) => PROTOCOLS.includes(p)

/**
 * 决定某个模型走哪种协议：模型级覆盖 > 端点级声明 > 默认 openai。
 * 模型级覆盖是为了「一个网关同时挂两种形状」的情况。
 */
export function protocolOf(model, endpoint) {
  const p = model?.protocol || endpoint?.protocol || 'openai'
  return isProtocol(p) ? p : 'openai'
}

/* ------------------------------------------------------------------ 工具 */

function trimSlash(u) {
  return String(u || '').replace(/\/+$/, '')
}

function joinUrl(baseUrl, suffix) {
  return trimSlash(baseUrl) + (String(suffix || '').startsWith('/') ? suffix : '/' + suffix)
}

/**
 * 构造「列出这个端点上有哪些模型」的请求（OpenAI 兼容的 GET /models）。
 * 只用来给用户在面板里挑 ID，不参与流水线调用。
 * @returns {{url:string, headers:object, protocol:string}}
 */
export function buildModelsRequest({ protocol, endpoint, key }) {
  const kind = isProtocol(protocol) ? protocol : 'openai'
  const base = endpoint?.baseUrl || ''
  if (kind === 'anthropic') {
    return {
      url: joinUrl(base, /\/(v1|v1beta)$/i.test(trimSlash(base)) ? '/models' : '/v1/models'),
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      protocol: kind,
    }
  }
  if (kind === 'gemini') {
    const suffix = /\/v1beta$/i.test(trimSlash(base)) || /\/v1$/i.test(trimSlash(base)) ? '/models' : '/v1beta/models'
    return {
      url: `${joinUrl(base, suffix)}${base.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`,
      headers: {},
      protocol: kind,
    }
  }
  return { url: joinUrl(base, '/models'), headers: { Authorization: `Bearer ${key}` }, protocol: kind }
}

/** 把 /models 的回包统一成 id 列表。 */
export function parseModels(protocol, json) {
  const kind = isProtocol(protocol) ? protocol : 'openai'
  if (kind === 'gemini') {
    return (Array.isArray(json?.models) ? json.models : [])
      .map((item) => String(item?.name || '').replace(/^models\//, ''))
      .filter(Boolean)
  }
  const list = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : []
  return list.map((item) => String(item?.id || item?.name || '')).filter(Boolean)
}

/** 把 messages 拆成 system 与对话轮次；非 system 只保留 user / assistant。 */
function splitMessages(messages = []) {
  const system = messages
    .filter((m) => m?.role === 'system')
    .map((m) => String(m.content ?? ''))
    .join('\n\n')
    .trim()
  const turns = messages
    .filter((m) => m?.role !== 'system')
    .map((m) => ({
      role: m?.role === 'assistant' ? 'assistant' : 'user',
      content: String(m?.content ?? ''),
    }))
    .filter((t) => t.content !== '')
  if (!turns.length) turns.push({ role: 'user', content: system || '（空）' })
  return { system, turns }
}

const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

/* ------------------------------------------------------------ 请求构造 */

/**
 * 构造一次真实的 HTTP 请求。
 * @returns {{url:string, headers:object, body:object, notes:string[]}}
 */
export function buildRequest({ protocol, endpoint, model, key, messages, params = {}, maxTokens }) {
  const notes = []
  const kind = isProtocol(protocol) ? protocol : 'openai'
  const baseUrl = endpoint?.baseUrl || ''
  const customPath = endpoint?.path
  const mt = num(maxTokens, 4096)

  if (kind === 'anthropic') {
    const base = trimSlash(baseUrl)
    const suffix = customPath || (/\/(v1|v1beta)$/i.test(base) ? '/messages' : '/v1/messages')
    const { system, turns } = splitMessages(messages)
    const body = {
      model: model.model,
      max_tokens: Math.max(1, Math.round(mt)),
      messages: turns.map((t) => ({ role: t.role, content: t.content })),
    }
    if (system) body.system = system

    const thinkingOn = params.thinking && params.thinking !== 'disabled'
    if (thinkingOn) {
      // Anthropic 要求 budget_tokens ≥ 1024 且严格小于 max_tokens；开思考时 temperature 必须为 1
      let budget = Math.min(16000, Math.max(1024, Math.floor(body.max_tokens / 2)))
      if (body.max_tokens <= budget) {
        budget = 1024
        body.max_tokens = Math.max(body.max_tokens, budget + 1024)
      }
      body.thinking = { type: 'enabled', budget_tokens: budget }
      if (params.temperature !== undefined) notes.push('开思考→temperature 固定 1')
    } else if (params.thinking === 'disabled') {
      body.thinking = { type: 'disabled' }
      if (params.temperature !== undefined) body.temperature = params.temperature
    } else if (params.temperature !== undefined) {
      body.temperature = params.temperature
    }
    if (params.json) notes.push('Anthropic 无 response_format，JSON 靠提示词约束')

    return {
      url: joinUrl(base, suffix),
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        ...(endpoint?.headers || {}),
      },
      body: { ...body, ...(model.extraBody || {}) },
      notes,
    }
  }

  if (kind === 'gemini') {
    const base = trimSlash(baseUrl)
    const suffix = customPath || `/models/${encodeURIComponent(model.model)}:generateContent`
    const { system, turns } = splitMessages(messages)
    const generationConfig = { maxOutputTokens: Math.max(1, Math.round(mt)) }
    if (params.temperature !== undefined) generationConfig.temperature = params.temperature
    if (params.json) generationConfig.responseMimeType = 'application/json'

    if (params.thinking === 'disabled') {
      generationConfig.thinkingConfig = { thinkingBudget: 0 }
    } else if (params.thinking) {
      generationConfig.thinkingConfig = { includeThoughts: true }
    }

    const body = {
      contents: turns.map((t) => ({
        role: t.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: t.content }],
      })),
      generationConfig,
    }
    if (system) body.systemInstruction = { parts: [{ text: system }] }

    return {
      url: joinUrl(base, suffix),
      headers: {
        'x-goog-api-key': key,
        ...(endpoint?.headers || {}),
      },
      body: { ...body, ...(model.extraBody || {}) },
      notes,
    }
  }

  /* --------------------------------------------------- OpenAI 兼容（默认） */
  const body = { model: model.model, messages, max_tokens: Math.max(1, Math.round(mt)), stream: false }
  if (params.temperature !== undefined) body.temperature = params.temperature
  if (params.json) body.response_format = { type: 'json_object' }
  if (params.thinking) body.thinking = { type: params.thinking }
  if (model.extraBody) Object.assign(body, model.extraBody)

  return {
    url: joinUrl(baseUrl, customPath || '/chat/completions'),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      ...(endpoint?.headers || {}),
    },
    body,
    notes,
  }
}

/* ------------------------------------------------------------ 响应解析 */

function mapAnthropicStop(reason) {
  switch (reason) {
    case 'max_tokens':
      return 'length'
    case 'end_turn':
    case 'stop_sequence':
      return 'stop'
    case 'tool_use':
      return 'tool_use'
    default:
      return reason || 'unknown'
  }
}

function mapGeminiFinish(reason) {
  switch (reason) {
    case 'MAX_TOKENS':
      return 'length'
    case 'STOP':
      return 'stop'
    case 'SAFETY':
    case 'RECITATION':
    case 'PROHIBITED_CONTENT':
      return 'content_filter'
    default:
      return reason ? String(reason).toLowerCase() : 'unknown'
  }
}

/**
 * 把各协议的响应折回统一结构。
 * @returns {{content:string, reasoning:string, finish:string, usage:object}}
 */
export function parseReply(protocol, json) {
  const kind = isProtocol(protocol) ? protocol : 'openai'

  if (kind === 'anthropic') {
    const blocks = Array.isArray(json?.content) ? json.content : []
    const content = blocks
      .filter((b) => b && (b.type === 'text' || (b.type === undefined && b.text)))
      .map((b) => String(b.text || ''))
      .join('')
      .trim()
    const reasoning = blocks
      .filter((b) => b && b.type === 'thinking')
      .map((b) => String(b.thinking || b.text || ''))
      .join('')
    const inTok = num(json?.usage?.input_tokens, 0)
    const outTok = num(json?.usage?.output_tokens, 0)
    return {
      content,
      reasoning,
      finish: mapAnthropicStop(json?.stop_reason),
      usage: {
        prompt_tokens: inTok,
        completion_tokens: outTok,
        total_tokens: inTok + outTok,
        completion_tokens_details: { reasoning_tokens: 0 },
      },
    }
  }

  if (kind === 'gemini') {
    const cand = json?.candidates?.[0]
    const parts = Array.isArray(cand?.content?.parts) ? cand.content.parts : []
    const content = parts
      .filter((p) => p && !p.thought)
      .map((p) => String(p.text || ''))
      .join('')
      .trim()
    const reasoning = parts
      .filter((p) => p && p.thought)
      .map((p) => String(p.text || ''))
      .join('')
    const um = json?.usageMetadata || {}
    const inTok = num(um.promptTokenCount, 0)
    const outTok = num(um.candidatesTokenCount, 0)
    return {
      content,
      reasoning,
      finish: mapGeminiFinish(cand?.finishReason),
      usage: {
        prompt_tokens: inTok,
        completion_tokens: outTok,
        total_tokens: num(um.totalTokenCount, inTok + outTok),
        completion_tokens_details: { reasoning_tokens: num(um.thoughtsTokenCount, 0) },
      },
    }
  }

  const choice = json?.choices?.[0]
  const message = choice?.message || {}
  const content = String(message.content || '').trim()
  return {
    content,
    reasoning: String(message.reasoning_content || message.reasoning || ''),
    finish: choice?.finish_reason || 'unknown',
    usage: json?.usage || {},
  }
}

/** 从错误响应里抠出人能看懂的文案，顺带认出是哪一家的格式。 */
export function errorText(protocol, json, text, status) {
  const kind = isProtocol(protocol) ? protocol : 'openai'
  const fromJson =
    json?.error?.message ||
    json?.error?.code ||
    (typeof json?.message === 'string' ? json.message : '') ||
    (Array.isArray(json?.error?.details) ? json.error.details.map((d) => d?.reason).filter(Boolean).join(' ') : '')
  const msg = String(fromJson || text || '').slice(0, 300)
  return `HTTP ${status} ${msg || '（无错误正文）'}${msg ? '' : ` [${kind}]`}`
}
