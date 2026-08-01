# repo-ai — AI 仓库工具 CLI 开发计划

> 第三个简历作品：一个务实、开箱即用、真实用户会装的 npm CLI 工具。
> 定位：`npx repo-ai readme` / `npx repo-ai commit`，两条命令解决两个真实痛点。

---

## 1. 项目概述

### 1.1 一句话定位

**repo-ai 是一个用 AI 帮开发者处理仓库杂活的命令行工具**：一键生成中英双语 README，一键根据 git diff 生成规范 commit message。

### 1.2 为什么做这个（简历叙事）

| 已有作品 | 形态 | 证明的能力 |
|---|---|---|
| GitHub-ZH-Plugin | 油猴插件（用户端） | 前端、浏览器生态、CI 测试 |
| codingagent | Next.js 全栈应用 | 全栈、AI 应用、产品化 |
| **repo-ai（本作）** | **npm CLI（开发者工具）** | **Node 生态、CLI 工程、npm 发布、LLM 工程化** |

三个作品构成完整闭环：**浏览器端 → Web 全栈 → 开发者工具链**，覆盖三种主流软件交付形态。CLI 是开发者工具类中最经典、简历最容易被认可的一类（同赛道：commitizen、cz-cli、readme-ai 等均有可观 star）。

### 1.3 目标用户与真实价值

- **README 场景**：开源项目作者、课程作业/毕设项目要交文档的人。痛点：写 README 枯燥、中英双语要写两遍。
- **Commit 场景**：不习惯写规范 commit 的开发者。痛点：`git commit -m "update"` 满天飞，PR/Changelog 无法自动生成。
- **务实点**：BYOK（Bring Your Own Key），用户用自己的 DeepSeek API Key，零服务端成本、零隐私泄露（代码只发往用户自己配置的 API）。

### 1.4 非目标（明确不做，防范围蔓延）

- ❌ 不做多 LLM 提供商适配（第一版只支持 DeepSeek，架构上留接口）
- ❌ 不做 GUI / VSCode 插件 / Web 服务
- ❌ 不做 AI 写代码、AI review 等"大而全"功能
- ❌ 不做自建代理 / 云端托管（BYOK 意味着无后端）

---

## 2. 技术栈与选型理由

| 选型 | 理由 |
|---|---|
| Node.js ≥ 20（引擎要求） | 原生 `fetch`，不需要 axios；`node:fs/promises` 足够 |
| TypeScript | 类型安全，CLI 库生态成熟，简历加分 |
| commander | CLI 参数解析事实标准，`--help` 免费获得 |
| @clack/prompts | 现代化交互 UI（spinner / confirm / select），截图好看，上简历演示效果好 |
| picocolors | 极轻量彩色输出（clack 依赖链已含） |
| vitest | 与 Vite 同源，快、零配置、TS 原生支持 |
| tsup | 打包成单文件 `dist/index.js`，发布干净（deps 外置） |
| changesets | 版本管理 + 自动生成 changelog + 配合 Actions 自动发布（标准做法） |
| GitHub Actions | `ci.yml`（lint+test）+ `release.yml`（npm publish） |
| DeepSeek API | `https://api.deepseek.com/chat/completions`，OpenAI 兼容格式，便宜 |

**刻意不用**：axios（原生 fetch 够）、inquirer（clack 更现代）、eslint 全家桶（只装必需的 typescript-eslint）、changesets 若嫌重可降级为手动 tag（见 §7）。

---

## 3. 项目结构

```
E:\repo-ai\
├── src/
│   ├── index.ts              # 入口：commander 定义，命令分发
│   ├── commands/
│   │   ├── readme.ts         # repo-ai readme 命令
│   │   └── commit.ts         # repo-ai commit 命令
│   ├── lib/
│   │   ├── llm.ts            # DeepSeek API 调用（fetch + 重试 + 超时）
│   │   ├── collect-files.ts  # 本地目录文件收集 + 过滤（核心：token 控制）
│   │   ├── token-budget.ts   # token 预算分配（按文件优先级配额）
│   │   ├── github.ts         # GitHub URL 解析 + 浅克隆到临时目录
│   │   ├── git.ts            # git diff / staged 状态读取
│   │   ├── file-tree.ts      # 目录树生成（text tree 格式）
│   │   └── output.ts         # 结果写入（README.md / stdout）
│   ├── prompts/
│   │   ├── readme.ts         # README 生成 prompt 模板
│   │   └── commit.ts         # commit message 生成 prompt 模板
│   └── types.ts              # 共享类型定义
├── test/
│   ├── collect-files.test.ts # 过滤规则测试（核心）
│   ├── token-budget.test.ts
│   ├── github.test.ts
│   ├── git.test.ts
│   ├── llm.test.ts           # mock fetch 测重试/错误处理
│   └── prompts.test.ts       # prompt 组装测试
├── .github/workflows/
│   ├── ci.yml                # lint + test（Node 20/22 矩阵）
│   └── release.yml           # changesets → npm publish
├── .changeset/               # changesets 配置
├── tsup.config.ts
├── vitest.config.ts
├── tsconfig.json
├── package.json              # bin: { "repo-ai": "./dist/index.js" }
└── README.md                 # 用 repo-ai 自己生成的 README（dogfooding）
```

