# repo-ai-cli

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
