import { isProtocol } from './protocols.js'
import { findEndpoint, findModel } from './config.js'

const OPS_LABEL = {
  show: 'show',
  validate: 'validate',
  'set-endpoint': 'set-endpoint',
  'remove-endpoint': 'remove-endpoint',
  'add-model': 'add-model',
  'update-model': 'update-model',
  'remove-model': 'remove-model',
  'add-layer': 'add-layer',
  'update-layer': 'update-layer',
  'remove-layer': 'remove-layer',
  'move-layer': 'move-layer',
  'set-settings': 'set-settings',
  reset: 'reset',
}

export const ACTIONS = Object.keys(OPS_LABEL)

const clone = (value) => JSON.parse(JSON.stringify(value))

function coercePoint(value, where) {
  if (!isProtocol(value)) throw new Error(`${where} 的 protocol 非法：${value}，可选 openai / anthropic / gemini`)
  return value
}

function requireId(id, where) {
  if (typeof id !== 'string' || !id.trim()) throw new Error(`${where} 需要一个 id（端点 / 模型 / 层级的名字）`)
  return id.trim()
}

/**
 * 算出一批对配置文档的修改。
 * 只负责「改成什么」，不负责写：调用方决定写到哪里（设置文档）。
 * @returns {{ops: Array<{op:'set'|'unset', path:(string|number)[], value?:unknown}>, message: string}}
 */
