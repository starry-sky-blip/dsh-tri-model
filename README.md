# dsh-tri-model

把多个厂商的模型接进同一条流水线：**规划 → 执行 → 审查 → 自动返工**。地址、密钥、协议、模型与层级全部在 DSH 设置里改，改完下一次调用就生效。

这是一个 DSH 原生插件（bundle），不是 MCP 连接器：Host 半边注册四个工具，Client 半边在设置面板里画一整页。

## 装上

```powershell
# 从 npm
dsh plugin --profile desktop add dsh-tri-model

# 或者指向本地目录（改代码时用，node_modules 里会是软链）
dsh plugin --profile desktop add "file:D:\path\to\tri-model"
```

`--profile` 换成你自己的 profile 名（桌面版是 `desktop`）。装完会标 `restart-required`，重启 DSH 后生效。

## 在哪配置

**设置 → 多模型协同**（排在「插件」之后）。三段：

| 段 | 干什么 |
|---|---|
| 端点 | 地址 + 协议（openai / anthropic / gemini）+ 密钥 + 可选路径覆盖 |
| 模型 | 显示名、真实模型名、挂哪个端点、能力上限（`caps`） |
| 层级 | 顺序、类型（plan / execute / review / judge / route / custom）、用哪个模型、返工门禁 |
| 全局 | 返工轮数上限、单次超时 |

密钥只写进 DSH 凭据库（引用名形如 `tri-model.<端点 id>`），设置文件里不留明文。想让某个端点用环境变量，给端点加 `envKey` 即可。

## 四个工具

| 工具 | 用途 |
|---|---|
| `tri_run` | 按配置的层级跑一次协同，返回成品 + 逐层过程 |
| `tri_review` | 只审不改：PASS/FAIL + 分数 + 问题清单 |
| `tri_config` | 读写配置（show / validate / set-endpoint / add-model / add-layer / move-layer …） |
| `tri_doctor` | 对每个模型发一条最小请求，报延迟、协议与降级情况 |

## `/tri` 命令

在输入框里打 `/tri`，空格后面写任务：

```
/tri 给 tri-model 写一段 200 字的项目简介，面向不熟悉 DSH 的读者
```

命令把这条任务作为一条用户消息排进当前会话，由主 agent 调 `tri_run` 跑一遍。结果是一轮正常的对话：有工具卡（带计时、可中途取消），成品与「### 过程」逐层展开，留在上下文里可以继续追问。配置改动立刻影响下一次 `/tri`。

## 协议

`protocol` 与 `baseUrl`、`apiKey` 同级，不是默认值：

| 取值 | 接口 | 鉴权 |
|---|---|---|
| `openai`（默认） | `/chat/completions` | `Authorization: Bearer` |
| `anthropic` | `/v1/messages` | `x-api-key` + `anthropic-version` |
| `gemini` | `/models/{model}:generateContent` | `x-goog-api-key` |

优先级：模型级 > 端点级 > `openai`。请求形状、响应解析、错误文案的差异全部关在 `lib/protocols.js` 里，引擎只看到统一的 `{content, reasoning, finish, usage}`。

## 目录

```
index.js          Host 半边：Config、四个工具、密钥解析
client.js         Client 半边：设置页（settings.section）
lib/config.js     Config schema（schemastery）+ 默认流水线
lib/engine.js     调用、按报错降级、分段审查、流水线与返工
lib/ops.js        tri_config 的动作 → SettingsPathOp
lib/protocols.js  三种协议的请求/响应适配
cordis.patch.yml  Loader 行（id: tri-model）
locale/{zh,en}.json
```

`lib/protocols.js` 与 CodeBuddy 版 `tri-model-plugin/mcp/protocols.mjs` 同源；两边一起改比较省事。

## 已知边界

- 协议只覆盖三家；Bedrock、Vertex 这类「同一家、不同壳」的入口要各加一个分支。
- 层级目前严格顺序执行，没有扇出/并行。
- 审查层解析 JSON 时，模型不听话就按「文本里找 PASS/FAIL」兜底。
- 请求是一次性返回（`stream: false`）：跑的过程中只有工具卡在计时，没有逐字输出；一层慢就整条慢（`settings.timeoutMs` 控制单次上限）。
