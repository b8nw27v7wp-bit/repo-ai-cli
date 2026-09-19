# repo-ai-cli

## 0.7.0

### Minor Changes

- 5bf812f: doctor 体检升级：配置文件合法性校验（坏 JSON 从静默吞错改为明确报 fail）、逐 provider API key 状态矩阵（13 家全列，仅离线检查非空与前缀）、激活 profile 存在性检查、网络代理环境变量状态、未通过项附修复建议；--json 模式在有 fail 项时退出码改为 1（与文本模式一致，CI 门禁可用）

### Patch Changes

- f5fca2f: fix: 参数校验、输出纯净与预算会计收敛

  - 修复 `review --focus` 帮助文案（`bug`→`bugs`），与实现保持一致
  - 修复 `secrets --json` 命中时缺退出码 1（CI 门禁失效）；修复 `config set --provider` 非法值在 `--json` 下走文本报错且仍被保存的问题
  - 修复 `getDiff --all` 预算翻倍：tracked/untracked 共用预算池，合并后重算 `truncated`，`files` 只列实际输出内容
  - stdout 纯净化：`say`/`done`/非 TTY 进度改走 stderr；`commit` 非 TTY 只打印 message
  - 新增 `src/lib/options.ts`：commander 解析期拒绝非法数值（`intOption`/`temperatureOption`），命令内枚举统一 `parseEnum`，文件读取统一 `readTextCapped`（行边界截断）
  - `release` 严格校验（非法 semver/无 package.json/tag 已存在）；hooks 时间戳备份 + 卸载恢复
  - 新增 `npm run docs:check`（CLI surface 与 README 一致性检查）并接入 CI

## 0.6.0

### Minor Changes

- 34a23fc: v0.6.0 深度拓展：

  - **provider 扩展至 13 家**：新增 Ollama（本地部署、无需 API key）、OpenRouter、Groq、火山方舟、Google Gemini（OpenAI 兼容端点）
  - **Profile 多配置系统**：`config set/unset --profile <name>`、`config use <name>`、`config rm-profile <name>`，支持多套 provider/model/key 配置快速切换；所有 AI 命令支持 `--profile` 参数
  - **全局 `--verbose` 调试日志**（或 `REPO_AI_VERBOSE=1`）：输出到 stderr，覆盖 LLM 请求、重试、provider 解析、git clone 镜像回退
  - **`deps --outdated` / `--audit`**：封装 npm outdated / npm audit，友好表格 + JSON 输出，高危漏洞时退出码非 0（CI 门禁）
  - **新命令 `badges`**：离线检测仓库上下文（CI workflow / npm / LICENSE / node engines / GitHub remote）自动生成 README 徽章
  - **新命令 `contributing`**：离线生成 CONTRIBUTING.md（中/英），自动探测包管理器与测试命令
  - `doctor` 显示激活的 profile；`config init` 支持 Ollama 免 key 流程与 `--profile`

  命令总数 21 → 23。测试 173 → 210。

## 0.5.0

### Minor Changes

- feat: 新增 ask / fix / release 命令 + 材料收集抽取复用

  - `repo-ai ask <问题>`：针对当前代码库提问（RAG），复用文件收集 + token 预算，支持 `--stream`
  - `repo-ai fix <bug 描述>`：AI 定位根因并给出结构化修复建议（不改代码）
  - `repo-ai release`：语义化版本建议（默认只建议、离线幂等）+ `--bump major|minor|patch|auto` + `--tag`
  - 抽取 `lib/materials.ts`（`collectMaterials` + `buildMaterialsSection`），readme / ask / fix 复用，去重
  - `lib/version.ts`（`parseSemver`/`computeNext`/`suggestNextVersion`/`bumpPackageVersion`）、`git.ts createTag`

- feat: 新增 secrets / doctor 命令 + 健壮性收敛

  - `repo-ai secrets`：离线扫描硬编码密钥（GitHub/AWS/Slack/Stripe/OpenAI/Google/私钥/通用赋值），按 critical/high/medium 分级、打码输出、CI 退出码
  - `repo-ai doctor`：Node 版本 / git 仓库 / 持久化配置 / LLM key 四项离线体检
  - `git.ts getDiff --all` 纳入 untracked 新文件（commit/review --all 不再漏掉新增文件）；新增 `getLatestTag`
  - `config set` 增加数值范围校验（temperature 0~2、其余正整数）
  - 清理：移除 `llm.ts` 死代码 catch；`changelog` 复用 `getLatestTag`；`config init` 去重 clack 动态导入

