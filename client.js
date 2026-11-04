window.__ModuleLoader__.load({
  id: 'dsh-tri-model',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** 设置文档里的 namespace，也就是 Loader 行 id。 */
    const NS = 'tri-model'
    const PROTOCOLS = [
      { value: 'openai', label: 'openai' },
      { value: 'anthropic', label: 'anthropic' },
      { value: 'gemini', label: 'gemini' },
    ]
    const KINDS = ['plan', 'execute', 'review', 'judge', 'route', 'custom']
    /** 常见供应商：只填地址和协议，密钥仍然由用户自己贴。 */
    const PRESETS = [
      { id: 'ark-plan', label: '火山方舟 · Coding Plan', baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3', protocol: 'openai' },
      { id: 'ark', label: '火山方舟 · 标准 v3', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', protocol: 'openai' },
      { id: 'deepseek', label: 'DeepSeek 官方', baseUrl: 'https://api.deepseek.com/v1', protocol: 'openai' },
      { id: 'moonshot', label: 'Moonshot · Kimi', baseUrl: 'https://api.moonshot.cn/v1', protocol: 'openai' },
      { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', protocol: 'openai' },
      { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', protocol: 'openai' },
      { id: 'gemini', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com', protocol: 'gemini' },
      { id: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com', protocol: 'anthropic', path: '/v1/messages' },
      { id: 'custom', label: '', baseUrl: '', protocol: 'openai' },
    ]

    /** 中文标签转不出有意义的口径，就退回到「前缀-序号」。 */
    const slugify = (text, fallback) => {
      const raw = String(text || '').trim().toLowerCase()
      const ascii = raw.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      if (ascii) return ascii.slice(0, 40)
      const digits = raw.replace(/[^0-9]+/g, '')
      return digits ? `${fallback}-${digits}` : fallback
    }
    const uniqueId = (base, taken) => {
      const root = base || 'row'
      if (!taken.has(root)) return root
      let id = root
      let n = 2
      while (taken.has(id)) {
        id = `${root}-${n}`
        n += 1
      }
      return id
    }

    const zh = {
      title: '多模型协同',
      desc: '规划 → 执行 → 审查 → 自动返工。地址、密钥、协议、模型与层级都在这里，保存后下一次调用即生效。',
      endpoints: '端点',
      models: '模型',
      layers: '层级',
      global: '全局',
      addEndpoint: '添加端点',
      addModel: '添加模型',
      addLayer: '添加层级',
      remove: '删除',
      up: '上移',
      down: '下移',
      save: '保存',
      saving: '保存中…',
      reload: '放弃改动',
      saved: '已保存，下一次调用就用新配置。',
      failed: '写入没有被接受，改动先留着。',
      loading: '读取中…',
      readonly: '这个部署把设置存成只读。',
      keyConfigured: '密钥已配置',
      keyMissing: '缺密钥',
      keyPlaceholder: '粘贴密钥，只写进凭据库',
      keyHint: '保存时写入凭据库',
      blank: '未填写 · 保存时忽略',
      fId: '标识',
      fLabel: '显示名',
      fUrl: '接口地址',
      fProtocol: '协议',
      fProtocolInherit: '跟随端点',
      fPath: '请求路径（可选）',
      fEnv: '环境变量名（可选）',
      fKey: '密钥',
      fModel: '真实模型名',
      fEndpoint: '端点',
      fKind: '类型',
      fEnabled: '启用',
      fMaxRounds: '返工上限',
      fRework: '返工到',
      fTemperature: '温度',
      fThinking: '思考',
      fJson: 'JSON 模式',
      fMinOut: '最小输出',
      fChunk: '分段字数',
      fSystem: '系统提示词',
      fTemplate: '用户消息模板',
      fTimeout: '单次超时（毫秒）',
      fRounds: '返工轮数上限',
      advShow: '高级参数',
      advHide: '收起高级',
      promptShow: '提示词与模板',
      promptHide: '收起提示词',
      dirty: '有未保存的改动',
      summary: '{ep} 个端点 · {md} 个模型 · {ly} 层流水线',
      emptyEndpoints: '还没有端点。至少加一个接口地址。',
      emptyModels: '还没有模型。至少加一个真实模型名。',
      emptyLayers: '还没有层级。至少需要一层执行。',
      inherit: '跟随',
      on: '开',
      off: '关',
      hintTpl: '可用 {{task}} {{plan}} {{draft}} {{output}} {{issuesBlock}}',
      noChange: '没有改动',
      resetConfirm: '放弃未保存的改动？',
      keyStored: '密钥在保存时写入 DSH 凭据库，设置文件里只留引用名。',
      pending: '项待修',
      charUnit: ' 字',
      presetHint: '选一个预设，地址和协议自动填好，只剩密钥要你填。',
      presetCustom: '自建 / 其他',
      allOpen: '展开全部',
      allFold: '收起全部',
      usedByEndpoint: '{n} 个模型在用这个端点，删掉后它们会失去地址。',
      usedByModel: '{n} 个层级在用这个模型，删掉后它们会失效。',
      confirmDelete: '仍然删除',
      cancel: '取消',
      autoId: '标识随名称自动生成，也可以手改',
    }

    const en = {
      title: 'Multi-model pipeline',
      desc: 'Plan, execute, review, rework. Endpoints, keys, protocols, models and layers live here and apply on the next call.',
      endpoints: 'Endpoints',
      models: 'Models',
      layers: 'Layers',
      global: 'Global',
      addEndpoint: 'Add endpoint',
      addModel: 'Add model',
      addLayer: 'Add layer',
      remove: 'Remove',
      up: 'Move up',
      down: 'Move down',
      save: 'Save',
      saving: 'Saving…',
      reload: 'Discard',
      saved: 'Saved. The next call uses the new configuration.',
      failed: 'The write was not accepted; your edits are kept.',
      loading: 'Loading…',
      readonly: 'This deployment stores settings read-only.',
      keyConfigured: 'key set',
      keyMissing: 'no key',
      keyPlaceholder: 'Paste the key; it goes to credentials',
      keyHint: 'written to credentials on save',
      blank: 'empty · not saved',
      fId: 'Id',
      fLabel: 'Label',
      fUrl: 'Base URL',
      fProtocol: 'Protocol',
      fProtocolInherit: 'follow endpoint',
      fPath: 'Request path (optional)',
      fEnv: 'Env var (optional)',
      fKey: 'Key',
      fModel: 'Model name',
      fEndpoint: 'Endpoint',
      fKind: 'Kind',
      fEnabled: 'Enabled',
      fMaxRounds: 'Max rounds',
      fRework: 'Rework to',
      fTemperature: 'Temperature',
      fThinking: 'Thinking',
      fJson: 'JSON mode',
      fMinOut: 'Min output',
      fChunk: 'Chunk size',
      fSystem: 'System prompt',
      fTemplate: 'User message template',
      fTimeout: 'Timeout (ms)',
      fRounds: 'Max rework rounds',
      advShow: 'Advanced',
      advHide: 'Hide advanced',
      promptShow: 'Prompts',
      promptHide: 'Hide prompts',
      dirty: 'Unsaved changes',
      summary: '{ep} endpoints · {md} models · {ly} layers',
      emptyEndpoints: 'No endpoint yet. Add a base URL first.',
      emptyModels: 'No model yet. Add a model name.',
      emptyLayers: 'No layer yet. At least one execute layer is required.',
      inherit: 'inherit',
      on: 'on',
      off: 'off',
      hintTpl: 'Available: {{task}} {{plan}} {{draft}} {{output}} {{issuesBlock}}',
      noChange: 'No changes',
      resetConfirm: 'Discard unsaved changes?',
      keyStored: 'Keys are written to DSH credentials on save; the settings file keeps only a reference.',
      pending: ' to fix',
      charUnit: ' chars',
      presetHint: 'Pick a preset; URL and protocol are filled in, only the key is yours.',
      presetCustom: 'Self-hosted / other',
      allOpen: 'Expand all',
      allFold: 'Collapse all',
      usedByEndpoint: '{n} model(s) use this endpoint and will lose their URL.',
      usedByModel: '{n} layer(s) use this model and will break.',
      confirmDelete: 'Delete anyway',
      cancel: 'Cancel',
      autoId: 'The id follows the name until you edit it yourself',
    }
    const DICT = { zh, en }

    const CSS = `
.tm{--tm-gap:14px;display:flex;flex-direction:column;gap:var(--tm-gap);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}
.tm *{box-sizing:border-box}
.tm-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.tm-title{margin:0;font-size:15px;font-weight:600;letter-spacing:.01em}
.tm-desc{margin:3px 0 0;max-width:58ch;color:var(--dsw-alias-label-secondary);font-size:12px}
.tm-sum{margin:6px 0 0;font-size:11px;color:var(--dsw-alias-label-secondary)}
.tm-tools{display:flex;align-items:center;gap:8px;flex:none;flex-wrap:wrap}
.tm-state{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.tm-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);flex:none}
.tm-dot.ok{background:var(--dsw-alias-state-success-primary)}
.tm-dot.warn{background:var(--dsw-alias-state-warn-primary)}
.tm-btn{font:inherit;font-size:12px;line-height:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:7px 12px;border-radius:7px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);cursor:pointer;white-space:nowrap;transition:background .12s,border-color .12s,opacity .12s}
.tm-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-label-secondary)}
.tm-btn:disabled{opacity:.45;cursor:not-allowed}
.tm-btn.primary{background:var(--dsw-alias-brand-primary);border-color:transparent;color:var(--dsw-alias-bg-base);font-weight:600}
.tm-btn.primary:hover:not(:disabled){background:var(--dsw-alias-brand-primary);opacity:.9}
.tm-btn.ghost{background:transparent;border-color:transparent;color:var(--dsw-alias-label-secondary);padding:6px 8px}
.tm-btn.ghost:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.tm-btn.icon{width:26px;height:26px;padding:0;border-radius:6px;font-size:13px;line-height:1;color:var(--dsw-alias-label-secondary);border-color:transparent;background:transparent}
.tm-btn.icon:hover:not(:disabled){color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-2)}
.tm-btn.icon.plain:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.tm-sec{display:flex;flex-direction:column;gap:8px}
.tm-sec-head{display:flex;align-items:center;gap:8px;min-height:26px}
.tm-sec-title{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.tm-count{font-size:11px;line-height:1;padding:3px 7px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}
.tm-spacer{flex:1}
.tm-card{display:flex;flex-direction:column;gap:10px;padding:11px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}
.tm-card.off{opacity:.62}
.tm-card-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.tm-card-name{font-size:12px;font-weight:600;max-width:28ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tm-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;line-height:1;padding:3px 7px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);white-space:nowrap}
.tm-chip.ok{color:var(--dsw-alias-state-success-primary);border-color:currentColor}
.tm-chip.warn{color:var(--dsw-alias-state-warn-primary);border-color:currentColor}
.tm-chip.err{color:var(--dsw-alias-state-error-primary);border-color:currentColor}
.tm-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:10px 12px}
.tm-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.tm-field.wide{grid-column:1/-1}
.tm-label{font-size:11px;color:var(--dsw-alias-label-secondary);display:flex;align-items:baseline;gap:5px;min-width:0}
.tm-note{font-size:11px;color:var(--dsw-alias-label-secondary);font-weight:400}
.tm-input,.tm-select,.tm-area{font:inherit;font-size:12px;width:100%;padding:6px 8px;border-radius:7px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);outline:none;transition:border-color .12s}
.tm-input:hover,.tm-select:hover,.tm-area:hover{border-color:var(--dsw-alias-border-l2)}
.tm-input:focus,.tm-select:focus,.tm-area:focus{border-color:var(--dsw-alias-brand-primary)}
.tm-input::placeholder,.tm-area::placeholder{color:var(--dsw-alias-state-idle-primary)}
.tm-input.bad,.tm-select.bad,.tm-area.bad{border-color:var(--dsw-alias-state-error-primary)}
.tm-select{appearance:none;padding-right:22px;background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);background-position:calc(100% - 12px) 51%,calc(100% - 8px) 51%;background-size:4px 4px,4px 4px;background-repeat:no-repeat}
.tm-area{resize:vertical;min-height:52px;line-height:1.45;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px}
.tm-inline{display:flex;align-items:center;gap:8px}
.tm-switch{position:relative;width:30px;height:17px;flex:none;padding:0;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);cursor:pointer;transition:background .15s,border-color .15s}
.tm-switch i{position:absolute;top:2px;left:2px;width:11px;height:11px;border-radius:50%;background:var(--dsw-alias-label-secondary);transition:transform .15s,background .15s}
.tm-switch.on{background:var(--dsw-alias-brand-primary);border-color:transparent}
.tm-switch.on i{transform:translateX(13px);background:var(--dsw-alias-bg-base)}
.tm-empty{padding:16px;border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:center}
.tm-adv{display:flex;flex-direction:column;gap:10px;padding-top:9px;border-top:1px dashed var(--dsw-alias-border-l1)}
.tm-link{align-self:flex-start;padding:0;border:0;background:none;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px}
.tm-link:hover{color:var(--dsw-alias-label-primary)}
.tm-problems{margin:0;padding:9px 12px 9px 26px;border-radius:9px;border:1px solid var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);background:transparent;font-size:12px;display:flex;flex-direction:column;gap:3px}
.tm-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1)}
.tm-msg{font-size:12px;color:var(--dsw-alias-label-secondary);max-width:52ch}
.tm-msg.ok{color:var(--dsw-alias-state-success-primary)}
.tm-msg.bad{color:var(--dsw-alias-state-error-primary)}
.tm-global{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px 12px}
.tm-card-head{cursor:pointer;user-select:none}
.tm-card-head:hover .tm-card-name{color:var(--dsw-alias-brand-primary)}
.tm-fold{flex:none;width:14px;font-size:10px;line-height:1;color:var(--dsw-alias-label-secondary);transition:transform .12s}
.tm-card.open .tm-fold{transform:rotate(90deg)}
.tm-card-body{display:flex;flex-direction:column;gap:10px}
.tm-card:not(.open){gap:0;padding-top:9px;padding-bottom:9px}
.tm-presets{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-base)}
.tm-preset-row{display:flex;flex-wrap:wrap;gap:7px}
.tm-preset{font:inherit;font-size:11.5px;line-height:1;padding:6px 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);cursor:pointer;white-space:nowrap}
.tm-preset:hover{border-color:var(--dsw-alias-brand-primary)}
.tm-confirm{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;border:1px solid var(--dsw-alias-state-warn-primary);border-radius:8px;font-size:12px}
.tm-confirm-text{color:var(--dsw-alias-label-primary)}
.tm-confirm .tm-btn{padding:5px 9px;font-size:11.5px}
.tm-confirm .tm-btn.danger{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
@media (max-width:720px){.tm-fields{grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}.tm-desc{max-width:none}}
`

    /* ------------------------------------------------------------ 小工具 */

    const clone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)))

    const setIn = (target, path, value) => {
      if (!path.length) return value
      const [head, ...rest] = path
      const base = Array.isArray(target) ? target.slice() : { ...(target || {}) }
      base[head] = setIn(base[head], rest, value)
      return base
    }

    const hostOf = (url) => {
      const text = String(url || '').trim()
      if (!text) return '未填地址'
      const match = text.match(/^[a-z]+:\/\/([^/]+)/i)
      return match ? match[1] : text
    }

    const capFlags = (caps) => {
      const flags = []
      if (!caps) return flags
      if (caps.temperature === 'unset') flags.push('温度:不发')
      else if (caps.temperature != null && caps.temperature !== '') flags.push(`温度:${caps.temperature}`)
      if (caps.thinking === true) flags.push('思考')
      if (caps.thinking === false) flags.push('无思考')
      if (caps.json === true) flags.push('JSON')
      if (caps.minOutputTokens) flags.push(`≥${caps.minOutputTokens}tok`)
      return flags
    }

    const emptyEndpoint = (n) => ({
      id: `endpoint-${n}`,
      label: '',
      baseUrl: '',
      protocol: 'openai',
      apiKeyRef: `tri-model.endpoint-${n}`,
    })
    const emptyModel = (n, endpointId) => ({ id: `model-${n}`, label: '', model: '', endpoint: endpointId || '' })
    const emptyLayer = (n, modelId) => ({
      id: `layer-${n}`,
      kind: 'custom',
      model: modelId || '',
      enabled: true,
      system: '',
      template: '{{task}}',
    })

    /** 刚加进来还没填的行：不算错误，保存时忽略。 */
    const isBlankEndpoint = (ep) =>
      !String(ep.baseUrl || '').trim() && !String(ep.label || '').trim() && !String(ep.apiKey || '').trim() && !String(ep.path || '').trim()
    const isBlankModel = (md) => !String(md.model || '').trim() && !String(md.label || '').trim()

    /** 客户端侧的即时校验：和 host 的 validateConfig 对齐，但面向编辑反馈。 */
    const problemsOf = (draft, t) => {
      const out = []
      const allEndpoints = draft.endpoints || []
      const allModels = draft.models || []
      const layers = draft.layers || []
      const endpoints = allEndpoints.filter((ep) => !isBlankEndpoint(ep))
      const models = allModels.filter((md) => !isBlankModel(md))
      if (!endpoints.length) out.push(t('emptyEndpoints'))
      if (!layers.length) out.push(t('emptyLayers'))

      const seen = new Set()
      for (const ep of endpoints) {
        if (!ep.id) out.push('端点缺标识')
        else if (seen.has(`e:${ep.id}`)) out.push(`端点标识重复：${ep.id}`)
        seen.add(`e:${ep.id}`)
        if (!ep.baseUrl) out.push(`端点 ${ep.id || '?'} 缺地址`)
      }
      const epIds = new Set(allEndpoints.map((ep) => ep.id))
      const seenModel = new Set()
      for (const md of models) {
        if (!md.id) out.push('模型缺标识')
        else if (seenModel.has(md.id)) out.push(`模型标识重复：${md.id}`)
        seenModel.add(md.id)
        if (!md.model) out.push(`模型 ${md.id || '?'} 缺真实模型名`)
        if (md.endpoint && !epIds.has(md.endpoint)) out.push(`模型 ${md.id || '?'} 指向不存在的端点 ${md.endpoint}`)
      }
      const modelIds = new Set(models.map((md) => md.id))
      for (const ly of layers) {
        if (!ly.model) out.push(`层级 ${ly.id || '?'} 没选模型`)
        else if (!modelIds.has(ly.model)) out.push(`层级 ${ly.id || '?'} 指向不存在的模型 ${ly.model}`)
      }
      const on = layers.filter((ly) => ly.enabled !== false)
      if (layers.length && !on.length) out.push('所有层级都停用了，跑起来什么也不会发生。')
      if (on.length && !on.some((ly) => ly.kind === 'execute' || ly.kind === 'custom')) out.push('没有执行层（kind=execute），流水线只会空转。')
      return out
    }

    /* ------------------------------------------------------------ 组件 */

    function Field(props) {
      return h(
        'label',
        { className: `tm-field${props.wide ? ' wide' : ''}` },
        h('span', { className: 'tm-label' }, props.label, props.hint ? h('span', { className: 'tm-note' }, props.hint) : null),
        props.children,
      )
    }

    function TextInput(props) {
      return h('input', {
        className: `tm-input${props.bad ? ' bad' : ''}`,
        style: props.mono ? { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace', fontSize: 11.5 } : undefined,
        value: props.value == null ? '' : props.value,
        placeholder: props.placeholder || '',
        spellCheck: false,
        autoFocus: props.autoFocus ? true : undefined,
        onChange: (event) => props.onChange(event.target.value),
      })
    }

    function Select(props) {
      const list = props.options.some((option) => option.value === props.value)
        ? props.options
        : [{ value: props.value, label: props.value || '—' }, ...props.options]
      return h(
        'select',
        { className: 'tm-select', value: props.value == null ? '' : props.value, onChange: (event) => props.onChange(event.target.value) },
        list.map((option) => h('option', { key: String(option.value), value: option.value }, option.label)),
      )
    }

    function Switch(props) {
      return h('button', {
        type: 'button',
        className: `tm-switch${props.on ? ' on' : ''}`,
        title: props.title,
        'aria-pressed': Boolean(props.on),
        onClick: (event) => {
          event.stopPropagation()
          props.onChange(!props.on)
        },
      }, h('i'))
    }

    function IconButton(props) {
      return h('button', {
        type: 'button',
        className: `tm-btn icon${props.plain ? ' plain' : ''}`,
        title: props.title,
        'aria-label': props.title,
        disabled: props.disabled,
        onClick: (event) => {
          event.stopPropagation()
          props.onClick(event)
        },
      }, props.glyph)
    }

    function SectionHead(props) {
      return h(
        'div',
        { className: 'tm-sec-head' },
        h('span', { className: 'tm-sec-title' }, props.title),
        h('span', { className: 'tm-count' }, String(props.count)),
        h('span', { className: 'tm-spacer' }),
        props.count && props.onToggleAll
          ? h('button', { type: 'button', className: 'tm-btn ghost', onClick: props.onToggleAll }, props.allOpen ? props.foldLabel : props.openLabel)
          : null,
        h('button', { type: 'button', className: 'tm-btn ghost', onClick: props.onAdd }, `+ ${props.actionLabel}`),
      )
    }

    /* ------------------------------------------------------------ 设置页 */

    function TriModelPage(props, context) {
      const form = context.form
      const remote = context.remote
      const t = context.t

      const [snapshot, setSnapshot] = React.useState(() => form.getSnapshot())
      const [draft, setDraft] = React.useState(null)
      const [keys, setKeys] = React.useState({})
      const [keyState, setKeyState] = React.useState(null)
      const [keyEpoch, setKeyEpoch] = React.useState(0)
      const [status, setStatus] = React.useState({ tone: '', text: '' })
      const [busy, setBusy] = React.useState(false)
      const [openAdv, setOpenAdv] = React.useState({})
      const [openCards, setOpenCards] = React.useState({})
      const [confirmDel, setConfirmDel] = React.useState(null)
      const [presetOpen, setPresetOpen] = React.useState(false)
      /** 刚加进来的行：把焦点放到标识输入框，省得用户再点一下。 */
      const [focusRow, setFocusRow] = React.useState(null)
      const baseline = React.useRef(null)

      React.useEffect(() => form.subscribe(() => setSnapshot(form.getSnapshot())), [form])

      const value = snapshot?.value
      const writable = snapshot?.writable !== false

      React.useEffect(() => {
        if (draft !== null || !value) return
        const next = {
          endpoints: clone(value.endpoints) || [],
          models: clone(value.models) || [],
          layers: clone(value.layers) || [],
          settings: clone(value.settings) || {},
        }
        baseline.current = next
        setDraft(next)
      }, [value, snapshot?.revision, draft])

      const endpointCount = draft ? (draft.endpoints || []).length : 0

      /** 端点密钥是否已配置：读凭据库，只拿 configured 布尔值。 */
      React.useEffect(() => {
        if (!draft) return
        let alive = true
        const refs = draft.endpoints
          .map((ep) => ep.apiKeyRef || (ep.id ? `tri-model.${ep.id}` : ''))
          .filter(Boolean)
        if (!refs.length) {
          setKeyState({})
          return
        }
        Promise.all(
          refs.map((ref) =>
            Promise.resolve(remote.credentials.describe(ref))
              .then((info) => [ref, Boolean(info?.configured)])
              .catch(() => [ref, false]),
          ),
        ).then((pairs) => {
          if (!alive) return
          const next = {}
          for (const [ref, configured] of pairs) next[ref] = configured
          setKeyState(next)
        })
        return () => {
          alive = false
        }
      }, [endpointCount, keyEpoch, remote])

      const dirty = draft !== null && baseline.current !== null && JSON.stringify(draft) !== JSON.stringify(baseline.current)
      const problems = draft ? problemsOf(draft, t) : []
      const blocked = problems.length > 0 || !dirty || busy || !writable

      const patch = (path, next) => setDraft((current) => (current ? setIn(current, path, next) : current))

      const addRow = (section, preset) => {
        const nextIndex = (draft?.[section] || []).length
        setDraft((current) => {
          if (!current) return current
          const rows = (current[section] || []).slice()
          const taken = new Set(rows.map((row) => row.id))
          if (section === 'endpoints') {
            const blank = emptyEndpoint(rows.length + 1)
            const seed = preset && preset.id !== 'custom' ? preset : null
            const id = uniqueId(seed ? seed.id : blank.id, taken)
            rows.push({
              ...blank,
              id,
              apiKeyRef: `tri-model.${id}`,
              ...(seed
                ? {
                  label: seed.label,
                  baseUrl: seed.baseUrl,
                  protocol: seed.protocol,
                  ...(seed.path ? { path: seed.path } : {}),
                }
                : {}),
            })
          }
          if (section === 'models') {
            const blank = emptyModel(rows.length + 1, (current.endpoints || [])[0]?.id)
            const id = uniqueId(blank.id, taken)
            rows.push({ ...blank, id })
          }
          if (section === 'layers') {
            const blank = emptyLayer(rows.length + 1, (current.models || [])[0]?.id)
            const id = uniqueId(blank.id, taken)
            rows.push({ ...blank, id })
          }
          return { ...current, [section]: rows }
        })
        setOpenCards((current) => ({ ...current, [`${section}:${nextIndex}`]: true }))
        setFocusRow({ section, index: nextIndex })
        setPresetOpen(false)
      }

      /** 删之前先看有没有别的地方在引用它，有就当场问一句。 */
      const referencesOf = (section, row) => {
        if (!row) return 0
        if (section === 'endpoints') return (draft?.models || []).filter((md) => md.endpoint === row.id).length
        if (section === 'models') return (draft?.layers || []).filter((ly) => ly.model === row.id).length
        return 0
      }

      const removeRow = (section, index) => {
        setDraft((current) => {
          if (!current) return current
          const rows = (current[section] || []).slice()
          rows.splice(index, 1)
          return { ...current, [section]: rows }
        })
        setOpenCards((current) => {
          const next = {}
          for (const [key, value] of Object.entries(current)) {
            const [sectionName, raw] = key.split(':')
            const position = Number(raw)
            if (sectionName !== section || position === index) continue
            next[`${sectionName}:${position > index ? position - 1 : position}`] = value
          }
          return next
        })
        setConfirmDel(null)
      }

      const askRemove = (section, index) => {
        const row = (draft?.[section] || [])[index]
        const count = referencesOf(section, row)
        if (count > 0) setConfirmDel({ section, index, count })
        else removeRow(section, index)
      }

      /* ---- 折叠：默认只有「唯一一行」或「正在编辑的新行」展开 ---- */
      const isOpen = (section, index, total) => {
        const key = `${section}:${index}`
        if (key in openCards) return Boolean(openCards[key])
        const focused = focusRow && focusRow.section === section && focusRow.index === index
        return Boolean(focused) || total === 1
      }
      const toggleCard = (section, index, total) =>
        setOpenCards((current) => ({ ...current, [`${section}:${index}`]: !isOpen(section, index, total) }))
      const allOpen = (section, rows) => rows.length > 0 && rows.every((row, index) => isOpen(section, index, rows.length))
      const toggleAll = (section, rows) => {
        const open = !allOpen(section, rows)
        setOpenCards((current) => {
          const next = { ...current }
          rows.forEach((row, index) => {
            next[`${section}:${index}`] = open
          })
          return next
        })
      }

      const move = (index, delta) => {
        setDraft((current) => {
          if (!current) return current
          const rows = (current.layers || []).slice()
          const target = index + delta
          if (target < 0 || target >= rows.length) return current
          const [row] = rows.splice(index, 1)
          rows.splice(target, 0, row)
          return { ...current, layers: rows }
        })
      }

      const toggleAdv = (key) => setOpenAdv((current) => ({ ...current, [key]: !current[key] }))

      const save = async () => {
        if (!draft || busy || problems.length) return
        setBusy(true)
        setStatus({ tone: '', text: '' })
        try {
          const allEndpoints = clone(draft.endpoints) || []
          const models = (clone(draft.models) || []).filter((md) => !isBlankModel(md))
          const used = new Set(models.map((md) => md.endpoint).filter(Boolean))
          /** 空行不落库：刚点「添加」还没填的行，保存时直接丢掉。 */
          const endpoints = allEndpoints.filter((ep) => !isBlankEndpoint(ep) || used.has(ep.id))
          for (const endpoint of endpoints) {
            const typed = keys[endpoint.id]
            const inline = endpoint.apiKey
            if (!typed && !inline) continue
            const ref = endpoint.apiKeyRef || `tri-model.${endpoint.id}`
            await remote.credentials.set(ref, typed || inline)
            endpoint.apiKeyRef = ref
            delete endpoint.apiKey
          }
          await form.mutate([
            { op: 'set', path: ['endpoints'], value: endpoints },
            { op: 'set', path: ['models'], value: models },
            { op: 'set', path: ['layers'], value: clone(draft.layers) || [] },
            { op: 'set', path: ['settings'], value: clone(draft.settings) || {} },
          ])
          const saved = {
            endpoints,
            models,
            layers: clone(draft.layers) || [],
            settings: clone(draft.settings) || {},
          }
          setKeys({})
          setStatus({ tone: 'ok', text: t('saved') })
          baseline.current = clone(saved)
          setDraft(clone(saved))
          setKeyEpoch((count) => count + 1)
        } catch (error) {
          setStatus({ tone: 'bad', text: String(error?.message || error) })
        } finally {
          setBusy(false)
        }
      }

      const reload = () => {
        if (dirty && typeof window !== 'undefined' && !window.confirm(t('resetConfirm'))) return
        baseline.current = null
        setDraft(null)
        setKeys({})
        setStatus({ tone: '', text: '' })
      }

      /** 摘要只数「会保存的行」：空行只是草稿。 */
      const summary = draft
        ? t('summary')
          .replace('{ep}', String((draft.endpoints || []).filter((ep) => !isBlankEndpoint(ep)).length))
          .replace('{md}', String((draft.models || []).filter((md) => !isBlankModel(md)).length))
          .replace('{ly}', String((draft.layers || []).length))
        : ''

      const head = h(
        'div',
        { className: 'tm-head' },
        h(
          'div',
          null,
          h('h3', { className: 'tm-title' }, t('title')),
          h('p', { className: 'tm-desc' }, t('desc')),
          draft ? h('p', { className: 'tm-sum' }, summary) : null,
        ),
        h(
          'div',
          { className: 'tm-tools' },
          h(
            'span',
            { className: 'tm-state' },
            h('i', { className: `tm-dot ${problems.length || dirty ? 'warn' : 'ok'}` }),
            problems.length ? String(problems.length) + t('pending') : dirty ? t('dirty') : t('noChange'),
          ),
          h('button', { type: 'button', className: 'tm-btn', onClick: reload, disabled: busy || !dirty }, t('reload')),
          h('button', { type: 'button', className: 'tm-btn primary', onClick: save, disabled: blocked }, busy ? t('saving') : t('save')),
        ),
      )

      if (!draft) {
        const hint = !writable
          ? t('readonly')
          : snapshot?.status === 'error'
            ? String(snapshot?.error?.message || snapshot?.error || t('failed'))
            : t('loading')
        return h('div', { className: 'tm' }, head, h('p', { className: 'tm-note' }, hint))
      }

      const endpoints = draft.endpoints || []
      const models = draft.models || []
      const layers = draft.layers || []
      const endpointOptions = endpoints.map((ep) => ({ value: ep.id, label: ep.id }))
      const modelOptions = models.map((md) => ({ value: md.id, label: md.id }))

      const renameRow = (section, index, field, next) => {
        setDraft((current) => {
          if (!current) return current
          const rows = (current[section] || []).slice()
          const row = { ...rows[index] }
          const previous = row[field]
          const prefix = section === 'endpoints' ? 'endpoint' : section === 'models' ? 'model' : 'layer'
          const autoBefore = slugify(previous, `${prefix}-${index + 1}`)
          row[field] = next
          if (field !== 'id' && (!row.id || row.id === autoBefore)) {
            const taken = new Set(rows.filter((_, position) => position !== index).map((item) => item.id))
            row.id = uniqueId(slugify(next, `${prefix}-${index + 1}`), taken)
          }
          rows[index] = row
          return { ...current, [section]: rows }
        })
      }

      const confirmBar = (section, index) => {
        const confirm = confirmDel && confirmDel.section === section && confirmDel.index === index ? confirmDel : null
        if (!confirm) return null
        const key = section === 'endpoints' ? 'usedByEndpoint' : 'usedByModel'
        return h(
          'div',
          { className: 'tm-confirm' },
          h('span', { className: 'tm-confirm-text' }, t(key).replace('{n}', String(confirm.count))),
          h('button', { type: 'button', className: 'tm-btn danger', onClick: () => removeRow(section, index) }, t('confirmDelete')),
          h('button', { type: 'button', className: 'tm-btn', onClick: () => setConfirmDel(null) }, t('cancel')),
        )
      }

      /* ---- 端点 ---- */
      const endpointCards = endpoints.length
        ? endpoints.map((endpoint, index) => {
          const ref = endpoint.apiKeyRef || (endpoint.id ? `tri-model.${endpoint.id}` : '')
          const known = keyState !== null
          const configured = Boolean((known && keyState[ref]) || keys[endpoint.id])
          const key = `ep${index}`
          const open = isOpen('endpoints', index, endpoints.length)
          return h(
            'div',
            { className: `tm-card${open ? ' open' : ''}`, key },
            h(
              'div',
              { className: 'tm-card-head', role: 'button', tabIndex: 0, onClick: () => toggleCard('endpoints', index, endpoints.length) },
              h('span', { className: 'tm-fold' }, '▸'),
              h('span', { className: 'tm-card-name' }, endpoint.label || endpoint.id || '端点'),
              h('span', { className: 'tm-chip' }, endpoint.protocol || 'openai'),
              isBlankEndpoint(endpoint) ? h('span', { className: 'tm-chip' }, t('blank')) : null,
              h('span', { className: 'tm-note' }, hostOf(endpoint.baseUrl)),
              known || keys[endpoint.id]
                ? h('span', { className: `tm-chip ${configured ? 'ok' : 'warn'}` }, configured ? t('keyConfigured') : t('keyMissing'))
                : null,
              h('span', { className: 'tm-spacer' }),
              open ? h(IconButton, { glyph: '×', title: t('remove'), onClick: () => askRemove('endpoints', index) }) : null,
            ),
            open
              ? h(
                'div',
                { className: 'tm-card-body' },
                confirmBar('endpoints', index),
                h(
                  'div',
                  { className: 'tm-fields' },
                  h(Field, { label: t('fId'), hint: t('autoId') }, h(TextInput, {
                    value: endpoint.id,
                    mono: true,
                    autoFocus: Boolean(focusRow && focusRow.section === 'endpoints' && focusRow.index === index),
                    onChange: (next) => renameRow('endpoints', index, 'id', next),
                  })),
                  h(Field, { label: t('fLabel') }, h(TextInput, {
                    value: endpoint.label,
                    placeholder: '火山方舟',
                    onChange: (next) => renameRow('endpoints', index, 'label', next),
                  })),
                  h(Field, { label: t('fProtocol') }, h(Select, {
                    value: endpoint.protocol || 'openai',
                    options: PROTOCOLS,
                    onChange: (next) => patch(['endpoints', index, 'protocol'], next),
                  })),
                ),
                h(Field, { label: t('fUrl'), wide: true }, h(TextInput, {
                  value: endpoint.baseUrl,
                  bad: !endpoint.baseUrl && !isBlankEndpoint(endpoint),
                  mono: true,
                  placeholder: 'https://api.example.com/v1',
                  onChange: (next) => patch(['endpoints', index, 'baseUrl'], next),
                })),
                h(Field, { label: t('fKey'), wide: true, hint: t('keyHint') }, h(TextInput, {
                  value: keys[endpoint.id] || '',
                  placeholder: configured ? `${t('keyConfigured')} · ${t('keyPlaceholder')}` : t('keyPlaceholder'),
                  onChange: (next) => setKeys((current) => ({ ...current, [endpoint.id]: next })),
                })),
                h('button', { type: 'button', className: 'tm-link', onClick: () => toggleAdv(key) }, openAdv[key] ? t('advHide') : t('advShow')),
                openAdv[key]
                  ? h(
                    'div',
                    { className: 'tm-adv' },
                    h(
                      'div',
                      { className: 'tm-fields' },
                      h(Field, { label: t('fPath') }, h(TextInput, {
                        value: endpoint.path,
                        mono: true,
                        placeholder: '/v1/messages',
                        onChange: (next) => patch(['endpoints', index, 'path'], next || undefined),
                      })),
                      h(Field, { label: t('fEnv') }, h(TextInput, {
                        value: endpoint.envKey,
                        mono: true,
                        placeholder: 'MY_API_KEY',
                        onChange: (next) => patch(['endpoints', index, 'envKey'], next || undefined),
                      })),
                    ),
                  )
                  : null,
              )
              : null,
          )
        })
        : h('div', { className: 'tm-empty', key: 'ep-empty' }, t('emptyEndpoints'))

      /* ---- 模型 ---- */
      const modelCards = models.length
        ? models.map((model, index) => {
          const key = `md${index}`
          const open = isOpen('models', index, models.length)
          return h(
            'div',
            { className: `tm-card${open ? ' open' : ''}`, key },
            h(
              'div',
              { className: 'tm-card-head', role: 'button', tabIndex: 0, onClick: () => toggleCard('models', index, models.length) },
              h('span', { className: 'tm-fold' }, '▸'),
              h('span', { className: 'tm-card-name' }, model.label || model.id || '模型'),
              h('span', { className: 'tm-chip' }, model.endpoint || '—'),
              isBlankModel(model) ? h('span', { className: 'tm-chip' }, t('blank')) : null,
              model.protocol ? h('span', { className: 'tm-chip' }, model.protocol) : null,
              capFlags(model.caps).map((flag) => h('span', { key: flag, className: 'tm-chip' }, flag)),
              h('span', { className: 'tm-spacer' }),
              open ? h(IconButton, { glyph: '×', title: t('remove'), onClick: () => askRemove('models', index) }) : null,
            ),
            open
              ? h(
                'div',
                { className: 'tm-card-body' },
                confirmBar('models', index),
                h(
                  'div',
                  { className: 'tm-fields' },
                  h(Field, { label: t('fId'), hint: t('autoId') }, h(TextInput, {
                    value: model.id,
                    mono: true,
                    autoFocus: Boolean(focusRow && focusRow.section === 'models' && focusRow.index === index),
                    onChange: (next) => renameRow('models', index, 'id', next),
                  })),
                  h(Field, { label: t('fLabel') }, h(TextInput, {
                    value: model.label,
                    placeholder: 'Kimi K3.1 Pro',
                    onChange: (next) => renameRow('models', index, 'label', next),
                  })),
                  h(Field, { label: t('fModel') }, h(TextInput, {
                    value: model.model,
                    bad: !model.model && !isBlankModel(model),
                    mono: true,
                    placeholder: 'DeepSeek-V4.1-Flash',
                    onChange: (next) => renameRow('models', index, 'model', next),
                  })),
                  h(Field, { label: t('fEndpoint') }, h(Select, {
                    value: model.endpoint || '',
                    options: endpointOptions,
                    onChange: (next) => patch(['models', index, 'endpoint'], next),
                  })),
                ),
                h('button', { type: 'button', className: 'tm-link', onClick: () => toggleAdv(key) }, openAdv[key] ? t('advHide') : t('advShow')),
                openAdv[key]
                  ? h(
                    'div',
                    { className: 'tm-adv' },
                    h(
                      'div',
                      { className: 'tm-fields' },
                      h(Field, { label: t('fProtocol') }, h(Select, {
                        value: model.protocol || '',
                        options: [{ value: '', label: t('fProtocolInherit') }, ...PROTOCOLS],
                        onChange: (next) => patch(['models', index, 'protocol'], next || undefined),
                      })),
                      h(Field, { label: t('fTemperature') }, h(TextInput, {
                        value: model.caps?.temperature == null ? '' : String(model.caps.temperature),
                        mono: true,
                        placeholder: t('inherit'),
                        onChange: (next) => patch(['models', index, 'caps', 'temperature'], next === '' ? undefined : Number.isNaN(Number(next)) ? next : Number(next)),
                      })),
                      h(Field, { label: t('fThinking') }, h(Select, {
                        value: model.caps?.thinking === undefined ? '' : String(model.caps.thinking),
                        options: [{ value: '', label: t('inherit') }, { value: 'true', label: t('on') }, { value: 'false', label: t('off') }],
                        onChange: (next) => patch(['models', index, 'caps', 'thinking'], next === '' ? undefined : next === 'true'),
                      })),
                      h(Field, { label: t('fJson') }, h(Select, {
                        value: model.caps?.json === undefined ? '' : String(model.caps.json),
                        options: [{ value: '', label: t('inherit') }, { value: 'true', label: t('on') }, { value: 'false', label: t('off') }],
                        onChange: (next) => patch(['models', index, 'caps', 'json'], next === '' ? undefined : next === 'true'),
                      })),
                      h(Field, { label: t('fMinOut') }, h(TextInput, {
                        value: model.caps?.minOutputTokens == null ? '' : String(model.caps.minOutputTokens),
                        mono: true,
                        onChange: (next) => patch(['models', index, 'caps', 'minOutputTokens'], next === '' ? undefined : Number(next)),
                      })),
                      h(Field, { label: t('fChunk') }, h(TextInput, {
                        value: model.caps?.chunkChars == null ? '' : String(model.caps.chunkChars),
                        mono: true,
                        onChange: (next) => patch(['models', index, 'caps', 'chunkChars'], next === '' ? undefined : Number(next)),
                      })),
                    ),
                  )
                  : null,
              )
              : null,
          )
        })
        : h('div', { className: 'tm-empty', key: 'md-empty' }, t('emptyModels'))

      /* ---- 层级 ---- */
      const layerCards = layers.length
        ? layers.map((layer, index) => {
          const key = `ly${index}`
          const off = layer.enabled === false
          const open = isOpen('layers', index, layers.length)
          return h(
            'div',
            { className: `tm-card${off ? ' off' : ''}${open ? ' open' : ''}`, key },
            h(
              'div',
              { className: 'tm-card-head', role: 'button', tabIndex: 0, onClick: () => toggleCard('layers', index, layers.length) },
              h('span', { className: 'tm-fold' }, '▸'),
              h('span', { className: 'tm-count' }, String(index + 1)),
              h('span', { className: 'tm-card-name' }, layer.id || '层级'),
              h('span', { className: 'tm-chip' }, layer.kind || 'custom'),
              h('span', { className: 'tm-chip' }, layer.model || '—'),
              layer.gate?.reworkTo
                ? h('span', { className: 'tm-chip warn' }, `FAIL→${layer.gate.reworkTo}×${layer.gate.maxRounds ?? draft.settings?.maxRounds ?? 2}`)
                : null,
              h('span', { className: 'tm-spacer' }),
              h(Switch, { on: !off, title: t('fEnabled'), onChange: (next) => patch(['layers', index, 'enabled'], next) }),
              open ? h(IconButton, { glyph: '↑', title: t('up'), plain: true, disabled: index === 0, onClick: () => move(index, -1) }) : null,
              open ? h(IconButton, { glyph: '↓', title: t('down'), plain: true, disabled: index === layers.length - 1, onClick: () => move(index, 1) }) : null,
              open ? h(IconButton, { glyph: '×', title: t('remove'), onClick: () => askRemove('layers', index) }) : null,
            ),
            open
              ? h(
                'div',
                { className: 'tm-card-body' },
                confirmBar('layers', index),
                h(
                  'div',
                  { className: 'tm-fields' },
                  h(Field, { label: t('fId') }, h(TextInput, { value: layer.id, mono: true, onChange: (next) => renameRow('layers', index, 'id', next) })),
                  h(Field, { label: t('fKind') }, h(Select, {
                    value: layer.kind || 'custom',
                    options: KINDS.map((kind) => ({ value: kind, label: kind })),
                    onChange: (next) => patch(['layers', index, 'kind'], next),
                  })),
                  h(Field, { label: t('fModel') }, h(Select, {
                    value: layer.model || '',
                    options: modelOptions,
                    onChange: (next) => patch(['layers', index, 'model'], next),
                  })),
                  h(Field, { label: t('fMaxRounds') }, h(TextInput, {
                    value: layer.gate?.maxRounds == null ? '' : String(layer.gate.maxRounds),
                    mono: true,
                    placeholder: String(draft.settings?.maxRounds ?? 2),
                    onChange: (next) => patch(['layers', index, 'gate', 'maxRounds'], next === '' ? undefined : Number(next)),
                  })),
                  h(Field, { label: t('fRework') }, h(TextInput, {
                    value: layer.gate?.reworkTo,
                    mono: true,
                    placeholder: layers[index - 1]?.id || 'draft',
                    onChange: (next) => patch(['layers', index, 'gate', 'reworkTo'], next || undefined),
                  })),
                ),
                h('button', { type: 'button', className: 'tm-link', onClick: () => toggleAdv(key) },
                  openAdv[key] ? t('promptHide') : `${t('promptShow')} · ${String((layer.system || '').length)}${t('charUnit')}`),
                openAdv[key]
                  ? h(
                    'div',
                    { className: 'tm-adv' },
                    h(Field, { label: t('fSystem'), wide: true }, h('textarea', {
                      className: 'tm-area',
                      value: layer.system || '',
                      rows: 3,
                      spellCheck: false,
                      onChange: (event) => patch(['layers', index, 'system'], event.target.value),
                    })),
                    h(Field, { label: t('fTemplate'), wide: true, hint: t('hintTpl') }, h('textarea', {
                      className: 'tm-area',
                      value: layer.template || '',
                      rows: 4,
                      spellCheck: false,
                      onChange: (event) => patch(['layers', index, 'template'], event.target.value),
                    })),
                  )
                  : null,
              )
              : null,
          )
        })
        : h('div', { className: 'tm-empty', key: 'ly-empty' }, t('emptyLayers'))

      const presetPanel = h(
        'div',
        { className: 'tm-presets' },
        h('span', { className: 'tm-note' }, t('presetHint')),
        h(
          'div',
          { className: 'tm-preset-row' },
          PRESETS.map((preset) =>
            h(
              'button',
              { key: preset.id, type: 'button', className: 'tm-preset', onClick: () => addRow('endpoints', preset) },
              preset.id === 'custom' ? t('presetCustom') : preset.label,
            ),
          ),
        ),
      )

      return h(
        'div',
        { className: 'tm' },
        head,
        problems.length ? h('ul', { className: 'tm-problems' }, problems.slice(0, 5).map((text) => h('li', { key: text }, text))) : null,
        h(
          'div',
          { className: 'tm-sec' },
          h(SectionHead, {
            title: t('endpoints'),
            count: endpoints.length,
            actionLabel: t('addEndpoint'),
            onAdd: () => setPresetOpen((open) => !open),
            onToggleAll: endpoints.length ? () => toggleAll('endpoints', endpoints) : undefined,
            allOpen: allOpen('endpoints', endpoints),
            foldLabel: t('allFold'),
            openLabel: t('allOpen'),
          }),
          presetOpen || !endpoints.length ? presetPanel : null,
          endpointCards,
        ),
        h(
          'div',
          { className: 'tm-sec' },
          h(SectionHead, {
            title: t('models'),
            count: models.length,
            actionLabel: t('addModel'),
            onAdd: () => addRow('models'),
            onToggleAll: models.length ? () => toggleAll('models', models) : undefined,
            allOpen: allOpen('models', models),
            foldLabel: t('allFold'),
            openLabel: t('allOpen'),
          }),
          modelCards,
        ),
        h(
          'div',
          { className: 'tm-sec' },
          h(SectionHead, {
            title: t('layers'),
            count: layers.length,
            actionLabel: t('addLayer'),
            onAdd: () => addRow('layers'),
            onToggleAll: layers.length ? () => toggleAll('layers', layers) : undefined,
            allOpen: allOpen('layers', layers),
            foldLabel: t('allFold'),
            openLabel: t('allOpen'),
          }),
          layerCards,
        ),
        h(
          'div',
          { className: 'tm-sec' },
          h('div', { className: 'tm-sec-head' }, h('span', { className: 'tm-sec-title' }, t('global'))),
          h(
            'div',
            { className: 'tm-card open' },
            h(
              'div',
              { className: 'tm-global' },
              h(Field, { label: t('fRounds') }, h(TextInput, {
                value: draft.settings?.maxRounds == null ? '' : String(draft.settings.maxRounds),
                mono: true,
                onChange: (next) => patch(['settings', 'maxRounds'], next === '' ? undefined : Number(next)),
              })),
              h(Field, { label: t('fTimeout') }, h(TextInput, {
                value: draft.settings?.timeoutMs == null ? '' : String(draft.settings.timeoutMs),
                mono: true,
                onChange: (next) => patch(['settings', 'timeoutMs'], next === '' ? undefined : Number(next)),
              })),
            ),
          ),
        ),
        h(
          'div',
          { className: 'tm-footer' },
          h('span', { className: `tm-msg${status.tone === 'ok' ? ' ok' : status.tone === 'bad' ? ' bad' : ''}` }, status.text || t('keyStored')),
          dirty ? h('span', { className: 'tm-chip warn' }, t('dirty')) : null,
        ),
      )
    }

    /* ------------------------------------------------------------ 装配 */

    function apply(ctx) {
      const t = ctx.locale.bind(NS)

      ctx.effect(() => ctx.locale.register(NS, DICT), 'tri-model: dictionaries')

      ctx.effect(() => {
        const tagId = 'dsh-tri-model/settings.css'
        const style = document.createElement('style')
        style.dataset.plugin = 'dsh-tri-model'
        style.dataset.pluginCss = tagId
        style.textContent = CSS
        document.head.appendChild(style)
        return () => {
          style.remove()
        }
      }, 'tri-model: styles')

      const form = ctx.configForms.get(NS)
      const Page = () => TriModelPage({}, { form, remote: ctx.remote, t })

      ctx.effect(
        () =>
          ctx.configForms.whileServed([NS], () =>
            ctx.slots.inject('settings.section', () =>
              ctx.slots.register({ name: 'settings.section', id: 'tri-model', order: 25, label: () => t('title') }, Page),
            ),
          ),
        'tri-model: settings page',
      )
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.credentials', 'configForms'],
      apply,
    }
  },
})
