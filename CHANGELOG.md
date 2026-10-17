# repo-ai-cli

## 0.8.0

### Minor Changes

- fac9eda: 新增 4 条仓库级智能命令，把「仓库」从命令的输入升级为可分析对象。全部零新增运行时依赖；三条离线命令不调用 LLM、不联网。

  - **`map` 仓库地图（离线）**：语言分布、入口文件、模块分组与限深目录树，一屏看清仓库结构；支持 `--depth` / `--focus` / `--json`。
  - **`impact` 变更影响分析（离线）**：新增文件级 import 图（支持 ESM 的 `.js → .ts` 映射、无扩展名与 `index` 解析、Python 相对导入含 `from . import x`），反向找出受影响的文件与测试；`--diff` 直接分析暂存改动，**删除与重命名也能算出影响面**（重命名同时分析新旧路径）。
  - **`health` 仓库健康审计（离线）**：一次检查社区文件、CI、测试、包元数据、大文件与疑似密钥；`package.json` 损坏或缺关键字段（含 `name`）会明确报出。`--strict` 可接入 CI，`--network` 才做依赖更新与漏洞检查。与 `doctor` 的分工是「仓库本身」vs「本机环境」。
  - **`onboard` 上手导读（AI）**：生成 `ONBOARDING.md`（架构地图、模块职责、运行与测试、从哪开始改），落盘前做结构校验，不合格不写文件。

  命令总数 24 → **28**（叶子 33 → 37）。新增 `src/lib/repo-index.ts` 作为共享索引层；`collectFiles` 增加 `onSizeSkipped` 回调；`buildFileTree` 支持 `maxDepth`。

- 36bf924: `review-pr --comment`：把审查结论直接发回 PR，不用复制粘贴。

  - **默认只预览**：不带 `--yes` 时只打印将要发布的内容，一个字都不会发出去。
  - **需要 `GITHUB_TOKEN`**：读公开 PR 是匿名的，发评论需要写权限（公开仓库 `public_repo`，私有仓库 `repo`）；缺失时给出获取与设置指引。
  - **分级发布**：🔴 Critical / 🟠 Major 各占一条评论，便于在 PR 时间线上单独 resolve；🟡 Minor / 💡 Nit 与整体结论合并成一条，避免刷屏。分级按 markdown 标题切块并识别级别关键词（兼容 emoji、中文级别词、任意标题层级），不是按 emoji 精确匹配。
  - **交互模式下再加一道确认**：即使带了 `--yes`，TTY 里仍会问一次——误发到公开 PR 不可撤回。
  - 中途失败即中止（继续发多半会重复报同一个错），但会**如实列出已经发出去的那几条**，因为 PR 上确实已经多了评论。
  - 每条评论带一行「由 repo-ai-cli review-pr 生成」尾注。

- 36bf924: token 用量可观测：每条调用 LLM 的命令都会报告本次消耗。

  - 非 `--json` 模式向 **stderr** 打一行汇总（`token 用量: 输入 1204 / 输出 38 / 合计 1242`），stdout 产物通道保持干净。
  - `--json` 模式把用量并入输出对象的 `usage` 字段，不再往 stderr 打。
  - 缺失时显式给出 `usage: null` / 「未知」，**不用 0 顶替**——「未知」与「0」对按量付费的用户是两个完全不同的信息。
  - 兼容 `input_tokens` / `output_tokens` 命名，缺 `total` 时自行相加。
  - 流式路径同样采集（SSE 末帧的 usage），但**不会**为拿到它而添加 `stream_options` 参数：13 家提供商里只要有一家拒绝未知字段，整个流式就废了，代价不成比例。
  - 不做价格换算——模型价格变动频繁，写死在 CLI 里必然过期。

- 36bf924: 统一「给 LLM 的材料预算」参数命名：`--max-tokens` → `--budget-tokens`（readme / ask / fix），`--max` → `--max-commits`（changelog）。

  同一类语义此前有四种写法（`--max-tokens` / `--max` / `--max-diff-kb` / `--max-file-kb`），从 readme 换到 changelog 时「预算」突然变成提交条数、单位也从 token 变成 KB。只改语义最含混的两个；`--max-diff-kb` 与 `--max-file-kb` 本身表意清楚，保持不动。

  **迁移**：旧名仍然可用，不会立即失效——命中时会向 stderr 打印一行 deprecation 警告，且不出现在 `--help` 中（避免新用户学到旧写法）。新旧同时给出时以新名为准。旧名计划在下个 major 版本移除，届时才构成真正的破坏性变更。

### Patch Changes

- 36bf924: 修复配置文件的 5 个键形同虚设：`config set maxTokens | maxFileKb | maxDiffKb | maxOutputTokens | temperature` 保存成功、`config list` 也显示，但**没有任何命令读取它们**——命令始终走各自的 flag 默认值，用户以为设了默认值却毫无效果，且没有任何提示。

  现在「CLI 参数 > 配置文件 > 内置默认值」这条三层规则完整生效：

  - `maxTokens` → `readme` / `ask` / `fix` 的材料 token 预算
  - `maxFileKb` → `readme` / `explain` / `translate` / `test` / `refactor` / `ask` / `fix` / `secrets` 的单文件上限
  - `maxDiffKb` → `commit` / `review` / `review-pr` / `pr` 的 diff 上限
  - `maxOutputTokens` / `temperature` → 全部 12 条 AI 命令的 LLM 请求参数

  **命令行参数始终优先**：显式传了 `--budget-tokens 48000` 即使恰好等于内置默认值，也不会被配置覆盖。

  顺带修掉一处相关缺陷：通过废弃旧名（`--max-tokens` / `--max`）传值时会丢掉「用户显式给出」的标记，导致配置值静默盖过用户输入。

