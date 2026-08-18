# repo-ai-cli

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
