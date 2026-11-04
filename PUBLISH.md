# 发布清单

包名 `dsh-tri-model`。这个名下原本有一个同账号的占位版本 `0.0.0-stage`（早先占位留下），`1.0.2` 于 2026-11-02 首发，`1.0.3` 于 2026-11-03 发布（依赖改 peer + 补截图），`1.0.4` 于 2026-11-04 发布（设置页重做 + `/tri-doctor`）。

## 已经就绪

- `package.json`：无 `private`，`license: MIT`，`icon`，`engines.dsh: >=0.2.0-rc.1 <0.3.0-0`，官方包声明为 `peerDependencies.@deepseek-ai/schemastery ^3.18.1`（宿主提供，避免 profile 里出现重复运行时）
- `files` 白名单逐个核对过；`node_modules` 不会被打进包
- 截图放在本仓库 `assets/`，由 `screenshots.json` 声明（市场详情页读取，1–8 张、相对路径）
- `LICENSE`（MIT）、`README.md`、`locale/{zh,en}.json`、`icon.svg` 都在发布清单里
- 打包 → 干净目录安装 → 加载冒烟：4 个工具 + `/tri` 命令 + 设置页注册都正常（见下）

## 已发布（2026-11-02）

| 项 | 值 |
|---|---|
| npm 包 | `dsh-tri-model@1.0.2`（`latest` 已指向），账号 `fengyuxu <2691255106@qq.com>` |
| 发布时刻 | 2026-11-02T03:34:39Z（本地 11:34） |
| tarball | 32246 B / 13 个文件 / 解包 109583 B，shasum `8a9a46e585cb9002ae9c1c46f5fe851a90a1951a` |
| 一致性 | 线上包与工作区逐文件比对一致；本地 `npm pack` 复算 sha1 相同 |
| GitHub | https://github.com/starry-sky-blip/dsh-tri-model（`165a6ea`） |

`package.json` 的 `repository` / `homepage` / `bugs` / `author` 已补齐。

## 已发布（2026-11-03 · 1.0.3）

| 项 | 值 |
|---|---|
| 改动 | `@deepseek-ai/schemastery` 从 `dependencies` 移到 `peerDependencies`（模板推荐项）；新增 `assets/` 两张图 + `screenshots.json` |
| 为什么 | 官方 `@deepseek-ai/*` 由宿主解析，声明成依赖会在 profile 里装出第二份运行时；code-review 等成熟插件也是纯 peer 风格 |
| 验证 | `npm pack` 13 个文件 / 32721 B；`node --check` 0；`import()` 冒烟 `LOAD OK Config,apply,inject` |
| 兼容 | engines 未变（`>=0.2.0-rc.1 <0.3.0-0`），1.0.2 用户直接升 1.0.3 无配置变化 |

截图规格（contributing.md）：1–8 张、必须是 GitHub 托管的位图、相对路径不能以 `/` 开头或含 `..`；不声明的话市场会从 README 抽图。

## 已发布（2026-11-04 · 1.0.4）

| 项 | 值 |
|---|---|
| 改动 | 设置页重做：供应商预设（9 项，一次填好地址/协议/路径/密钥引用）、卡片折叠 + 一行摘要、「展开全部/收起全部」、标识随名称自动生成、删除有引用时先确认；新增 `/tri-doctor` 命令 |
| 为什么 | 端点/模型一多，全字段铺开的卡片几乎没法看；「测试连接」按钮做不了（客户端 CORS + 宿主 remote 只对编译期生成的服务开放），改用 `/tri-doctor` 贴延迟表 |
| 验证 | `client.js` 无头渲染冒烟（mock React + 焦点事件）：7 张卡 / 7 个折叠头 / 单行默认展开 / 9 个预设按钮，点预设新增一行后 8 张卡；Host 半边 4 工具 + 2 命令；`npm pack` 逐文件核对 |
| 兼容 | 配置结构未变（只改设置页与新增命令），1.0.3 升 1.0.4 无需迁移 |

## 待发布（1.0.5）

