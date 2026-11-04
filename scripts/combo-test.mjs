// 交互自检（node scripts/combo-test.mjs）：
// 从 client.js 抽出 TextInput / ComboBox 源码，用桩 React 驱动「点 ▾ / 选候选 / 失焦」流程。
// 覆盖：默认关闭、点 ▾ 展开/收起、选候选回填并关闭、无候选不显箭头、聚焦展开、失焦 160ms 收起。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(dir, 'client.js'), 'utf8')

function extract(name) {
  const start = source.indexOf(`    function ${name}(`)
  if (start < 0) throw new Error(`找不到 ${name}`)
  let depth = 0
  for (let j = source.indexOf('{', start); j < source.length; j += 1) {
    if (source[j] === '{') depth += 1
    else if (source[j] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, j + 1)
    }
  }
  throw new Error(`${name} 括号不闭合`)
}

const problems = []
const check = (ok, label, extra) => {
  console.log(`${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`)
  if (!ok) problems.push(label)
}

/* ---- 桩 React：单实例 useState，值存在槽位里 ---- */
const slots = []
let cursor = 0
const React = {
  useState(init) {
    const i = cursor++
    if (!(i in slots)) slots[i] = typeof init === 'function' ? init() : init
    return [slots[i], (next) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next }]
  },
}

const h = (type, props, ...children) => {
  const kids = children.flat(Infinity).filter((child) => child != null && child !== false)
  if (typeof type === 'function') return type({ ...(props || {}), children: kids })
  return { type, props: props || {}, children: kids }
}

let lastInput = null
const textInputSource = extract('TextInput').replace('function TextInput(', 'function BaseTextInput(')
const comboSource = extract('ComboBox')
const ComboBox = new Function(
  'h',
  'React',
  'record',
  'BaseTextInput',
  `${textInputSource}

  function TextInput(props) {
    record(props)
    return BaseTextInput(props)
  }

  ${comboSource}

  return ComboBox`,
)(h, React, (props) => { lastInput = props }, new Function('h', `${textInputSource}\nreturn BaseTextInput`)(h))

/* ---- 渲染与查询 ---- */
let current = null
let tree = null
const reset = () => { slots.length = 0 }
const render = (props) => {
  current = props
  cursor = 0
  tree = ComboBox(props)
  return tree
}
const dispatch = (fn) => {
  fn({ preventDefault: () => {}, stopPropagation: () => {}, target: {} })
  render(current)
}
const walk = (node, visit) => {
  if (!node || typeof node !== 'object') return
  visit(node)
  for (const child of node.children || []) walk(child, visit)
}
const findAll = (node, match) => {
  const hits = []
  walk(node, (n) => { if (match(n)) hits.push(n) })
  return hits
}
const toggle = () => findAll(tree, (n) => String(n.props.className || '').includes('tm-combo-toggle'))[0]
const listOpen = () => findAll(tree, (n) => n.props.className === 'tm-combo-list').length === 1
const items = () => findAll(tree, (n) => String(n.props.className || '').startsWith('tm-combo-item'))

const options = ['deepseek-v4.1-flash', 'kimi-k3.1-pro', 'glm-5.3-flash']
let picked = null
const baseProps = () => ({
  value: 'DeepSeek-V4.1-Flash',
  options,
  title: '从候选里选',
  onChange: (next) => { picked = next },
})

reset()
render(baseProps())
check(Boolean(toggle()), '渲染出 ▾ 按钮')
check(!listOpen(), '默认不展开候选列表')

dispatch(toggle().props.onMouseDown)
check(listOpen(), '点 ▾ 后出现候选列表')
check(items().length === options.length, '候选条数与预设一致', `count=${items().length}`)

dispatch(toggle().props.onMouseDown)
check(!listOpen(), '再点 ▾ 收起列表')

dispatch(toggle().props.onMouseDown)
const target = items().find((n) => n.children[0] === 'kimi-k3.1-pro')
check(Boolean(target), '候选里能找到 kimi-k3.1-pro')
if (target) dispatch(target.props.onMouseDown)
check(picked === 'kimi-k3.1-pro', '选中后把候选 ID 回给 onChange', String(picked))
check(!listOpen(), '选中后列表关闭')

reset()
render({ ...baseProps(), options: [] })
check(!toggle(), '无候选时不显示 ▾')
check(lastInput && lastInput.onFocus === undefined, '无候选时不挂 onFocus')

reset()
render(baseProps())
lastInput.onFocus({})
render(current)
check(listOpen(), '点输入框（聚焦）也会展开候选')

reset()
render(baseProps())
dispatch(toggle().props.onMouseDown)
check(listOpen(), '再次展开用于失焦测试')
lastInput.onBlur({})
await new Promise((resolve) => setTimeout(resolve, 260))
render(current)
check(!listOpen(), '失焦 160ms 后自动收起')

console.log(problems.length ? `\nCOMBO TEST FAIL (${problems.length})\n  ${problems.join('\n  ')}` : '\nCOMBO TEST PASS')
process.exitCode = problems.length ? 1 : 0
