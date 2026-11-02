import Schema from '@deepseek-ai/schemastery'
import { PROTOCOLS, isProtocol } from './protocols.js'

/* ------------------------------------------------------------------ 默认配置 */

/** 首次启用时的起点：一个端点、三个模型、两层流水线。地址与模型名都只是占位，实际用设置面板改。 */
export const DEFAULT_ENDPOINTS = [
  {
    id: 'ark-plan',
    label: '火山方舟（plan v3）',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3',
    protocol: 'openai',
    apiKeyRef: 'tri-model.ark-plan',
  },
]

export const DEFAULT_MODELS = [
  { id: 'deepseek-flash', label: 'DeepSeek V4.1 Flash', model: 'DeepSeek-V4.1-Flash', endpoint: 'ark-plan' },
  { id: 'kimi-pro', label: 'Kimi K3.1 Pro', model: 'Kimi-K3.1-Pro', endpoint: 'ark-plan', caps: { temperature: 1 } },
  { id: 'glm-flash', label: 'GLM 5.3 Flash', model: 'GLM-5.3-Flash', endpoint: 'ark-plan', caps: { minOutputTokens: 12000 } },
]

export const DEFAULT_LAYERS = [
  {
    id: 'plan',
    kind: 'plan',
    model: 'kimi-pro',
    enabled: true,
    system: '你是规划者。把任务拆成可执行的步骤，指出风险与验收标准。不要写成品。',
    template: '{{task}}',
  },
  {
    id: 'draft',
    kind: 'execute',
    model: 'deepseek-flash',
    enabled: true,
    system: '你是执行者。按规划把成品写完整，直接给结果，不要复述要求。',
    template: '任务：\n{{task}}\n\n规划：\n{{plan}}',
  },
  {
    id: 'review',
    kind: 'review',
    model: 'glm-flash',
    enabled: true,
    system: '你是审查者。只挑真正的问题，能过就过。只输出 JSON。',
    template: '任务：\n{{task}}\n\n待审内容：\n{{draft}}',
    gate: { maxRounds: 2, reworkTo: 'draft' },
  },
]

/* ------------------------------------------------------------------ 配置结构 */

const Caps = Schema.object({
  temperature: Schema.any().description('温度：填数字由模型固定，unset 表示不发送'),
  thinking: Schema.boolean().description('模型是否支持思考预算'),
  json: Schema.boolean().description('模型是否支持 JSON 模式'),
  minOutputTokens: Schema.number().description('最小输出预算'),
  chunkChars: Schema.number().description('单次审查的字符上限，超过则分段'),
}).description('这个模型吃哪套参数')

const Endpoint = Schema.object({
  id: Schema.string().required().description('端点标识，模型靠它引用'),
  label: Schema.string().description('显示名'),
  baseUrl: Schema.string().required().description('接口地址；路径按协议自动追加'),
  protocol: Schema.union(PROTOCOLS).default('openai').description('openai / anthropic / gemini'),
  apiKeyRef: Schema.string().description('密钥存在 DSH 凭据库里时用的引用名'),
  apiKey: Schema.string().description('直接写密钥（不推荐，建议用 apiKeyRef）'),
  envKey: Schema.string().description('从环境变量读密钥时的变量名'),
  path: Schema.string().description('自定义请求路径，留空按协议默认'),
  headers: Schema.dict(Schema.string()).description('额外请求头'),
})

const Model = Schema.object({
  id: Schema.string().required().description('模型简称，层级的 model 指向它'),
  label: Schema.string().description('显示名'),
  model: Schema.string().required().description('真实模型名'),
  endpoint: Schema.string().required().description('所属端点'),
  protocol: Schema.union(PROTOCOLS).description('覆盖端点协议，留空跟随端点'),
  caps: Caps,
  extraBody: Schema.dict(Schema.any()).description('并入请求体的额外字段'),
})

const Layer = Schema.object({
  id: Schema.string().required().description('层级标识'),
  kind: Schema.union(['plan', 'execute', 'review', 'judge', 'route', 'custom']).default('custom'),
  model: Schema.string().required().description('这一层用哪个模型'),
  enabled: Schema.boolean().default(true),
  system: Schema.string().description('系统提示词'),
  template: Schema.string().description('用户消息模板，可用 {{task}} {{plan}} {{draft}} {{output}} {{issuesBlock}}'),
  target: Schema.string().description('route 层的目标'),
  gate: Schema.object({
    maxRounds: Schema.number().description('返工轮数上限'),
    reworkTo: Schema.string().description('返工回到哪一层'),
  }).description('门禁：审查不过时回到哪一层重做'),
  params: Schema.object({
    maxTokens: Schema.number(),
    temperature: Schema.number(),
    thinking: Schema.union(['enabled', 'disabled']),
    json: Schema.boolean(),
  }).description('这一层的生成参数'),
})