- feat: 新增 test / refactor / hooks 命令 + 告警输出统一

  - `repo-ai test <文件>`：AI 生成单元测试（vitest / jest / node:test），覆盖主要/边界/异常分支
  - `repo-ai refactor <文件>`：AI 重构建议（all/readability/perf/complexity/types），不改代码
  - `repo-ai hooks <install|uninstall|list>`：安装 `prepare-commit-msg` 钩子，commit 时自动调用 `repo-ai commit`（覆盖前自动备份）
  - 新增 `lib/git-hooks.ts`、`prompts/test.ts`、`prompts/refactor.ts`；`git.ts` 新增 `getGitDir`
  - ui.ts 新增 `warn()`，统一各命令截断告警输出并正确遵循 `--json` 静默

- feat: 新增 gitignore / license / stats / deps / translate 命令

  - `repo-ai gitignore <模板...>`：内置 16 套语言/框架模板（node/python/go/rust/java/nextjs/vue/react/docker/...），离线
  - `repo-ai license <id>`：内置 6 套开源许可（MIT/ISC/BSD-2/BSD-3/Unlicense/MIT-0），自动注入年份与署名
  - `repo-ai stats`：仓库统计（文件/LOC/语言分布/提交数/贡献者），离线
  - `repo-ai deps`：解析 package.json / requirements.txt 依赖清单，离线
  - `repo-ai translate <文件> --to zh|en|bilingual`：AI 文档中英互译
  - `git.ts` 新增 `getRepoMeta` / `getGitUserName`

## 0.4.0

### Minor Changes

- feat: 新增 explain / pr / init 命令 + LLM 流式输出

  - `repo-ai explain <文件[:行号]>`：解释指定文件或代码区域，支持 `zh/en/bilingual`
  - `repo-ai pr [--base <分支>]`：根据当前分支相对 base 的差异生成 PR 标题 + 描述（JSON 解析）
  - `repo-ai init [名称] [-t ts-cli|ts-lib]`：脚手架新项目（纯本地，不调用 LLM）
  - readme / changelog 新增 `--stream`：TTY 下边生成边打印（`llm.ts` 新增 `streamChatCompletion`，SSE 解析）
  - `git.ts` 新增 `detectBaseBranch` / `getBranchDiff` / `getCurrentBranch`；提取共享 `runDiff` 截断逻辑
  - `explain` 支持 `file#symbol` 符号聚焦；`pr` 支持 `--create`（调用 `gh pr create`）；`init` 支持 TTY 下交互式选择模板与项目名

- feat: 新增 `repo-ai review` 命令 —— 对 git diff 做 AI 代码审查，按严重程度分级输出结构化报告；支持 `--focus`（all/bugs/security/style/perf）、`-o` 写文件、`--json` 脚本输出

### Patch Changes

- 512de2b: refactor: 提取共享 UI helpers（lib/ui.ts）、LLM config 构造器、LLM CLI options，消除三个命令间的重复代码；修复 readme 命令 progress 在 --json 下漏判的问题

## 0.3.0

### Minor Changes

- 3ece885: feat: v0.3.0 — config 持久化 + changelog 命令 + JSON 输出

  - 新增 `repo-ai config` 子命令组（init/set/get/list/unset/reset），配置持久化到 `~/.repo-ai/config.json`，优先级 CLI > env > config > 默认值
  - 新增 `repo-ai changelog` 命令：从 git log（默认最近 tag 之后）AI 生成 Keep-a-Changelog 风格 CHANGELOG.md
  - 新增 `--json` 输出模式（readme/commit/changelog/config），脚本友好
  - 修复非 TTY 下 progress 重复打印

## 0.2.0

### Minor Changes

- - 新增 `--max-output-tokens` 和 `--temperature` CLI 选项（readme 默认 8192/0.7，commit 默认 1024/0.3）
  - 删除未使用的 `picocolors` 依赖
  - diff 截断现在尊重 hunk 边界，避免切碎 diff 结构
  - 简化 `handleError` 错误处理
  - 修复 `resolveLLMConfig` 步骤 3 中的死代码