---

## 4. 命令设计

### 4.1 `repo-ai readme` — 生成中英双语 README

```
repo-ai readme [path-or-url]
```

**参数**
- `[path-or-url]`：可选，默认 `.`。本地目录路径 或 `https://github.com/owner/repo`（或 `owner/repo` 简写）。
- `-o, --output <file>`：输出文件，默认 `README.md`（远程仓库时默认 stdout 预览）
- `-l, --language <lang>`：`bilingual`（默认，中英双语）/ `zh` / `en`
- `--dry-run`：只打印"将发送给 AI 的内容统计"（文件数、token 估算），不调用 API

**行为流程**
1. 输入归一化：本地路径 → 直接分析；GitHub URL/简写 → `git clone --depth 1` 到系统临时目录（完成后清理）。
2. **文件收集（token 控制核心）**：
   - 尊重 `.gitignore`（用 `git check-ignore` 或简单规则引擎）
   - 硬性跳过：`.git/`、`node_modules/`、`dist/`、`build/`、`coverage/`、`.next/`、锁文件（`package-lock.json`、`pnpm-lock.yaml`、`yarn.lock`、`bun.lockb`）、所有二进制/图片/视频/字体
   - 单文件大小上限 100KB（超限跳过）
   - 扩展名白名单：源码类（`.ts .js .py .go .rs .java .vue .jsx .tsx`）、配置类（`.json .yaml .yml .toml .ini`）、文档类（`README*`、`LICENSE*` 优先收录）
3. **token 预算分配**（默认总预算 ~8k token，`--max-tokens` 可调）：
   - 优先级 1：README 现状、LICENSE、package.json（最反映项目定位）
   - 优先级 2：目录树（全量，文本格式很省 token）+ 主要入口文件（`src/index.*`、`main.*`、`setup.py` 等）
   - 优先级 3：其余源码**采样**（每个文件取前 60 行，超出预算即截断）
   - 预算耗尽的文件在给 AI 的消息中标注 `[truncated]`，防止 AI 误以为内容完整
4. 组装 prompt（模板见 §5）→ 调用 DeepSeek → 解析 markdown → 写文件。
5. 生成失败/输出为空 → 重试 1 次 → 仍失败则打印原始响应并提示，不写坏文件。

### 4.2 `repo-ai commit` — 根据 git diff 生成 commit message

```
repo-ai commit [--staged | --all]
```

**参数**
- `--staged`（默认）：只看 `git diff --cached`
- `--all`：含未暂存改动（`git diff HEAD`）
- `--print`：只输出 message 不交互（脚本友好）
- `--type <type>`：限定类型（feat/fix/docs/refactor/...）
- `--max-diff-kb <n>`：diff 截断上限，默认 200KB

**行为流程**
1. 校验：必须在 git 仓库内；无可用 diff → 提示退出（exit 1）。
2. diff 超限 → 截断并在 prompt 中标注 `[diff truncated: X/Y KB]`。
3. 调用 DeepSeek → 得到 **conventional commits 格式** 的 message（`feat: ...`，正文要点式，可选 scope）。
4. 交互（clack）：展示建议 → `[使用 / 重新生成 / 编辑 / 放弃]`；`--print` 模式直接 stdout。
5. 用户确认后输出 message（不自动 commit，保持工具单一职责——自动 commit 是危险行为）。

**质量约束（prompt 里写死）**：禁止非英文正文（类型前缀英文、正文可用中文或英文——第一版固定英文正文+中文说明可选）；单行 subject ≤ 72 字符；不得编造 diff 中不存在的改动。

---

## 5. Prompt 设计要点

### 5.1 README prompt 骨架
```
你是资深开源维护者。根据以下项目材料生成 README。
【硬性要求】
- 中英双语：英文为主，中文段落紧随其后（或 ## README 中文版 分区）
- 结构：项目名+一句话定位 → 功能特性(emoji列表) → 截图占位 → 快速开始 → 配置说明 → 技术栈 → 目录结构 → 贡献指南 → License
- 只描述材料中真实存在的内容，不确定的写 TODO 占位，禁止编造功能
【项目材料】
<文件树>
<优先级1文件>
<优先级2文件>
<优先级3文件（标注 truncated）>
```

### 5.2 Commit prompt 骨架
```
你是熟悉 conventional commits 的工程师。根据 git diff 生成 commit message。
- 格式：<type>(<scope>): <subject>，正文用 - 列出要点
- type 从 feat/fix/docs/refactor/perf/test/chore 中选
- 不得描述 diff 中不存在的改动；不写 "update"/"fix bug" 这类空话
- subject 不超过 72 字符
【diff】
<diff 内容>
```

---

## 6. 测试策略

