---
"repo-ai-cli": minor
---

统一「给 LLM 的材料预算」参数命名：`--max-tokens` → `--budget-tokens`（readme / ask / fix），`--max` → `--max-commits`（changelog）。

同一类语义此前有四种写法（`--max-tokens` / `--max` / `--max-diff-kb` / `--max-file-kb`），从 readme 换到 changelog 时「预算」突然变成提交条数、单位也从 token 变成 KB。只改语义最含混的两个；`--max-diff-kb` 与 `--max-file-kb` 本身表意清楚，保持不动。

**迁移**：旧名仍然可用，不会立即失效——命中时会向 stderr 打印一行 deprecation 警告，且不出现在 `--help` 中（避免新用户学到旧写法）。新旧同时给出时以新名为准。旧名计划在下个 major 版本移除，届时才构成真正的破坏性变更。
