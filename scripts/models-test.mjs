/**
 * /tri-models 的自测：起一个本地 HTTP 服务，把 describeModels 的每条分支都走一遍。
 * 不碰外网、不碰真实密钥。
 *   node scripts/models-test.mjs
 */
import { createServer } from 'node:http'
import { describeModels } from '../lib/models.js'

let failed = 0
const expect = (condition, label, extra = '') => {
  if (condition) {
    console.log(`  ✓ ${label}`)
  } else {
    failed += 1
    console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`)
  }
}

const many = Array.from({ length: 230 }, (_, i) => ({ id: `m-${i}` }))

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const send = (status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers })
    res.end(typeof body === 'string' ? body : JSON.stringify(body))
  }

  // openai 兼容：GET /o/models，校验 Bearer
  if (url.pathname === '/o/models') {
    if (req.headers.authorization !== 'Bearer k-openai') return send(401, { error: 'bad key' })
    return send(200, { data: [{ id: 'alpha' }, { id: 'beta' }] })
  }
  // gemini：GET /g/v1beta/models?key=
  if (url.pathname === '/g/v1beta/models') {
    if (url.searchParams.get('key') !== 'k-gemini') return send(401, { error: 'bad key' })
    return send(200, { models: [{ name: 'models/gem-a' }, { name: 'models/gem-b' }] })
  }
  // anthropic：GET /anth/v1/models，校验 x-api-key
  if (url.pathname === '/anth/v1/models') {
    if (req.headers['x-api-key'] !== 'k-anthropic') return send(401, { error: 'bad key' })
    return send(200, { data: [{ id: 'claude-x' }] })
  }
  // 没有 /models（火山方舟 plan 入口的真实表现）
  if (url.pathname === '/p/models') return send(404, '')
  // 401 且有正文
  if (url.pathname === '/deny/models') return send(401, { error: { message: 'AuthenticationError' } })
  // 200 但不是 JSON
  if (url.pathname === '/html/models') return send(200, '<html>nope</html>', { 'content-type': 'text/html' })
  // 200 但空列表
  if (url.pathname === '/empty/models') return send(200, { data: [] })
  // 230 条 → 触发「另有 N 个」
  if (url.pathname === '/many/models') return send(200, { data: many })
  // 慢响应 → 触发超时分支
  if (url.pathname === '/slow/models') {
    setTimeout(() => send(200, { data: [{ id: 'late' }] }), 1500)
    return
  }
  send(404, '')
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const keys = {
  o: 'k-openai',
  g: 'k-gemini',
  anth: 'k-anthropic',
  p: 'k-plan',
  deny: 'k-deny',
  html: 'k-html',
  empty: 'k-empty',
  many: 'k-many',
  slow: 'k-slow',
  nokey: undefined,
}
const endpoint = (id, path, protocol = 'openai') => ({ id, baseUrl: `${base}/${path}`, protocol })
const resolveKey = async (ep) => keys[ep.id]

try {
  console.log('describeModels 分支：')

  /* 1. openai 正常回包 */
  let text = await describeModels({ endpoints: [endpoint('o', 'o')], resolveKey })
  expect(text.includes('✓ o · openai · 2 个模型'), 'openai 200 统计数量', text)
  expect(text.includes('  alpha') && text.includes('  beta'), 'openai 列出每个 ID')

  /* 2. gemini 走 ?key= 并剥掉 models/ 前缀 */
  text = await describeModels({ endpoints: [endpoint('g', 'g', 'gemini')], resolveKey })
  expect(text.includes('  gem-a') && text.includes('  gem-b'), 'gemini 解析 models[].name', text)
  expect(!text.includes('models/gem-a'), 'gemini 前缀已剥离')

  /* 3. anthropic 走 x-api-key */
  text = await describeModels({ endpoints: [endpoint('anth', 'anth', 'anthropic')], resolveKey })
  expect(text.includes('✓ anth · anthropic · 1 个模型'), 'anthropic 鉴权通过', text)
  expect(text.includes('  claude-x'), 'anthropic 列出 ID')

  /* 4. 404 + 空回包（ark-plan 的真实情况） */
  text = await describeModels({ endpoints: [endpoint('p', 'p')], resolveKey })
  expect(text.includes('✗ p · openai · HTTP 404'), '404 记下行', text)
  expect(text.includes('（服务商没有返回内容）'), '404 空回包有兜底文案', text)
  expect(text.includes('该端点没有 /models 接口'), '404 给出可操作提示', text)

  /* 5. 401 带正文 */
  text = await describeModels({ endpoints: [endpoint('deny', 'deny')], resolveKey })
  expect(text.includes('HTTP 401'), '401 记下行', text)
  expect(text.includes('AuthenticationError'), '401 带上服务商原文')
  expect(text.includes('密钥对不上这个端点'), '401 给出可操作提示')

  /* 6. 200 但不是 JSON */
  text = await describeModels({ endpoints: [endpoint('html', 'html')], resolveKey })
  expect(text.includes('回包不是 JSON'), '非 JSON 回包有专门提示', text)

  /* 7. 200 但空列表 */
  text = await describeModels({ endpoints: [endpoint('empty', 'empty')], resolveKey })
  expect(text.includes('0 个模型') && text.includes('没返回模型'), '空列表有解释', text)

  /* 8. 超过 200 条 */
  text = await describeModels({ endpoints: [endpoint('many', 'many')], resolveKey })
  expect(text.includes('230 个模型'), '大列表统计完整', text)
  expect(text.includes('…另有 30 个'), '超过 200 条截断并说明')

  /* 9. 超时 */
  text = await describeModels({ endpoints: [endpoint('slow', 'slow')], resolveKey, timeoutMs: 120 })
  expect(text.includes('120ms 内没有响应'), '超时分支可读', text)

  /* 10. 缺密钥 */
  text = await describeModels({ endpoints: [endpoint('nokey', 'o')], resolveKey })
  expect(text.includes('没有可用密钥') && text.includes('NOKEY'), '缺密钥提示环境变量名', text)

  /* 11. only 过滤 + 未知 id */
  text = await describeModels({ endpoints: [endpoint('o', 'o'), endpoint('g', 'g', 'gemini')], resolveKey, only: 'g' })
  expect(text.includes('✓ g') && !text.includes('✓ o'), 'only 只查指定端点', text)
  text = await describeModels({ endpoints: [endpoint('o', 'o')], resolveKey, only: 'nope' })
  expect(text.includes('没有找到端点「nope」') && text.includes('可用端点：o'), '未知端点提示可用列表', text)

  /* 12. 多端点混合：一次成功一次失败 */
  text = await describeModels({ endpoints: [endpoint('o', 'o'), endpoint('p', 'p')], resolveKey })
  expect(text.includes('✓ o') && text.includes('✗ p') && text.includes('端点 2'), '多端点汇总', text)
} finally {
  server.close()
}

console.log(failed ? `\nMODELS TEST FAIL（${failed} 项）` : '\nMODELS TEST PASS')
process.exit(failed ? 1 : 0)
