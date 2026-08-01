# repo-ai-cli

## 0.2.0

### Minor Changes

- - 新增 `--max-output-tokens` 和 `--temperature` CLI 选项（readme 默认 8192/0.7，commit 默认 1024/0.3）
  - 删除未使用的 `picocolors` 依赖
  - diff 截断现在尊重 hunk 边界，避免切碎 diff 结构
  - 简化 `handleError` 错误处理
  - 修复 `resolveLLMConfig` 步骤 3 中的死代码