export function applyConfigAction({ action, id, spec = {}, index, settings, current, defaults }) {
  if (!OPS_LABEL[action]) throw new Error(`未知动作：${action}，可选 ${ACTIONS.join(' / ')}`)

  const cfg = clone(current)

  if (action === 'reset') {
    return {
      ops: [
        { op: 'set', path: ['endpoints'], value: clone(defaults.endpoints) },
        { op: 'set', path: ['models'], value: clone(defaults.models) },
        { op: 'set', path: ['layers'], value: clone(defaults.layers) },
        { op: 'set', path: ['settings'], value: clone(defaults.settings) },
      ],
      message: '已恢复默认配置：一个占位端点、三个模型、规划→执行→审查三层。记得把地址与密钥换掉。',
    }
  }

  if (action === 'set-settings') {
    const patch = {}
    for (const key of ['maxRounds', 'timeoutMs']) {
      const value = settings?.[key] ?? spec?.[key]
      if (typeof value === 'number' && Number.isFinite(value)) patch[key] = value
    }
    if (!Object.keys(patch).length) throw new Error('set-settings 需要 {maxRounds} 或 {timeoutMs}，且必须是数字')
    return {
      ops: [{ op: 'set', path: ['settings'], value: { ...cfg.settings, ...patch } }],
      message: `已更新全局设置：${Object.entries(patch).map(([k, v]) => `${k}=${v}`).join('，')}`,
    }
  }

  if (action === 'set-endpoint') {
    const endpointId = requireId(id, 'set-endpoint')
    const next = cfg.endpoints.filter((ep) => ep.id !== endpointId)
    const existing = cfg.endpoints.find((ep) => ep.id === endpointId) || {}
    const merged = { ...existing, id: endpointId }

    if (spec.baseUrl !== undefined) merged.baseUrl = String(spec.baseUrl).trim()
    if (spec.protocol !== undefined) merged.protocol = coercePoint(spec.protocol, `端点 ${endpointId}`)
    if (spec.apiKey !== undefined) merged.apiKey = String(spec.apiKey)
    if (spec.apiKeyRef !== undefined) merged.apiKeyRef = String(spec.apiKeyRef)
    if (spec.envKey !== undefined) merged.envKey = String(spec.envKey)
    if (spec.label !== undefined) merged.label = String(spec.label)
    if (spec.path !== undefined) {
      const trimmed = String(spec.path).trim()
      if (trimmed) merged.path = trimmed
      else delete merged.path
    }
    if (spec.headers !== undefined) merged.headers = spec.headers

    if (!merged.baseUrl) throw new Error(`端点 ${endpointId} 缺少 baseUrl`)
    merged.protocol = merged.protocol || 'openai'
    next.push(merged)
    return {
      ops: [{ op: 'set', path: ['endpoints'], value: next }],
      message: `端点 ${endpointId} 已保存：${merged.baseUrl}（协议 ${merged.protocol}）`,
    }
  }

  if (action === 'remove-endpoint') {
    const endpointId = requireId(id, 'remove-endpoint')
    if (!findEndpoint(cfg, endpointId)) throw new Error(`没有端点 ${endpointId}`)
    const used = cfg.models.filter((m) => m.endpoint === endpointId).map((m) => m.id)
    if (used.length) throw new Error(`端点 ${endpointId} 还被这些模型用着：${used.join('、')}。先把它们删掉或换端点。`)
    return {
      ops: [{ op: 'set', path: ['endpoints'], value: cfg.endpoints.filter((ep) => ep.id !== endpointId) }],
      message: `端点 ${endpointId} 已删除`,
    }
  }

  if (action === 'add-model' || action === 'update-model') {
    const modelId = requireId(id, action)
    const existing = findModel(cfg, modelId)
    if (action === 'add-model' && existing) throw new Error(`模型 ${modelId} 已存在，改用 update-model`)
    if (action === 'update-model' && !existing) throw new Error(`没有模型 ${modelId}，改用 add-model`)

    const merged = { ...(existing || {}), id: modelId }
    if (spec.model !== undefined) merged.model = String(spec.model).trim()
    if (spec.endpoint !== undefined) {
      if (!findEndpoint(cfg, String(spec.endpoint))) throw new Error(`没有端点 ${spec.endpoint}`)
      merged.endpoint = String(spec.endpoint)
    }
    if (spec.label !== undefined) merged.label = String(spec.label)
    if (spec.protocol !== undefined) {
      if (spec.protocol === null || spec.protocol === '') delete merged.protocol
      else merged.protocol = coercePoint(spec.protocol, `模型 ${modelId}`)
    }
    if (spec.caps !== undefined) merged.caps = { ...(merged.caps || {}), ...spec.caps }
    if (spec.extraBody !== undefined) merged.extraBody = spec.extraBody

    if (!merged.model) throw new Error(`模型 ${modelId} 缺少真实模型名 model`)
    if (!merged.endpoint) throw new Error(`模型 ${modelId} 缺少端点 endpoint`)

    const next = cfg.models.filter((m) => m.id !== modelId)
    next.push(merged)
    return {
      ops: [{ op: 'set', path: ['models'], value: next }],
      message: `${action === 'add-model' ? '已新增' : '已更新'}模型 ${modelId} → ${merged.model}（端点 ${merged.endpoint}${merged.protocol ? `，协议 ${merged.protocol}` : ''}）`,
    }
  }

  if (action === 'remove-model') {
    const modelId = requireId(id, 'remove-model')
    if (!findModel(cfg, modelId)) throw new Error(`没有模型 ${modelId}`)
    const used = cfg.layers.filter((l) => l.model === modelId).map((l) => l.id)
    if (used.length) throw new Error(`模型 ${modelId} 还被这些层级用着：${used.join('、')}。先换掉它们。`)
    return {
      ops: [{ op: 'set', path: ['models'], value: cfg.models.filter((m) => m.id !== modelId) }],
      message: `模型 ${modelId} 已删除`,
    }
  }

  if (action === 'add-layer' || action === 'update-layer') {
    const layerId = requireId(id, action)
    const existing = cfg.layers.find((l) => l.id === layerId)
    if (action === 'add-layer' && existing) throw new Error(`层级 ${layerId} 已存在，改用 update-layer`)
    if (action === 'update-layer' && !existing) throw new Error(`没有层级 ${layerId}，改用 add-layer`)

    const merged = { ...(existing || { kind: 'custom', enabled: true }), id: layerId }
    if (spec.kind !== undefined) merged.kind = String(spec.kind)
    if (spec.model !== undefined) {
      if (!findModel(cfg, String(spec.model))) throw new Error(`没有模型 ${spec.model}`)
      merged.model = String(spec.model)
    }
    if (spec.enabled !== undefined) merged.enabled = Boolean(spec.enabled)
    if (spec.system !== undefined) merged.system = String(spec.system)
    if (spec.template !== undefined) merged.template = String(spec.template)
    if (spec.target !== undefined) merged.target = String(spec.target)
    if (spec.gate !== undefined) merged.gate = spec.gate
    if (spec.params !== undefined) merged.params = { ...(merged.params || {}), ...spec.params }

    if (!merged.model) throw new Error(`层级 ${layerId} 缺少模型 model`)

    const next = cfg.layers.filter((l) => l.id !== layerId)
    const at = typeof index === 'number' && Number.isFinite(index) ? Math.max(0, Math.min(next.length, index)) : next.length
    next.splice(at, 0, merged)
    return {
      ops: [{ op: 'set', path: ['layers'], value: next }],
      message: `${action === 'add-layer' ? '已新增' : '已更新'}层级 ${layerId}（${merged.kind}）→ ${merged.model}，位置 ${at + 1}/${next.length}`,
    }
  }

  if (action === 'remove-layer') {
    const layerId = requireId(id, 'remove-layer')
    if (!cfg.layers.some((l) => l.id === layerId)) throw new Error(`没有层级 ${layerId}`)
    return {
      ops: [{ op: 'set', path: ['layers'], value: cfg.layers.filter((l) => l.id !== layerId) }],
      message: `层级 ${layerId} 已删除`,
    }
  }

  if (action === 'move-layer') {
    const layerId = requireId(id, 'move-layer')
    const from = cfg.layers.findIndex((l) => l.id === layerId)
    if (from < 0) throw new Error(`没有层级 ${layerId}`)
    const to = Math.max(0, Math.min(cfg.layers.length - 1, Number(index) || 0))
    const next = cfg.layers.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return {
      ops: [{ op: 'set', path: ['layers'], value: next }],
      message: `层级 ${layerId} 移到了第 ${to + 1} 位`,
    }
  }

  throw new Error(`动作 ${action} 还没实现`)
}
