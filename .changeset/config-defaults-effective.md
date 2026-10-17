---
"repo-ai-cli": patch
---

修复配置文件的 5 个键形同虚设：`config set maxTokens | maxFileKb | maxDiffKb | maxOutputTokens | temperature` 保存成功、`config list` 也显示，但**没有任何命令读取它们**——命令始终走各自的 flag 默认值，用户以为设了默认值却毫无效果，且没有任何提示。

现在「CLI 参数 > 配置文件 > 内置默认值」这条三层规则完整生效：

- `maxTokens` → `readme` / `ask` / `fix` 的材料 token 预算
- `maxFileKb` → `readme` / `explain` / `translate` / `test` / `refactor` / `ask` / `fix` / `secrets` 的单文件上限
- `maxDiffKb` → `commit` / `review` / `review-pr` / `pr` 的 diff 上限
- `maxOutputTokens` / `temperature` → 全部 12 条 AI 命令的 LLM 请求参数

**命令行参数始终优先**：显式传了 `--budget-tokens 48000` 即使恰好等于内置默认值，也不会被配置覆盖。

顺带修掉一处相关缺陷：通过废弃旧名（`--max-tokens` / `--max`）传值时会丢掉「用户显式给出」的标记，导致配置值静默盖过用户输入。