export const Config = Schema.object({
  endpoints: Schema.array(Endpoint).volatile().description('端点：地址、协议与密钥'),
  models: Schema.array(Model).volatile().description('模型：简称指向真实模型名'),
  layers: Schema.array(Layer).volatile().description('层级：按顺序执行'),
  settings: Schema.object({
    maxRounds: Schema.number().default(2).description('门禁返工的最大轮数'),
    timeoutMs: Schema.number().default(120000).description('单次请求超时'),
  }).volatile().description('全局设置'),
})

/* ------------------------------------------------------------------ 读取辅助 */

export function normalizeConfig(raw) {
  const cfg = raw || {}
  const endpoints = Array.isArray(cfg.endpoints) ? cfg.endpoints : []
  const models = Array.isArray(cfg.models) ? cfg.models : []
  const layers = Array.isArray(cfg.layers) ? cfg.layers : []
  return {
    endpoints: endpoints.map((ep) => ({ ...ep, protocol: isProtocol(ep.protocol) ? ep.protocol : 'openai' })),
    models: models.map((m) => ({ ...m })),
    layers: layers.map((l) => ({ ...l, enabled: l.enabled !== false })),
    settings: { maxRounds: 2, timeoutMs: 120000, ...(cfg.settings || {}) },
  }
}

export function findEndpoint(cfg, id) {
  return cfg.endpoints.find((ep) => ep.id === id)
}

export function findModel(cfg, id) {
  return cfg.models.find((m) => m.id === id)
}

/** 给工具输出用的可读摘要。 */
export function describeConfig(cfg) {
  const lines = []
  lines.push(`端点：${cfg.endpoints.length ? '' : '（空）'}`)
  for (const ep of cfg.endpoints) {
    lines.push(`  ${ep.id} [${ep.protocol || 'openai'}] ${ep.baseUrl}${ep.path ? ` path=${ep.path}` : ''} · 密钥 ${ep.apiKeyRef || (ep.envKey ? `env:${ep.envKey}` : ep.apiKey ? '明文' : '未配置')}`)
  }
  lines.push(`模型：${cfg.models.length ? '' : '（空）'}`)
  for (const m of cfg.models) {
    const flags = [`端点 ${m.endpoint}`]
    if (m.protocol) flags.push(`协议 ${m.protocol}`)
    if (m.caps?.temperature === 'unset') flags.push('不发送温度')
    if (m.caps?.thinking) flags.push('支持思考')
    lines.push(`  ${m.id} → ${m.model}${m.label ? `（${m.label}）` : ''} · ${flags.join(' · ')}`)
  }
  lines.push(`层级：${cfg.layers.length ? '' : '（空）'}`)
  cfg.layers.forEach((l, i) => {
    const gate = l.gate?.reworkTo ? ` · 门禁 FAIL→${l.gate.reworkTo}×${l.gate.maxRounds ?? cfg.settings.maxRounds}` : ''
    lines.push(`  ${i + 1}. ${l.id} (${l.kind}) → ${l.model}${l.enabled === false ? ' · 已停用' : ''}${gate}`)
  })
  return lines.join('\n')
}

/** 校验配置，返回问题列表；空列表表示可用。 */
export function validateConfig(cfg) {
  const problems = []
  if (!cfg.endpoints.length) problems.push('没有端点：先在设置里加一个地址、协议与密钥。')
  if (!cfg.layers.length) problems.push('没有层级：至少需要一个执行层。')
  const epIds = new Set(cfg.endpoints.map((ep) => ep.id))
  for (const ep of cfg.endpoints) {
    if (!ep.baseUrl) problems.push(`端点 ${ep.id} 缺少 baseUrl`)
    if (!isProtocol(ep.protocol) && ep.protocol) problems.push(`端点 ${ep.id} 的 protocol 非法：${ep.protocol}`)
  }
  const modelIds = new Set(cfg.models.map((m) => m.id))
  for (const m of cfg.models) {
    if (!epIds.has(m.endpoint)) problems.push(`模型 ${m.id} 指向不存在的端点 ${m.endpoint}`)
    if (!m.model) problems.push(`模型 ${m.id} 缺少真实模型名`)
  }
  for (const l of cfg.layers) {
    if (!modelIds.has(l.model)) problems.push(`层级 ${l.id} 指向不存在的模型 ${l.model}`)
  }
  const enabled = cfg.layers.filter((l) => l.enabled !== false)
  if (!enabled.length) problems.push('所有层级都停用了，跑起来什么也不会发生。')
  if (!enabled.some((l) => l.kind === 'execute' || l.kind === 'custom')) problems.push('没有执行层（kind=execute），流水线只会空转。')
  return problems
}
