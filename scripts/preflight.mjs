// 发版前的自检：不启动 DSH，就能发现「插件一重启就消失」的那类问题。
// 用法：node scripts/preflight.mjs    （在插件根目录跑，或 node <插件根>/scripts/preflight.mjs）
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const problems = []
const notes = []

const fail = (text) => problems.push(text)
const note = (text) => notes.push(text)

/* ---------- 1. 文件编码：BOM 会让 JSON.parse 直接抛错，插件当场消失 ---------- */
const shipped = [
  'package.json',
  'index.js',
  'client.js',
  'cordis.patch.yml',
  'icon.svg',
  'LICENSE',
  'README.md',
  ...['config', 'engine', 'ops', 'protocols'].map((name) => `lib/${name}.js`),
  ...['zh', 'en'].map((name) => `locale/${name}.json`),
]

for (const rel of shipped) {
  const file = join(root, rel)
  if (!existsSync(file)) {
    fail(`缺少文件 ${rel}`)
    continue
  }
  const bytes = readFileSync(file)
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    fail(`${rel} 带 UTF-8 BOM（宿主读 package.json 会当场解析失败）`)
  }
  if (rel.endsWith('.json')) {
    try {
      JSON.parse(bytes.toString('utf8'))
    } catch (error) {
      fail(`${rel} 不是合法 JSON：${error.message}`)
    }
  }
}

/* ---------- 2. package.json 关键字段 ---------- */
let manifest = null
try {
  manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
} catch (error) {
  fail(`package.json 读不出来：${error.message}`)
}

if (manifest) {
  if (!/^\d+\.\d+\.\d+$/.test(String(manifest.version))) fail(`版本号不像正式版：${manifest.version}`)
  if (!manifest.dsh?.bundle?.patch) fail('package.json 缺 dsh.bundle.patch')
  else if (!existsSync(join(root, manifest.dsh.bundle.patch))) fail(`dsh.bundle.patch 指向的文件不存在：${manifest.dsh.bundle.patch}`)
  if (manifest.dependencies && Object.keys(manifest.dependencies).length) {
    fail(`dependencies 应为空（官方包一律走 peerDependencies）：${JSON.stringify(manifest.dependencies)}`)
  }
  if (!manifest.peerDependencies?.['@deepseek-ai/schemastery']) fail('peerDependencies 里缺 @deepseek-ai/schemastery')
  if (!manifest.engines?.dsh) fail('engines.dsh 缺失')
  if (!String(manifest.exports?.['./client'] || '').includes('client')) fail('exports 里缺 ./client')
  note(`版本 ${manifest.version}，peer ${Object.keys(manifest.peerDependencies || {}).join(', ')}`)
}

/* ---------- 3. 宿主半边：能 import、apply 后注册工具与命令 ---------- */
const tools = []
const commands = []
const ctxStub = {
  tools: { register: (tool) => tools.push(tool.name) },
  commands: { register: (command) => commands.push(command.name) },
  effect: (fn) => {
    const cleanup = fn()
    return typeof cleanup === 'function' ? cleanup : () => {}
  },
  on: () => () => {},
  get: () => undefined,
  settings: { describe: () => [], get: () => undefined },
  credentials: { resolve: () => undefined },
  settingsService: { configure: () => {} },
  logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}

try {
  const host = await import(pathToFileURL(join(root, 'index.js')).href)
  for (const key of ['Config', 'apply', 'inject']) {
    if (!(key in host)) fail(`index.js 没有导出 ${key}`)
  }
  await host.apply(ctxStub, {})
  if (tools.length !== 4) fail(`预期注册 4 个工具，实际 ${tools.length}：${tools.join(',')}`)
  const expected = ['tri_run', 'tri_review', 'tri_config', 'tri_doctor']
  for (const name of expected) if (!tools.includes(name)) fail(`缺少工具 ${name}`)
  if (!commands.includes('tri')) fail(`缺少命令 /tri：${commands.join(',')}`)
  if (!commands.includes('tri-doctor')) fail(`缺少命令 /tri-doctor：${commands.join(',')}`)
  note(`宿主：工具 ${tools.join(', ')}；命令 ${commands.map((c) => `/${c}`).join(', ')}`)
} catch (error) {
  fail(`index.js 加载/apply 失败：${error.message}`)
}

/* ---------- 4. 客户端半边：能在假宿主里装载、注册设置页、渲染出内容 ---------- */
const source = readFileSync(join(root, 'client.js'), 'utf8')
let spec = null
let page = null
let rendered = ''
let html = ''

globalThis.window = { __ModuleLoader__: { load: (value) => { spec = value } } }
globalThis.document = {
  createElement: () => ({ dataset: {}, textContent: '', remove() {} }),
  head: { appendChild: () => {} },
}

try {
  new Function(source)()
} catch (error) {
  fail(`client.js 语法/求值失败：${error.message}`)
}

