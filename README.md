# repo-ai-cli

**AI-powered repository helper CLI: generate bilingual READMEs and conventional commit messages from your codebase.**

**AI 驱动的仓库工具 CLI：从你的代码库一键生成中英双语 README 和规范的 commit message。**

[![CI](https://github.com/b8nw27v7wp-bit/repo-ai-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/b8nw27v7wp-bit/repo-ai-cli/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/repo-ai-cli.svg)](https://www.npmjs.com/package/repo-ai-cli)
[![npm downloads](https://img.shields.io/npm/dm/repo-ai-cli.svg)](https://www.npmjs.com/package/repo-ai-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js)](https://nodejs.org/)

> ⚡ 本 README 由 repo-ai-cli 自己生成（dogfooding）—— 下面就是它的真实输出效果。

---

## ✨ Features — 功能特性

- 📝 **AI-Generated Bilingual README** — Turn any local directory or GitHub repository into a polished, bilingual (English/Chinese) README with a single command.
  **AI 生成中英双语 README** — 通过一条命令，将任意本地目录或 GitHub 仓库转化为精美的中英双语 README。

- 🔖 **Conventional Commit Messages** — Automatically generate clear, conventional commit messages from your git diff, following best practices.
  **规范 commit message** — 根据你的 git diff 自动生成清晰、符合 Conventional Commits 规范的提交信息。

- 📜 **AI-Generated CHANGELOG** — Turn your git history into a Keep-a-Changelog-style CHANGELOG.md, automatically scoped since the last release tag.
  **AI 生成 CHANGELOG** — 将你的 git 提交历史整理为 Keep a Changelog 风格的 CHANGELOG.md，自动以最近一个发布 tag 为区间起点。

- ⚙️ **Persistent Config** — Save your provider, API key and defaults once with `repo-ai-cli config set`, no more env vars every time.
  **配置持久化** — 用 `repo-ai-cli config set` 一次保存提供商、API key 与默认参数，无需每次设置环境变量。

- 🔍 **AI Code Review** — Review your git diff with a single command, getting a severity-ranked (Critical/Major/Minor/Nit) report with fix suggestions, optionally scoped to bugs/security/style/perf.
  **AI 代码审查** — 用 `repo-ai-cli review` 一键审查你的 git diff，输出按严重程度分级的问题报告与修复建议，可聚焦 bug/安全/风格/性能。

- 💡 **Explain Code** — Point at a file (or a `file:line` region) and get a plain-language walkthrough of what it does and why.
  **代码解释** — 用 `repo-ai-cli explain src/lib/git.ts:38` 快速理解一段陌生代码的作用与逻辑。

- 🔀 **PR Description** — Generate a conventional PR title + markdown body from your branch diff against the base branch.
  **PR 描述生成** — 用 `repo-ai-cli pr` 根据当前分支与 base 的差异生成规范的 PR 标题与描述。

- 🏗️ **Project Scaffolding** — `repo-ai-cli init` scaffolds a ready-to-build TypeScript CLI or library (tsup + vitest), no LLM required.
  **项目脚手架** — `repo-ai-cli init` 一键生成可构建的 TypeScript CLI / 库项目骨架。

- ⚡ **Streaming Output** — `--stream` streams the LLM output token-by-token during `readme` / `changelog` generation for instant feedback.
  **流式输出** — `readme` / `changelog` 加 `--stream` 边生成边打印，实时反馈。

- 🧠 **Smart Token Budgeting** — Three-tier file prioritization and sampling ensure efficient use of your LLM token budget, even for large repositories.
  **智能 Token 预算管理** — 三层文件优先级与采样机制，即使面对大型仓库也能高效利用 LLM Token 预算。

- 🚀 **GitHub Repository Support** — Pass a GitHub URL or `owner/repo` shorthand; the tool shallow-clones the repo to a temp directory and cleans up automatically.
  **支持 GitHub 仓库** — 传入 GitHub URL 或 `owner/repo` 简写，工具会自动浅克隆到临时目录并在完成后清理。

- 💬 **Interactive & Scriptable** — Enjoy a modern interactive UI (spinner, confirm, select) in TTY mode, or use `--print` / `--json` for non-interactive scripting.
  **交互式与脚本友好** — 在 TTY 模式下享受现代化交互界面（spinner、确认、选择），或使用 `--print` / `--json` 参数进行非交互式脚本操作。

- 🛡️ **Robust Error Handling** — Automatic retries with exponential backoff for transient API errors, and graceful fallbacks to prevent corrupted output.
  **健壮的错误处理** — 对瞬时 API 错误进行指数退避重试，并提供优雅降级以防止输出损坏。

- 🔑 **BYOK (Bring Your Own Key)** — Use your own API key from 8+ providers (DeepSeek, OpenAI, Kimi, GLM, Qwen, MiniMax, Grok, SiliconFlow) or any OpenAI-compatible endpoint. Zero server-side costs, and your code is only sent to the API you configure.
  **BYOK 自带 API Key** — 支持 DeepSeek、OpenAI、Kimi、GLM、通义千问、MiniMax、Grok、硅基流动等 8+ 家国内外提供商，以及任意 OpenAI 兼容端点。零服务端成本，代码仅发送至你配置的 API。

- 🧪 **Comprehensive Testing** — 117+ unit and end-to-end tests covering file filtering, token budgeting, git integration, LLM error handling (incl. streaming), provider resolution, config persistence, and more.
  **全面测试覆盖** — 117+ 单元测试与端到端测试，覆盖文件过滤、Token 预算、Git 集成、LLM 错误处理（含流式）、提供商解析、配置持久化等核心逻辑。

---

## 🎬 Demo — 演示

> 📝 本 README 由 repo-ai-cli 自己生成（dogfooding）——上面的示例就是它的真实输出效果。
> 
> 录屏 GIF 待补充（clack spinner + 交互确认流演示）。

---

## 🚀 Quick Start — 快速开始

### Prerequisites — 环境要求

- **Node.js** ≥ 20
- **npm** (or your preferred Node package manager)
- **DeepSeek API Key** — [Get one here](https://platform.deepseek.com/)

### Installation — 安装

```bash
# Install globally
npm install -g repo-ai-cli

# Or run directly without installation
npx repo-ai-cli --help
```

### Set up your API Key — 配置 API Key

```bash
# 推荐：一次配置，长期生效（保存到 ~/.repo-ai/config.json）
repo-ai-cli config set provider deepseek
repo-ai-cli config set apiKey sk-xxx

# 或交互式向导
repo-ai-cli config init

# 查看/清除配置（apiKey 自动打码显示）
repo-ai-cli config list
repo-ai-cli config unset apiKey
repo-ai-cli config reset

# 传统方式：任何一家内置提供商的环境变量（任选其一）：
export DEEPSEEK_API_KEY=sk-xxx          # DeepSeek
export OPENAI_API_KEY=sk-xxx            # OpenAI
export MOONSHOT_API_KEY=sk-xxx          # Kimi
export ZHIPU_API_KEY=xxx                # 智谱 GLM
export DASHSCOPE_API_KEY=sk-xxx         # 通义千问
export MINIMAX_API_KEY=xxx              # MiniMax
export XAI_API_KEY=xxx                  # Grok
export SILICONFLOW_API_KEY=sk-xxx       # 硅基流动

# Or any custom OpenAI-compatible endpoint:
export LLM_BASE_URL=https://your-endpoint/v1
export LLM_API_KEY=sk-xxx

# Or select a provider explicitly per command:
repo-ai-cli readme --provider moonshot
repo-ai-cli readme --provider siliconflow --model Qwen/Qwen2.5-7B-Instruct
```

*配置优先级：CLI 参数 > 环境变量 > config 文件 > 默认值。Windows (cmd) 用 `set VAR=xxx`，PowerShell 用 `$env:VAR="xxx"`。*

### Generate a README — 生成 README

```bash
# From the current directory
repo-ai-cli readme

# From a specific local directory
repo-ai-cli readme /path/to/my-project

# From a GitHub repository
repo-ai-cli readme owner/repo
repo-ai-cli readme https://github.com/owner/repo

# Generate a Chinese-only README
repo-ai-cli readme -l zh

# Dry run: show statistics without calling the API
repo-ai-cli readme --dry-run
```

### Generate a Commit Message — 生成 commit message

```bash
# From staged changes (default)
repo-ai-cli commit

# Include unstaged changes
repo-ai-cli commit --all

# Print the message without interaction (script-friendly)
repo-ai-cli commit --print

# Force a specific commit type
repo-ai-cli commit --type feat
```

### Generate a CHANGELOG — 生成 CHANGELOG

```bash
# From the last git tag to HEAD (default)
repo-ai-cli changelog

# Custom git range
repo-ai-cli changelog --range v0.1.0..v0.2.0

# Print to stdout without writing the file
repo-ai-cli changelog --print

# English output
repo-ai-cli changelog -l en
```

### Review Your Code — 代码审查

```bash
# Review staged changes (default), print report to stdout
repo-ai-cli review

# Include unstaged changes
repo-ai-cli review --all

# Focus on a specific dimension
repo-ai-cli review --focus bugs
repo-ai-cli review --focus security

# Write the report to a file
repo-ai-cli review -o REVIEW.md
```

### Explain Code — 解释代码

```bash
# Explain a whole file
repo-ai-cli explain src/lib/git.ts

# Explain a specific region (line 38, or lines 10-40)
repo-ai-cli explain src/lib/git.ts:38
repo-ai-cli explain src/lib/git.ts:10-40

# Explain a certain function/symbol
repo-ai-cli explain src/lib/git.ts#getDiff

# Output language
repo-ai-cli explain src/lib/git.ts -l en
```

### Generate a PR Description — 生成 PR 描述

```bash
# Auto-detect base branch (origin/HEAD → main → master)
repo-ai-cli pr

# Explicit base branch
repo-ai-cli pr --base main
repo-ai-cli pr --base origin/main

# Create the PR directly via the GitHub CLI (gh)
repo-ai-cli pr --create

# Machine-readable
repo-ai-cli pr --json
```

### Scaffold a New Project — 脚手架新项目

```bash
# In the current directory (TypeScript CLI template)
repo-ai-cli init

# Create a new directory with a name
repo-ai-cli init my-cli

# Pick a template (ts-cli | ts-lib) and overwrite existing files
repo-ai-cli init my-lib --template ts-lib --force
```

### Script-friendly JSON output — 脚本友好的 JSON 输出

所有命令支持 `--json`，输出机器可读结果，便于接入 CI/脚本：

```bash
repo-ai-cli readme --dry-run --json
# {"ok":true,"dryRun":true,"repo":"repo-ai","filesCollected":43,"estimatedTokens":20784,...}

repo-ai-cli commit --json
# {"ok":true,"message":"feat: add config persistence"}

repo-ai-cli changelog --json
# {"ok":true,"output":"E:\\repo-ai\\CHANGELOG.md","bytes":1234}

repo-ai-cli review --json
# {"ok":true,"review":"## 🔴 Critical\n...","files":["src/lib/ui.ts"],"truncated":false}

repo-ai-cli explain src/lib/git.ts --json
# {"ok":true,"file":"src/lib/git.ts","focus":null,"explanation":"..."}

repo-ai-cli pr --json
# {"ok":true,"base":"main","branch":"feat/x","title":"feat: ...","body":"..."}

repo-ai-cli init my-cli --json
# {"ok":true,"template":"ts-cli","directory":".../my-cli","created":["package.json",...]}
```

---

## ⚙️ Configuration — 配置说明

### Environment Variables — 环境变量

| Variable | Required | Description |
|----------|----------|-------------|
| `DEEPSEEK_API_KEY` | One of | DeepSeek API key |
| `OPENAI_API_KEY` | One of | OpenAI API key |
| `MOONSHOT_API_KEY` | One of | Moonshot (Kimi) API key |
| `ZHIPU_API_KEY` | One of | 智谱 GLM API key |
| `DASHSCOPE_API_KEY` | One of | 通义千问 (DashScope) API key |
| `MINIMAX_API_KEY` | One of | MiniMax API key |
| `XAI_API_KEY` | One of | xAI (Grok) API key |
| `SILICONFLOW_API_KEY` | One of | 硅基流动 API key |
| `LLM_BASE_URL` + `LLM_API_KEY` | Custom | Any OpenAI-compatible endpoint |
| `LLM_MODEL` | No | Default model override |
| `GITHUB_MIRROR` | No | GitHub mirror prefix (default `https://gh-proxy.com/`), used when direct access fails |

*未显式指定 provider 时，工具按上表顺序自动选择第一个已配置 key 的提供商。*

### Command Options — 命令参数

#### `repo-ai-cli readme`

| Option | Description | Default |
|--------|-------------|---------|
| `[path-or-url]` | Local directory path or GitHub URL/`owner/repo` shorthand | `.` (current directory) |
| `-o, --output <file>` | Output file path | `README.md` |
| `-l, --language <lang>` | Output language: `bilingual` \| `zh` \| `en` | `bilingual` |
| `--dry-run` | Print statistics only, do not call the API | `false` |
| `--max-tokens <n>` | Token budget for the LLM call | `48000` |
| `--max-file-kb <n>` | Maximum single-file size to include (in KB) | `100` |
| `--stream` | Stream output token-by-token (TTY only) | `false` |
| `--provider <id>` | LLM provider: `deepseek` \| `openai` \| `moonshot` \| `zhipu` \| `qwen` \| `minimax` \| `xai` \| `siliconflow` | auto-detect |
| `--base-url <url>` | Custom OpenAI-compatible endpoint | provider default |
| `--model <name>` | Model name override | provider default |
| `--api-key <key>` | API key (prefer env vars) | env var |

#### `repo-ai-cli commit`

| Option | Description | Default |
|--------|-------------|---------|
| `--staged` | Use staged changes (git diff --cached) | `true` |
| `--all` | Include unstaged changes (git diff HEAD) | `false` |
| `--print` | Print the message without interaction | `false` |
| `--json` | Output machine-readable JSON | `false` |
| `--type <type>` | Force a commit type (e.g., `feat`, `fix`, `docs`) | Auto-detect |
| `--max-diff-kb <n>` | Maximum diff size to process (in KB) | `200` |
| `--provider <id>` | LLM provider (same as `readme`) | auto-detect |
| `--base-url <url>` | Custom OpenAI-compatible endpoint | provider default |
| `--model <name>` | Model name override | provider default |

#### `repo-ai-cli changelog`

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <file>` | Output file path | `CHANGELOG.md` |
| `-r, --range <range>` | Git range (`v1.0.0..` / `..HEAD` / `1.0.0..2.0.0`) | last tag..HEAD |
| `-n, --max <n>` | Max commits to consider | `50` |
| `-l, --language <lang>` | Output language: `zh` \| `en` | `zh` |
| `--dry-run` | Print statistics only, do not call the API | `false` |
| `--print` | Print to stdout without writing file | `false` |
| `--json` | Output machine-readable JSON | `false` |
| `--max-output-tokens <n>` | Max LLM output tokens | `4096` |
| `--temperature <n>` | Sampling temperature 0~2 | `0.5` |
| `--stream` | Stream output token-by-token (TTY only) | `false` |
| `--provider <id>` | LLM provider (same as `readme`) | auto-detect |
| `--base-url <url>` | Custom OpenAI-compatible endpoint | provider default |
| `--model <name>` | Model name override | provider default |

#### `repo-ai-cli review`

| Option | Description | Default |
|--------|-------------|---------|
| `--staged` | Use staged changes (git diff --cached) | `true` |
| `--all` | Include unstaged changes (git diff HEAD) | `false` |
| `-o, --output <file>` | Write review to file (default: stdout) | stdout |
| `--focus <area>` | Review focus: `all` \| `bugs` \| `security` \| `style` \| `perf` | `all` |
| `--json` | Output machine-readable JSON | `false` |
| `--max-diff-kb <n>` | Maximum diff size to process (in KB) | `200` |
| `--max-output-tokens <n>` | Max LLM output tokens | `4096` |
| `--temperature <n>` | Sampling temperature 0~2 | `0.3` |
| `--provider <id>` | LLM provider (same as `readme`) | auto-detect |
| `--base-url <url>` | Custom OpenAI-compatible endpoint | provider default |
| `--model <name>` | Model name override | provider default |

#### `repo-ai-cli explain`

| Option | Description | Default |
|--------|-------------|---------|
| `<file-or-region>` | File path, optionally `:line` / `:start-end` / `#symbol` | required |
| `-l, --language <lang>` | `zh` \| `en` \| `bilingual` | `zh` |
| `--max-file-kb <n>` | Max file size to read (in KB) | `200` |
| `--json` | Output machine-readable JSON | `false` |
| `--max-output-tokens <n>` | Max LLM output tokens | `2048` |
| `--temperature <n>` | Sampling temperature 0~2 | `0.3` |
| `--provider <id>` | LLM provider (same as `readme`) | auto-detect |
| `--base-url <url>` | Custom OpenAI-compatible endpoint | provider default |
| `--model <name>` | Model name override | provider default |

#### `repo-ai-cli pr`

| Option | Description | Default |
|--------|-------------|---------|
| `--base <branch>` | Base branch | auto-detect (origin/HEAD→main→master) |
| `--create` | Create the PR via `gh pr create` after generating | `false` |
| `--json` | Output machine-readable JSON | `false` |
| `--max-diff-kb <n>` | Maximum diff size to process (in KB) | `200` |
| `--max-output-tokens <n>` | Max LLM output tokens | `4096` |
| `--temperature <n>` | Sampling temperature 0~2 | `0.5` |
| `--provider <id>` | LLM provider (same as `readme`) | auto-detect |
| `--base-url <url>` | Custom OpenAI-compatible endpoint | provider default |
| `--model <name>` | Model name override | provider default |

#### `repo-ai-cli init`

| Option | Description | Default |
|--------|-------------|---------|
| `[name]` | Project name (default: current directory) | current dir |
| `-t, --template <id>` | `ts-cli` \| `ts-lib` | `ts-cli` |
| `-f, --force` | Overwrite existing files | `false` |
| `--json` | Output machine-readable JSON | `false` |

*交互式（TTY）下未指定 `--template` / `[name]` 时会弹出模板选择与项目名提示。*

#### `repo-ai-cli config`

| Command | Description |
|---------|-------------|
| `config init` | Interactive wizard: pick provider + enter API key |
| `config set <key> <value>` | Set a value (`provider`/`baseUrl`/`model`/`apiKey`/`maxTokens`/...) |
| `config get <key>` | Print a value (apiKey masked) |
| `config list` (`ls`) | Show all persisted config (apiKey masked) |
| `config unset <key>` | Remove a value |
| `config reset` | Clear all persisted config |

*配置文件位于 `~/.repo-ai/config.json`（POSIX 0600 权限），apiKey 明文存储但仅在用户目录内。*

---

## 🛠 Tech Stack — 技术栈

| Category | Technology |
|----------|------------|
| Runtime | Node.js ≥ 20 |
| Language | TypeScript (strict mode) |
| CLI Framework | [commander](https://github.com/tj/commander.js) |
| Interactive UI | [@clack/prompts](https://github.com/natemoo-re/clack) |
| Output Styling | [picocolors](https://github.com/alexeyraspopov/picocolors) |
| LLM Provider | DeepSeek Chat API (OpenAI-compatible) |
| Bundler | [tsup](https://tsup.egoist.dev/) |
| Testing | [Vitest](https://vitest.dev/) |
| Linting | ESLint + typescript-eslint |
| Release Management | [Changesets](https://github.com/changesets/changesets) |
| CI/CD | GitHub Actions |

---

## 📁 Directory Structure — 目录结构

```
repo-ai-cli/
├── .changeset/                  # Changesets configuration
├── .github/
│   └── workflows/
│       ├── ci.yml               # Lint + test + build (Node 20/22 matrix)
│       └── release.yml          # Changesets → npm publish
├── src/
│   ├── commands/
│   │   ├── readme.ts            # `repo-ai readme` command
│   │   ├── commit.ts            # `repo-ai commit` command
│   │   ├── changelog.ts         # `repo-ai changelog` command
│   │   ├── review.ts            # `repo-ai review` command (code review)
│   │   ├── explain.ts           # `repo-ai explain` command (explain code)
│   │   ├── pr.ts                # `repo-ai pr` command (PR description)
│   │   ├── init.ts              # `repo-ai init` command (scaffolding)
│   │   └── config.ts            # `repo-ai config` command group
│   ├── lib/
│   │   ├── collect-files.ts     # File collection & filtering (token control core)
│   │   ├── file-tree.ts         # Text-based directory tree generation
│   │   ├── git.ts               # Git diff / staged status reading
│   │   ├── github.ts            # GitHub URL parsing & shallow cloning
│   │   ├── llm.ts               # DeepSeek API calls (retry + timeout)
│   │   ├── output.ts            # Atomic file writing
│   │   ├── token-budget.ts      # Token budget allocation & estimation
│   │   ├── templates.ts         # init scaffolding templates (ts-cli / ts-lib)
│   │   └── ui.ts                # Shared UI helpers (spinner / json / say)
│   ├── prompts/
│   │   ├── readme.ts            # README generation prompt template
│   │   ├── commit.ts            # Commit message generation prompt template
│   │   ├── changelog.ts         # CHANGELOG generation prompt template
│   │   ├── review.ts            # Code review prompt template
│   │   ├── explain.ts           # Code explanation prompt template
│   │   └── pr.ts                # PR title/description prompt template
│   ├── index.ts                 # CLI entry point (commander)
│   └── types.ts                 # Shared type definitions
├── test/                        # Vitest test files
├── eslint.config.js             # ESLint configuration
├── package.json                 # Project manifest
├── tsconfig.json                # TypeScript configuration
├── tsup.config.ts               # Bundler configuration
└── vitest.config.ts             # Test runner configuration
```

---

## 🤝 Contributing — 贡献指南

We welcome contributions! Here's how to get started:

### Development Setup — 开发环境搭建

```bash
# 1. Clone the repository
git clone https://github.com/b8nw27v7wp-bit/repo-ai-cli.git
cd repo-ai-cli

# 2. Install dependencies
npm install

# 3. Run tests
npm test

# 4. Run linting
npm run lint

# 5. Run type checking
npm run typecheck

# 6. Build the project
npm run build

# 7. Start development mode (watch)
npm run dev
```

### Project Conventions — 项目约定

- **Commit format**: Use `feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:` prefixes
- **Code style**: TypeScript strict mode; follow existing patterns
- **Testing**: All new features should include Vitest tests; CI runs lint + typecheck + test on Node 20/22

### Getting Started — 开始贡献

1. Fork the repository
2. Create your feature branch: `git checkout -b feat/my-feature`
3. Commit your changes: `git commit -m "feat: add new feature"`
4. Push to the branch: `git push origin feat/my-feature`
5. Open a Pull Request

---

## 📝 License — 许可证

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

*Generated with [repo-ai-cli](https://github.com/b8nw27v7wp-bit/repo-ai-cli) — dogfooding at its finest!* 🐶
