# 发布清单

包名 `dsh-tri-model`。这个名下原本有一个同账号的占位版本 `0.0.0-stage`（早先占位留下），`1.0.2` 已于 2026-11-02 正式发布。

## 已经就绪

- `package.json`：无 `private`，`license: MIT`，`icon`，`engines.dsh: >=0.2.0-rc.1 <0.3.0-0`，`dependencies.@deepseek-ai/schemastery ^3.18.1`
- `files` 白名单逐个核对过；`node_modules` 不会被打进包（npm 永远不打），所以 schemastery 必须是真依赖
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