if (!spec) {
  fail('client.js 没有调用 window.__ModuleLoader__.load')
} else if (spec.id !== 'dsh-tri-model') {
  fail(`模块 id 不是 dsh-tri-model：${spec.id}`)
} else {
  const frames = []
  const store = new Map()
  let dirty = false
  const React = {
    createElement: (type, props, ...children) => ({
      type,
      props: { ...(props || {}), children: children.length === 0 ? undefined : children.length === 1 ? children[0] : children },
    }),
    useState(initial) {
      const frame = frames[frames.length - 1]
      const key = `${frame.base}#${frame.index++}`
      if (!store.has(key)) store.set(key, { value: typeof initial === 'function' ? initial() : initial })
      const slot = store.get(key)
      const set = (next) => {
        const value = typeof next === 'function' ? next(slot.value) : next
        if (!Object.is(value, slot.value)) { slot.value = value; dirty = true }
      }
      return [slot.value, set]
    },
    useRef(initial) {
      const frame = frames[frames.length - 1]
      const key = `${frame.base}#ref${frame.index++}`
      if (!store.has(key)) store.set(key, { current: initial })
      return store.get(key)
    },
    useEffect(fn, deps) {
      const frame = frames[frames.length - 1]
      const key = `${frame.base}#eff${frame.index++}`
      const prev = store.get(key)
      const same = prev && deps && prev.deps && deps.length === prev.deps.length && deps.every((value, i) => Object.is(value, prev.deps[i]))
      if (!same) {
        if (prev && typeof prev.cleanup === 'function') prev.cleanup()
        store.set(key, { deps, cleanup: fn() })
      }
    },
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    Fragment: 'fragment',
  }

  const dict = {}
  const snapshot = {
    value: {
      endpoints: [{ id: 'ark-plan', label: '火山方舟（plan v3）', baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3', protocol: 'openai', apiKeyRef: 'tri-model.ark-plan' }],
      models: [{ id: 'deepseek-flash', label: 'DeepSeek V4.1 Flash', model: 'deepseek-v4.1-flash', endpoint: 'ark-plan' }],
      layers: [{ id: 'draft', kind: 'execute', model: 'deepseek-flash', enabled: true }],
      settings: { maxRounds: 2, timeoutMs: 120000 },
    },
    status: 'ready',
    writable: true,
    revision: 'preflight',
  }
  const form = { getSnapshot: () => snapshot, subscribe: () => () => {}, mutate: async () => ({ ok: true }) }
  const clientCtx = {
    locale: {
      bind: () => (key) => dict[key] || key,
      register: (_ns, table) => { Object.assign(dict, table.zh || table.en || table); return () => {} },
    },
    effect: (fn) => { const cleanup = fn(); return typeof cleanup === 'function' ? cleanup : () => {} },
    configForms: { get: () => form, whileServed: (_ns, cb) => cb() },
    slots: { inject: (_name, cb) => cb(), register: (_spec, component) => { page = component } },
    remote: { credentials: { describe: async () => ({ configured: true }) } },
  }

  try {
    const mod = spec.factory((name) => {
      if (name === 'react') return React
      throw new Error(`unexpected require(${name})`)
    })
    if (!mod.inject?.includes('configForms')) fail('客户端 inject 里缺 configForms')
    mod.apply(clientCtx)
    if (typeof page !== 'function') fail('客户端没有注册 settings.section')
  } catch (error) {
    fail(`客户端 apply 失败：${error.message}`)
  }

  if (typeof page === 'function') {
    const escapeHtml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const styleText = (style) => {
      if (!style) return ''
      if (typeof style === 'string') return style
      return Object.entries(style).map(([key, value]) => `${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${value}`).join(';')
    }
    const toHtml = (node, path) => {
      if (node === null || node === undefined || typeof node === 'boolean') return ''
      if (Array.isArray(node)) return node.map((child, i) => toHtml(child, `${path}/${i}`)).join('')
      if (typeof node !== 'object') return escapeHtml(node)
      const { type, props } = node
      if (typeof type === 'function') {
        const base = `${path}/${type.name || 'Anon'}`
        frames.push({ base, index: 0 })
        let out
        try {
          out = type.length > 1 ? type(props, clientCtx) : type(props)
        } finally {
          frames.pop()
        }
        return toHtml(out, `${base}.out`)
      }
      const attrs = []
      if (props.className) attrs.push(`class="${escapeHtml(props.className)}"`)
      if (props.style) attrs.push(`style="${escapeHtml(styleText(props.style))}"`)
      if (type === 'input') {
        attrs.push(`value="${escapeHtml(props.value ?? '')}"`)
        return `<input ${attrs.join(' ')} />`
      }
      if (type === 'textarea') return `<textarea ${attrs.join(' ')}>${escapeHtml(props.value ?? '')}</textarea>`
      return `<${type} ${attrs.join(' ')}>${toHtml(props.children, `${path}/${type}`)}</${type}>`
    }

    try {
      for (let round = 0; round < 8; round += 1) {
        frames.length = 0
        frames.push({ base: 'root', index: 0 })
        dirty = false
        html = toHtml(page(), 'page')
        if (!dirty) break
      }
      rendered = html
    } catch (error) {
      fail(`设置页渲染失败：${error.message}`)
    }

    for (const [label, needle] of [
      ['模型候选 ID', 'deepseek-v4.1-flash'],
      ['测连接提示', '/tri-doctor'],
      ['端点点选', '火山方舟（plan v3）'],
    ]) {
      if (!rendered.includes(needle)) fail(`设置页里没有渲染出${label}（找不到「${needle}」）`)
    }
    if (!/tm-suggest/.test(rendered)) fail('设置页没有渲染候选 ID 胶囊')
  }
}

/* ---------- 5. 报告 ---------- */
for (const line of notes) console.log(`· ${line}`)
if (problems.length) {
  console.log(`\nPREFLIGHT FAIL (${problems.length})`)
  for (const problem of problems) console.log(`  ✗ ${problem}`)
  process.exitCode = 1
} else {
  console.log('\nPREFLIGHT PASS')
}
