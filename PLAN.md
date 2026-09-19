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

### M6 — v0.3.0 拓展：config 持久化 + changelog 命令 + JSON 输出
- [x] `repo-ai config` 子命令组（init/set/get/list/unset/reset），配置持久化到 `~/.repo-ai/config.json`
- [x] 配置优先级：CLI 参数 > 环境变量 > config 文件 > 默认值（providers.ts 支持 `config` 输入）
- [x] `repo-ai changelog` 命令：git log 区间 → AI 生成 Keep-a-Changelog 风格 CHANGELOG.md
- [x] `git.ts getLog()`：commit 列表读取（range 区间 + 正文批量获取）
- [x] 全命令 `--json` 输出模式（readme/commit/changelog/config），脚本友好
- [x] 修复非 TTY 下 progress 重复打印（update + stop 各打一次）
- [x] 测试 66 → 88（config 读写/打码、provider 优先级、changelog prompt、getLog）
- **验收**：✅ 三条命令真实 LLM 生成均通过（NVIDIA 免费端点冒烟）；config set/list/unset/reset 全流程可用

### M7 — v0.3.1 重构：共享 UI helpers + 去重
- [x] `src/lib/ui.ts`：统一 emitJson/say/done/fail/progress + jsonMode 状态（TTY spinner / 非 TTY 静态行 / --json 静默三分支）
- [x] 三个命令（readme/commit/changelog）删除本地重复 helpers，改用 ui.ts；修复 readme progress 漏判 jsonMode 的不一致
- [x] `llm.ts llmConfigFromOptions()`：三个命令重复的 LLMConfig 构造提取（maxOutputTokens → maxTokens 映射）
- [x] `index.ts withLLMOptions()`：消除 3 × 4 行重复的 --provider/--base-url/--model/--api-key option 定义
- [x] `config.ts writeConfigAtomic()`：saveConfig/unsetConfig 重复的 tmp+rename 原子写入提取（unset 也补上 0600 权限）
- [x] 测试 88 全绿，tsc/eslint/build 干净；--help 各命令 LLM options 齐全，--json 输出无噪音

### M8 — `repo-ai review` 代码审查命令
- [x] `prompts/review.ts`：审查 prompt（按严重程度分级 + `--focus` 五维度）
- [x] `commands/review.ts`：读 git diff（复用 git.ts）→ 生成 → stdout/写文件/--json
- [x] `types.ts ReviewOptions` + `index.ts` 注册（复用 withLLMOptions）
- [x] `test/review-prompt.test.ts`：prompt 组装 + focus 规则测试
- [x] changeset 记录 `minor` 变更
- **验收**：`repo-ai review` 对暂存改动输出分级报告；`--focus security` 聚焦安全；`--json` 输出结构化

### M9 — explain / pr / init 命令 + 流式输出
- [x] `lib/llm.ts` 新增 `streamChatCompletion`（SSE 解析、onToken 回调），提取共享 `buildRequest`
- [x] readme / changelog 接入 `--stream`（TTY 下边生成边打印）
- [x] `prompts/explain.ts` + `commands/explain.ts`：`explain <文件[:行号]>` 解释代码（聚焦窗口 + 行号）
- [x] `prompts/pr.ts`（`parsePrResult` JSON/文本回退）+ `commands/pr.ts`：`pr` 生成 PR 标题+描述
- [x] `lib/git.ts` 新增 `detectBaseBranch` / `getBranchDiff` / `getCurrentBranch`，提取 `runDiff`
- [x] `lib/templates.ts` + `commands/init.ts`：`init` 脚手架（ts-cli / ts-lib，纯本地）
- [x] 测试 88 → 117（stream/explain/pr/templates/branch helpers）
- [x] `explain` 支持 `file#symbol` 符号聚焦；`pr` 支持 `--create`（gh pr create）；`init` 支持 TTY 交互式选择模板/项目名
- **验收**：`explain` 读文件到 LLM 环节；`pr` 正确检测 base；`init --json` 产出完整项目；`--stream` SSE 拼接正确

### M10 — secrets / doctor 命令 + 健壮性收敛
- [x] 新增 `repo-ai secrets`：离线扫描硬编码密钥（GitHub/AWS/Slack/Stripe/OpenAI/Google/私钥/通用赋值），按 critical/high/medium 分级、打码输出、CI 退出码
- [x] 新增 `repo-ai doctor`：Node 版本 / git 仓库 / 持久化配置 / LLM key 四项体检（离线）
- [x] `lib/secret-patterns.ts`（模式表 + maskValue）、`lib/scan-secrets.ts`、`lib/doctor.ts`
- [x] `git.ts getDiff --all` 纳入 untracked 新文件（commit/review --all 不再漏掉新增文件）；新增 `getLatestTag`
- [x] `config set` 数值范围校验（temperature 0~2、其余正整数）；提取 `validateNumericValue`
- [x] 移除 `llm.ts` 死代码 catch；`changelog.ts defaultRange` 改用 `getLatestTag`；`config.ts init` 去重 clack 动态导入
- [x] 测试 118 → 135（scan-secrets/doctor/config-validation/untracked）
- **验收**：`secrets --severity high --json` 命中并打码；`doctor --json` 四项齐全；`getDiff --all` 含 untracked

