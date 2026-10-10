---
"repo-ai-cli": minor
---

feat: 新增 `review-pr` —— 审查线上 GitHub PR

- `repo-ai-cli review-pr <pr>`：支持完整 URL（`https://github.com/owner/repo/pull/123`）、`owner/repo#123`、`owner/repo/pull/123` 三种引用格式
- diff 经 GitHub 公开 API 拉取（原生 `fetch`），**无需安装 gh CLI、零新增依赖**；匿名可读公开仓库，403/429 给出限流提示与 `GITHUB_TOKEN` 建议
- 审查 prompt、严重程度分级（Critical/Major/Minor/Nit）、diff 截断语义与 `review` 完全共用，不另起一套审查逻辑
- `--json` 除审查结论外附带 PR 元信息（title/author/branch/baseBranch/state/draft/files/truncated）；PR 上下文头只走 stderr，stdout 保持可管道
- 支持 `--focus`、`-o`、`--max-diff-kb` 及全部 LLM provider/profile 选项

命令总数 23 → 24。测试 276 → 296。
