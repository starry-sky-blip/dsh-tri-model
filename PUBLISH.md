# 发布清单

包名 `dsh-tri-model`（npm 上该名字 2026-11-02 查过，未被占用）。

## 已经就绪

- `package.json`：无 `private`，`license: MIT`，`icon`，`engines.dsh: >=0.2.0-rc.1 <0.3.0-0`，`dependencies.@deepseek-ai/schemastery ^3.18.1`
- `files` 白名单逐个核对过；`node_modules` 不会被打进包（npm 永远不打），所以 schemastery 必须是真依赖
- `LICENSE`（MIT）、`README.md`、`locale/{zh,en}.json`、`icon.svg` 都在发布清单里
- 打包 → 干净目录安装 → 加载冒烟：4 个工具 + `/tri` 命令 + 设置页注册都正常（见下）

## 还需要你补的

1. `package.json` 里加 `repository`（和可选的 `author`/`homepage`）——只有你知道代码要推到哪个仓库，我不编 URL：

   ```json
   "repository": { "type": "git", "url": "git+https://github.com/<你>/<仓库>.git" },
   "homepage": "https://github.com/<你>/<仓库>#readme",
   "author": "<你的名字> <邮箱>"
   ```

2. 发布：`npm publish --access public`（需要 npm token；名字可用就直接 `dsh-tri-model`，撞名就换 `@scope/dsh-tri-model`）
3. 上架：去 https://github.com/awesome-dsh-plugin/awesome-dsh-plugin 提 PR，在列表里加一条。市场站点与 `dshmarket` 会在一天内自动收录。

## PR 条目（可直接粘）

```
- [dsh-tri-model](https://github.com/<你>/<仓库>) — 多模型分层协同：把多个厂商的模型接进一条流水线，规划 → 执行 → 审查 → 自动返工，审查 FAIL 自动带问题清单重写。端点是「地址 + 密钥 + 协议」，协议支持 OpenAI 兼容 / Anthropic / Gemini，模型可覆盖端点协议；全部配置在 DSH 设置面板里改，密钥只写进凭据库。提供 4 个工具（tri_run / tri_review / tri_config / tri_doctor）和 `/tri` 斜杠命令。
```

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