### M11 — 仓库工具集（gitignore / license / stats / deps / translate）
- [x] `gitignore`：内置 16 套语言/框架模板，可组合 + 去重，`--list` 查看，离线
- [x] `license`：内置 6 套开源许可（MIT/ISC/BSD-2/BSD-3/Unlicense/MIT-0），自动注入年份/署名
- [x] `stats`：文件数 / LOC / 语言分布 / 提交数 / 贡献者（`getRepoMeta`），离线
- [x] `deps`：解析 package.json / requirements.txt，离线
- [x] `translate`：AI 文档中英互译（zh/en/bilingual），复用 llm.ts
- [x] `git.ts` 新增 `getRepoMeta` / `getGitUserName`
- [x] 测试 135 → 152（gitignore/license/stats/deps/translate prompt）
- **验收**：5 条离线命令 `--json` 全通；`translate` 到 LLM 环节正确失败（无 key）

### M12 — P0 路线图：test / refactor / hooks + 代码审查
- [x] `test` 命令：AI 生成单元测试（vitest/jest/node-test），覆盖正常/边界/异常分支，禁止编造 API
- [x] `refactor` 命令：AI 重构建议（all/readability/perf/complexity/types），只给建议不改代码
- [x] `hooks` 命令：prepare-commit-msg 钩子 install/uninstall/list，覆盖前自动备份旧钩子
- [x] `lib/git-hooks.ts`（HOOK_MARKER 识别）、`prompts/test.ts`、`prompts/refactor.ts`、`git.ts getGitDir`
- [x] 代码审查：`ui.ts` 新增 `warn()`，统一 commit/review/pr/readme 截断告警并正确遵循 `--json` 静默
- [x] 测试 152 → 163（test/refactor prompt、hooks 安装/备份/卸载）
- **验收**：`hooks install/uninstall/list` 端到端可用；`test`/`refactor` 到 LLM 环节正确失败（无 key）

### M13 — ask / fix / release + 材料收集去重
- [x] `ask` 命令：针对代码库提问（RAG），复用 `collectFiles` + `token-budget`，支持 `--stream`
- [x] `fix` 命令：根据 bug 描述定位根因 + 结构化修复建议（不改代码）
- [x] `release` 命令：语义化版本建议（离线幂等）+ `--bump major|minor|patch|auto` + `--tag`
- [x] 抽取 `lib/materials.ts`（`collectMaterials` / `buildMaterialsSection`），readme/ask/fix 复用去重
- [x] `lib/version.ts`（`parseSemver`/`computeNext`/`suggestNextVersion`/`bumpPackageVersion`）、`git.ts` `createTag`
- [x] 测试 163 → 173（ask/fix prompt、version）
- **验收**：`release --json` 正确建议 0.5.0（feat→minor）；`ask`/`fix` 到 LLM 环节正确失败（无 key）

### M14 — v0.6.0 深度拓展：provider 扩展 + profiles + verbose + deps 检查 + badges/contributing
- [x] **provider 13 家**：+Ollama（本地无 key，`optionalApiKey`）/OpenRouter/Groq/火山方舟/Gemini（OpenAI 兼容）
- [x] **Profile 多配置**：config.json 新增 `profiles.<name>` + `activeProfile`；`loadConfig(profile)` 合并语义（顶层 ← profile 覆盖）；`config set/unset/get --profile`、`config use`、`config rm-profile`、`config init --profile`；全部 11 个 AI 命令 + withLLMOptions 支持 `--profile`
- [x] **`--verbose` 全局调试**：`lib/log.ts`（stderr、时间戳），program.hook("preAction") 启用；llm.ts（请求 URL/重试）、github.ts（clone 直连/镜像回退）、npm-checks 埋点；`REPO_AI_VERBOSE=1` 环境变量兜底
- [x] **`deps --outdated/--audit`**：`lib/npm-checks.ts` 封装 npm outdated/audit（退出码 1 = 有结果的正常情况；Windows 走 `cmd.exe /d /s /c npm` 规避 .cmd EINVAL 与 DEP0190）；友好表格 + JSON
- [x] **`badges` 命令**：离线检测 git remote/npm name/LICENSE/CI workflow/node engines → 生成 CI/npm/downloads/license/node/stars 徽章（`lib/badges.ts`）
- [x] **`contributing` 命令**：中/英模板，自动探测 owner/repo、包管理器（lockfile）、test 命令（`lib/contributing.ts`），`--force` 覆盖保护
- [x] `doctor` 显示激活 profile；命令总数 21 → 23
- [x] 测试 173 → 210（profiles 13 项 / log 3 / badges 5 / contributing 3 / npm-checks 8 / providers-v2 5 / 原有回归）
- **验收**：typecheck+lint+test 全绿；CLI 冒烟：profile set/use/list/rm 端到端、badges 对自身仓库生成 6 枚徽章（dogfooding）、contributing --json、deps --outdated/--audit 真实输出（含高危漏洞提示）、--verbose 调试行

