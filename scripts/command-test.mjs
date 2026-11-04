/**
 * 命令层自测：用假的 ctx 把 index.js 整个 apply 起来，然后真的去调 /tri、/tri-models
 * 的 handler，看返回值和排进会话的那条消息对不对。
 *   node scripts/command-test.mjs
 */
import { createServer } from 'node:http'

let failed = 0
const expect = (condition, label, extra = '') => {
  if (condition) console.log(`  ✓ ${label}`)
  else {
    failed += 1
    console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`)
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  if (url.pathname === '/o/models' && req.headers.authorization === 'Bearer k-local') {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ data: [{ id: 'alpha' }, { id: 'beta' }] }))
  }
  res.writeHead(404)
  res.end('')
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`

const config = {
  endpoints: [{ id: 'local', label: '本地', baseUrl: `${base}/o`, protocol: 'openai' }],
  models: [{ id: 'fast', model: 'alpha', endpoint: 'local' }],
  layers: [{ id: 'draft', kind: 'execute', model: 'fast' }],
  settings: { maxRounds: 2, timeoutMs: 20000 },
}

const tools = []
const commands = []
const ctx = {
  tools: { register: (tool) => tools.push(tool) },
  commands: { register: (command) => commands.push(command) },
  effect: (fn) => {
    const cleanup = fn()
    return typeof cleanup === 'function' ? cleanup : () => {}
  },
  on: () => () => {},
  get: (name) => {
    if (name === 'settings') {
      return {
        describe: async () => [{ ns: 'tri-model', value: config }],
        mutate: async () => {},
        configure: () => {},
      }
    }
    if (name === 'credentials') return { resolve: async () => ({ value: 'k-local' }) }
    return undefined
  },
  settings: { describe: async () => [{ ns: 'tri-model', value: config }], get: () => undefined },
  credentials: { resolve: async () => ({ value: 'k-local' }) },
  settingsService: { configure: () => {} },
  logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}

const host = await import('../index.js')
await host.apply(ctx, {})

const find = (name) => commands.find((command) => command.name === name)
const fakeAgent = () => {
  const sent = []
  return { sent, followup: (message) => sent.push(message) }
}

try {
  console.log('命令注册与 handler：')

  expect(['tri', 'tri-doctor', 'tri-models'].every((name) => find(name)), '三条命令都注册了', commands.map((c) => c.name).join(','))
  expect(tools.map((tool) => tool.name).join(',') === 'tri_run,tri_review,tri_config,tri_doctor', '四个工具都在', tools.map((tool) => tool.name).join(','))

  /* /tri 不带参数 → 用法说明，不排进会话 */
  const tri = find('tri')
  let agent = fakeAgent()
  let result = await tri.handler({ rawInput: '', agent })
  expect(result.kind === 'success' && result.text.includes('用法'), '/tri 空参数给用法', result.text)
  expect(agent.sent.length === 0, '/tri 空参数不排进会话')

  /* /tri 带任务 → 排进会话，且原任务原样保留 */
  agent = fakeAgent()
  result = await tri.handler({ rawInput: '写一段 200 字简介', agent })
  expect(result.kind === 'success' && result.text.includes('已排进队列'), '/tri 带任务返回排队提示', result.text)
  expect(agent.sent.length === 1, '/tri 排进一条消息')
  const queued = agent.sent[0]?.content?.[0]?.text || ''
  expect(queued.includes('写一段 200 字简介'), '/tri 任务原文进了消息', queued)
  expect(agent.sent[0]?.source?.kind === 'tri-model' && agent.sent[0]?.role === 'user', '/tri 消息是 user + 插件自己的 source')

  /* /tri-models → 真的打本地 /models，并排进会话 */
  const models = find('tri-models')
  agent = fakeAgent()
  result = await models.handler({ rawInput: '', agent })
  expect(result.kind === 'success' && result.text.includes('已拉取'), '/tri-models 返回排队提示', result.text)
  const brief = agent.sent[0]?.content?.[0]?.text || ''
  expect(brief.includes('✓ local · openai · 2 个模型'), '/tri-models 结果贴进会话', brief)
  expect(brief.includes('alpha') && brief.includes('beta'), '/tri-models 带上模型 ID')
  expect(brief.includes('/tri-doctor'), '/tri-models 提示下一步复核')

  /* 拿不到 agent → 同步把结果作为命令输出 */
  result = await models.handler({ rawInput: 'local' })
  expect(result.kind === 'success' && result.text.includes('✓ local'), '没有会话通路时同步输出', result.text)

  /* 端点 id 写错 → 明确说没找到 */
  result = await models.handler({ rawInput: 'nope' })
  expect(result.text.includes('没有找到端点「nope」'), '端点 id 写错有提示', result.text)

  /* /tri-doctor 对本地假端点：/chat/completions 没实现，应报不可用而不是崩 */
  const doctorCmd = find('tri-doctor')
  result = await doctorCmd.handler({ rawInput: 'fast' })
  expect(result.kind === 'success' && result.text.includes('fast'), '/tri-doctor 能跑完并给结果', result.text)
  expect(/✗|✓/.test(result.text), '/tri-doctor 结果带状态标记')
} finally {
  server.close()
}

console.log(failed ? `\nCOMMAND TEST FAIL（${failed} 项）` : '\nCOMMAND TEST PASS')
process.exit(failed ? 1 : 0)
