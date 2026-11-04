/**
 * `/tri-models` 的实现：逐个端点问服务商要模型清单。
 *
 * 单独放在这里是为了能脱离宿主测试——传一个假的 fetch 就能跑完所有分支
 * （200 / 404 / 401 / 非 JSON / 超时 / 缺密钥 / 超过 200 条）。
 */
import { buildModelsRequest, parseModels } from './protocols.js'

const MAX_LISTED = 200
const DEFAULT_TIMEOUT = 15000

const envNameOf = (endpoint) => endpoint.envKey || String(endpoint.id || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_')

/**
 * @param {object} options
 * @param {Array} options.endpoints  端点配置
 * @param {(endpoint: object) => Promise<string|undefined>} options.resolveKey  取密钥
 * @param {string} [options.only]  只看某个端点 id
 * @param {typeof fetch} [options.fetchImpl]  注入点，默认全局 fetch
 * @param {number} [options.timeoutMs]
 * @param {string} [options.namespace]  结果首行显示的 namespace
 * @returns {Promise<string>} 可直接贴进会话的纯文本
 */
export async function describeModels({ endpoints = [], resolveKey, only, fetchImpl, timeoutMs = DEFAULT_TIMEOUT, namespace = 'tri-model' }) {
  const call = fetchImpl || globalThis.fetch
  const targets = endpoints.filter((endpoint) => !only || endpoint.id === only)
  if (!targets.length) {
    const known = endpoints.map((endpoint) => endpoint.id).join('、') || '（无）'
    return `没有找到端点${only ? `「${only}」` : ''}。可用端点：${known}`
  }

  const lines = [`配置 namespace：${namespace} · 端点 ${endpoints.length}`]
  for (const endpoint of targets) {
    const protocol = endpoint.protocol || 'openai'
    const key = resolveKey ? await resolveKey(endpoint) : undefined
    if (!key) {
      lines.push('', `✗ ${endpoint.id} · ${protocol} · 没有可用密钥（先保存密钥或设置环境变量 ${envNameOf(endpoint)}）`)
      continue
    }

    const request = buildModelsRequest({ protocol, endpoint, key })
    const started = Date.now()
    try {
      const response = await call(request.url, {
        method: 'GET',
        headers: request.headers,
        signal: AbortSignal.timeout(timeoutMs),
      })
      const elapsed = Date.now() - started
      const body = await response.text()

      if (!response.ok) {
        lines.push('', `✗ ${endpoint.id} · ${protocol} · HTTP ${response.status}（${elapsed}ms）`)
        const detail = String(body || '').trim()
        lines.push(detail ? `  ${detail.slice(0, 220).replace(/\s+/g, ' ')}` : '  （服务商没有返回内容）')
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
      for (const id of ids.slice(0, MAX_LISTED)) lines.push(`  ${id}`)
      if (ids.length > MAX_LISTED) lines.push(`  …另有 ${ids.length - MAX_LISTED} 个`)
    } catch (error) {
      const message = String(error?.message || error)
      const timedOut = error?.name === 'TimeoutError' || /timed out|timeout/i.test(message)
      lines.push('', `✗ ${endpoint.id} · ${protocol} · ${timedOut ? `${timeoutMs}ms 内没有响应` : message.slice(0, 200)}`)
    }
  }
  return lines.join('\n')
}