| 测试对象 | 关键用例 |
|---|---|
| collect-files | 跳过 node_modules/锁文件/二进制；.gitignore 生效；100KB 上限；README 优先 |
| token-budget | 预算耗尽截断顺序正确；`[truncated]` 标注；0 文件时抛错 |
| github | URL 解析（`owner/repo`、`https://...`、带分支）；临时目录清理 |
| git | staged/all 模式；非 git 仓库报错；超限截断 |
| llm | mock fetch：成功/超时/429/500/空响应 → 重试逻辑；API key 缺失时报友好错误 |
| prompts | 模板变量注入；truncated 标注传递 |

CI 中 `vitest run` + `tsc --noEmit` + `eslint`。测试**不调用真实 API**（mock fetch），保证 CI 零成本可复现。

---

## 7. 发布与 CI/CD

### ci.yml（每次 push / PR）
```yaml
jobs:
  test:
    strategy: { matrix: { node-version: [20, 22] } }
    steps: checkout → setup-node → npm ci → lint → typecheck → test
```

### release.yml（changesets 标准流）
1. PR 合并 changeset → `changesets/action` 自动开 version PR
2. version PR 合并打 tag → 触发 `npm publish`（`NPM_TOKEN` secret）
3. 发布前 `npm run build`，`files: ["dist"]` 白名单，确保包体干净

**降级方案**（若 changesets 觉得重）：手动 `npm version patch && git push --tags`，workflow 监听 `v*` tag 发布。第一版推荐直接上 changesets，简历叙事里"自动发布流水线"是加分项。

---

## 8. 里程碑（每步可验收）

### M1 — 脚手架 + readme 本地版（核心路径打通）
- [x] npm 包初始化、tsup/vitest/eslint/tsconfig 就位
- [x] commander 骨架：`repo-ai --help` 双命令注册
- [x] collect-files + token-budget + file-tree 实现（**本阶段核心，先把过滤规则写对**）
- [x] llm.ts：DEEPSEEK_API_KEY 校验、fetch 调用、超时/重试
- [x] readme 命令本地目录版端到端可用
- **验收**：✅ 对 codingagent 仓库跑 `repo-ai readme`，产出可读的双语 README

### M2 — GitHub URL 支持 + 打磨
- [x] github.ts：URL 解析 + 浅克隆 + 清理（含镜像回退）
- [x] `--language`、`--dry-run`、`--max-tokens` 参数
- [x] clack 交互体验（spinner、成功/失败提示）
- **验收**：✅ `repo-ai readme b8nw27v7wp-bit/codingagent` 一键出文档；`--dry-run` 显示 token 估算

### M3 — commit 命令
- [x] git.ts diff 读取（staged/all、超限截断）
- [x] commit prompt + 生成 + clack 确认流（使用/重生成/编辑/放弃）
- [x] `--print` 脚本模式
- **验收**：✅ 对真实改动跑出规范 message，确认后可复制

### M4 — 测试 + CI + 发布上线
- [x] 补齐 §6 测试矩阵（66 个测试），CI 全绿
- [x] changesets 配置，release.yml 打通
- [x] npm 发布 0.1.0 真实可用（包名 repo-ai-cli）
- **验收**：✅ `npm i -g repo-ai-cli` 后两个命令都能用（已验证）；GitHub Actions CI + Release 徽章全绿

### M5 — 文档自举 + 简历素材
- [x] 用 repo-ai 生成自身 README（dogfooding，README 里直接展示效果）
- [ ] README 加 GIF 演示（clack 交互录屏）— 录屏待用户操作
- [x] 写简历条目：一句话价值 + 数据（66 测试、8+ 提供商、npm 已发布）

---

## 9. 风险与对策

| 风险 | 对策 |
|---|---|
| DeepSeek 输出不稳定（JSON/空响应） | 重试 1 次 + 原始响应兜底输出，绝不静默写坏文件 |
| token 超限（大仓库） | 三层预算机制 + `--max-tokens` + `[truncated]` 标注 |
| diff 太大 | 200KB 截断 + 标注；提示用户分次 commit |
| 用户没配 API Key | 启动时友好报错 + README 写清 `export DEEPSEEK_API_KEY=...`（Windows: `set`） |
| 中文输出乱码 | 统一 UTF-8，prompt 明确要求 markdown 格式 |
| 范围蔓延 | §1.4 非目标清单，M1-M5 严格按验收线走 |

---

## 10. 简历条目（预写）

> **repo-ai-cli** — TypeScript CLI 工具（npm 发布 0.1.0，GitHub Actions 自动 CI/CD）
> 用 AI 自动生成中英双语 README 与规范 commit message；实现 token 预算控制、.gitignore 感知的文件收集、LLM 调用重试与降级、GitHub 远程仓库浅克隆（含国内镜像回退）；66 单测覆盖过滤/预算/错误处理/提供商解析核心逻辑；支持 8+ 家国内外 LLM 提供商（DeepSeek/OpenAI/Kimi/GLM/通义/MiniMax/Grok/硅基流动）及任意 OpenAI 兼容端点；BYOK 零服务端成本。

---

*计划版本：v1.0 · 2026-07-31 · 待用户确认后从 M1 开始执行*