### M15 — 优化收敛：参数校验 + 输出纯净 + 预算会计 + 文档 CI
- [x] `src/lib/options.ts`：`intOption`/`temperatureOption`（commander 解析期拒绝非法值，不再有 NaN 透传）、`parseEnum`（JSON 感知枚举校验）、`readTextCapped`（行边界截断）
- [x] `review --focus` 帮助文案 `bug`→`bugs`，与实现/测试/README 对齐
- [x] `secrets --json` 命中补退出码 1；`config set --provider` 非法值走 JSON 错误分支且不再落盘
- [x] `getDiff --all` 统一预算池：tracked 耗尽后不再追加 untracked；合并后重算 `truncated`；`files` 从最终输出重解析
- [x] stdout 纯净化：`say`/`done`/非 TTY progress 改走 stderr；`commit` 非 TTY 只打印 message；`commit` 重生成改用 `progress`
- [x] 各命令 language/focus/severity/target 迁移到 `parseEnum`（readme/changelog/explain/contributing/review/secrets/refactor/translate）
- [x] `release` 严格校验：非法 semver、`--bump` 无 package.json、tag 已存在均明确 fail；`computeNext` 非法输入回退 0.0.0
- [x] hooks 时间戳备份 + `uninstall` 恢复最新备份
- [x] `test`/`translate`/`refactor` 改用 `readTextCapped` + `warn()`
- [x] `scripts/check-docs.mjs` + `npm run docs:check` + CI 接入；补齐 README `badges`/`contributing` 选项表
- [x] 测试 210 → 236（options 7 / ui 2 / secrets 命令 1 / git 预算+tag 3 / hooks 备份恢复 2 / version 回退 1 / config provider JSON 1）
- **验收**：typecheck+lint+test+build+docs:check 全绿；CLI 冒烟：`--max-tokens abc` 报 usage 错误、`secrets --json` 命中退出码 1、`hooks` 安装/备份/恢复

---

## 11. 未来路线图（做大方向，按优先级排列）

| 优先级 | 方向 | 说明 |
|---|---|---|
| ~~P0~~ ✅ | `test` 命令 | 根据文件生成单元测试（已完成，支持 vitest/jest/node-test） |
| ~~P0~~ ✅ | `refactor` 命令 | 给出重构建议（已完成，5 个维度） |
| ~~P0~~ ✅ | `hooks` 命令 | 安装 git `prepare-commit-msg` 钩子（已完成） |
| ~~P1~~ ✅ | `ask` 命令 | 代码库问答 RAG（已完成，支持 --stream） |
| ~~P1~~ ✅ | `fix` 命令 | bug 定位 + 修复建议（已完成） |
| ~~P1~~ ✅ | `release` 命令 | 语义化版本建议 + bump + tag（已完成） |
| ~~P1~~ ✅ | `badges` / `contributing` 生成 | v0.6.0 完成：离线生成 README 徽章与 CONTRIBUTING.md |
| ~~P1~~ ✅ | `deps --outdated` / `--audit` | v0.6.0 完成：封装 npm outdated / npm audit，友好表格 + CI 退出码 |
| ~~P1~~ ✅ | 多 provider 补齐 | v0.6.0 完成：+Ollama（本地无 key）/OpenRouter/Groq/火山方舟/Gemini，共 13 家 |
| ~~P2~~ ✅ | `--verbose` 全局调试 | v0.6.0 完成：统一 debug 日志（stderr），覆盖网络/配置/克隆 |
| ~~P2~~ ✅ | 配置文件 profile | v0.6.0 完成：多套 provider/model 配置切换（`config use work` / `--profile work`） |
| P2 | GitHub PR review | `review-pr <url>` 拉取线上 PR 的 diff 做审查 |

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

> **repo-ai-cli** — TypeScript CLI 工具（npm 发布，GitHub Actions 自动 CI/CD）
> 23 条命令覆盖仓库助手全场景：AI 生成双语 README / 规范 commit / CHANGELOG / 代码审查 / 解释 / PR 描述 / 文档翻译 / 单元测试 / 重构建议 / bug 定位 / 代码库问答（RAG） / README 徽章 / 贡献指南，以及离线的密钥扫描 / 环境体检 / .gitignore / LICENSE / 仓库统计 / 依赖解析（--outdated / --audit）/ 项目脚手架 / git 钩子 / 语义化版本发布；实现 token 预算控制、.gitignore 感知文件收集、LLM 重试与流式输出、GitHub 仓库浅克隆（含镜像回退）、多 profile 配置切换、--verbose 调试日志；支持 13 家国内外 LLM 提供商（DeepSeek/OpenAI/Kimi/GLM/通义/MiniMax/Grok/硅基流动/Ollama 本地/OpenRouter/Groq/火山方舟/Gemini）及任意 OpenAI 兼容端点；BYOK 零服务端成本；210 单测覆盖核心逻辑。

---

*计划版本：v1.0 · 2026-07-31 · 待用户确认后从 M1 开始执行*
