---
"repo-ai-cli": patch
---

修复 `release --bump <level> --tag` 的失败残留：此前先改 `package.json` 版本号、再检查 tag 是否已存在，于是「tag 已存在」这条失败路径会把版本号留在已 bump 的状态——命令报错退出，工作区却被改过了。

现在 tag 冲突在改版本号之前判定，失败即无副作用。与本仓库其他命令「失败不写半成品」的约定一致（`readme` 落盘前结构校验、`writeOutput` 原子写）。