| 项 | 值 |
|---|---|
| 改动 | ① 设置页：模型卡「标识」不再被长 hint 挤成竖排（`.tm-label-text` 不换行 + hint 省略号），模型卡改 2×2 栅格；② 「真实模型名」改成**可输入下拉**（ComboBox），撤掉输入框下的候选胶囊行；③ 预设扩到 17 个供应商；④ 面板底部常驻「测连接：保存后发 /tri-doctor」提示；⑤ 内置候选模型 ID 只保留**实测调通**的（火山方舟 plan 入口 10 个），其余一律不写；⑥ 新增 `/tri-models` 命令，向端点要 `/models` 现拉真实 ID |
| 为什么 | 用户实测 `deepseek-v4.1` 在 plan 入口 404（「does not support the agent plan feature」），说明凭空写的候选会直接把人带沟里；同时候选胶囊行挤在字段下方很难看 |
| 验证 | `npm run preflight`（含 `/tri-models` 的 URL/鉴权/解析断言）、`scripts/combo-test.mjs` 13 项、`scripts/render-test`、`scripts/host-test` 全 PASS；真实探测：`deepseek-v4.1` 404、`deepseek-v4.1-flash`/`kimi-k3.1-pro`/`glm-5.3` 等 200 |
| 兼容 | 配置结构未变；若此前填了不存在的模型 ID，需改成真实 ID（`/tri-models` 或服务商文档） |

## 剩余一步：awesome 收录

提交一个文件 `data/plugins/starry-sky-blip__dsh-tri-model.yml`（`category: model`），内容见下节。两条硬门槛（contributing.md 里写明，CI 自动检查）：

- 仓库创建满 **1 天**：本仓库建于 2026-11-02，最早 **2026-11-03** 再提，否则会被 CI 直接拒
- 给仓库打上 **`dsh-plugin`** topic（仓库首页 About 右侧齿轮 → Topics）

另外可选：`npm deprecate dsh-tri-model@0.0.0-stage "占位版本，请安装 1.0.2"` 把占位版本标掉。

## PR 内容（可直接粘）

新建文件 `data/plugins/starry-sky-blip__dsh-tri-model.yml`：

```yaml
url: https://github.com/starry-sky-blip/dsh-tri-model
name: starry-sky-blip/dsh-tri-model
category: model
description:
  en: 'Multi-model layered pipeline for DeepSeek Harness: a strong model plans, a fast one drafts, a third reviews, and a failed review is reworked automatically — endpoints, protocols, models and gates all configured from the DSH settings panel.'
  zh: 'DSH 多模型分层协同插件：强模型规划、快模型执行、第三方模型审查，审查 FAIL 自动带问题清单返工；端点、协议、模型、层级全部在设置面板里配。'
```

注意 `description.en` 里有 `: `（冒号加空格）必须加引号，否则 YAML 解析失败。`icon` 留空会自动回退到作者头像（该字段只收 GitHub 托管的**位图**，`icon.svg` 不适用）。

## 发布前自检命令

**先跑 `node scripts/preflight.mjs`**（或 `npm run preflight`）：它不启动 DSH，检查文件 BOM/JSON、`package.json` 字段、宿主 `apply()` 注册的工具与命令、客户端能否注册设置页并渲染出关键元素。1.0.5 那次「重启后插件整个消失」就是 `package.json` 被写成带 BOM 导致的——宿主直接 `skipping profile bundle "dsh-tri-model": SyntaxError: Unexpected token '﻿'`，所以这条必须在发版前过。

**动过设置页组件再跑 `node scripts/combo-test.mjs`**：用桩 React 驱动真实源码，验证「可输入下拉」的展开/收起/回填/失焦关闭这条交互链（13 项断言），页面渲染测试跑不出这类行为。

```powershell
$node = "$env:APPDATA\nvm\v22.19.0\node.exe"
$pnpm = 'D:\浏览器安装\deepseek\resources\runtime\primary-runtime\dependencies\pnpm\bin\pnpm.cjs'

# 1) 打包（看 Tarball Contents，不该有 node_modules）
& $node $pnpm pack --pack-destination "$env:TEMP\pack"

# 2) 干净安装
mkdir "$env:TEMP\install-test"; cd "$env:TEMP\install-test"
'{ "name": "t", "private": true, "type": "module" }' | Set-Content package.json
& $node $pnpm add "file:$env:TEMP/pack/dsh-tri-model-1.0.0.tgz"

# 3) 加载冒烟：import 后 apply 一个 stub ctx，应打印 4 个工具 + tri 命令
```

## 版本约定

- 改代码/行为 → minor（`1.1.0`）
- 只改文案、图标、locale → patch
- 改 Config 结构或 `dsh.bundle` / `dsh.client` 声明 → minor 起，并在 README 写迁移说明（老配置可能对不上）