- dd47015: 收窄收集材料时的密钥启发式：连字符值只有**每一段都是纯字母**时才按「人写词组」放行。

  此前 `sk-live-9f3a2b7c1d4e5f60` 这类「词组前缀 + 随机段」会被当成说明文字放行，整个文件随材料发给第三方 LLM。现在含数字段的连字符值会被判定为密钥，文件不进 LLM 材料，并经 `onSensitiveSkipped` 上报。

  **这是收窄，不是根治**：纯字母的真密钥（`abc-def-ghi-jklmno`）仍会漏报。根治需要熵值 / 字符类混合度启发式，误杀源码的风险与工作量都大得多。已知局限已写进 `src/lib/collect-files.ts` 的注释。

- 36bf924: 修复 `release --bump <level> --tag` 的失败残留：此前先改 `package.json` 版本号、再检查 tag 是否已存在，于是「tag 已存在」这条失败路径会把版本号留在已 bump 的状态——命令报错退出，工作区却被改过了。

  现在 tag 冲突在改版本号之前判定，失败即无副作用。与本仓库其他命令「失败不写半成品」的约定一致（`readme` 落盘前结构校验、`writeOutput` 原子写）。

## 0.7.0

### Minor Changes

- 6f33a46: doctor 体检升级：配置文件合法性校验（坏 JSON 从静默吞错改为明确报 fail）、逐 provider API key 状态矩阵（13 家全列，仅离线检查非空与前缀）、激活 profile 存在性检查、网络代理环境变量状态、未通过项附修复建议；--json 模式在有 fail 项时退出码改为 1（与文本模式一致，CI 门禁可用）
- 4ae3566: 离线能力扩充（P1-3）：changelog 新增 `--format compact`（每条 commit 一行、纯本地渲染不调用 LLM，默认仍是 Keep-a-Changelog 风格不变）；stats 新增 `--since <date>` 按时间窗口统计提交与贡献者；`gitignore --list --json` 补命令级测试固定输出形状。
- 7bb13a6: feat: 新增 `review-pr` —— 审查线上 GitHub PR

  - `repo-ai-cli review-pr <pr>`：支持完整 URL（`https://github.com/owner/repo/pull/123`）、`owner/repo#123`、`owner/repo/pull/123` 三种引用格式
  - diff 经 GitHub 公开 API 拉取（原生 `fetch`），**无需安装 gh CLI、零新增依赖**；匿名可读公开仓库，403/429 给出限流提示与 `GITHUB_TOKEN` 建议
  - 审查 prompt、严重程度分级（Critical/Major/Minor/Nit）、diff 截断语义与 `review` 完全共用，不另起一套审查逻辑
  - `--json` 除审查结论外附带 PR 元信息（title/author/branch/baseBranch/state/draft/files/truncated）；PR 上下文头只走 stderr，stdout 保持可管道
  - 支持 `--focus`、`-o`、`--max-diff-kb` 及全部 LLM provider/profile 选项

  命令总数 23 → 24。测试 276 → 296。

### Patch Changes

- 71b4258: fix: 参数校验、输出纯净与预算会计收敛

  - 修复 `review --focus` 帮助文案（`bug`→`bugs`），与实现保持一致
  - 修复 `secrets --json` 命中时缺退出码 1（CI 门禁失效）；修复 `config set --provider` 非法值在 `--json` 下走文本报错且仍被保存的问题
  - 修复 `getDiff --all` 预算翻倍：tracked/untracked 共用预算池，合并后重算 `truncated`，`files` 只列实际输出内容
  - stdout 纯净化：`say`/`done`/非 TTY 进度改走 stderr；`commit` 非 TTY 只打印 message
  - 新增 `src/lib/options.ts`：commander 解析期拒绝非法数值（`intOption`/`temperatureOption`），命令内枚举统一 `parseEnum`，文件读取统一 `readTextCapped`（行边界截断）
  - `release` 严格校验（非法 semver/无 package.json/tag 已存在）；hooks 时间戳备份 + 卸载恢复
  - 新增 `npm run docs:check`（CLI surface 与 README 一致性检查）并接入 CI

- c5da46c: fix: 敏感文件过滤 —— 不再把含明文密钥的文件作为 LLM 材料

  - `readme` / `ask` / `fix` 收集项目材料时，文件名敏感（`.env*`、`*.env`、私钥、证书容器、`id_rsa`）或内容命中密钥模式（GitHub/AWS/PEM/OpenAI/Bearer，含带引号与无引号赋值）的文件不再发送给 LLM，被排除的文件逐一 warn 上报，`--json` 模式下静默
  - 内容检测按形态而非长度判定：属性访问、camelCase 标识符、连字符词组、下划线标识符、占位符一律放行，经 4 个真实仓库标定误伤为 0
  - `.env.example` / `.env.sample` / `.env.template` 公开模板显式放行（此前会被扩展名白名单静默丢弃）
  - `secrets` 命令的打码对纯数字值改用首尾各 2 位（原为 4 位，短秘密空间下暴露过多明文）
  - 测试 236 → 242

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
