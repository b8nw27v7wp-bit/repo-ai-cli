---
"repo-ai-cli": patch
---

fix: 参数校验、输出纯净与预算会计收敛

- 修复 `review --focus` 帮助文案（`bug`→`bugs`），与实现保持一致
- 修复 `secrets --json` 命中时缺退出码 1（CI 门禁失效）；修复 `config set --provider` 非法值在 `--json` 下走文本报错且仍被保存的问题
- 修复 `getDiff --all` 预算翻倍：tracked/untracked 共用预算池，合并后重算 `truncated`，`files` 只列实际输出内容
- stdout 纯净化：`say`/`done`/非 TTY 进度改走 stderr；`commit` 非 TTY 只打印 message
- 新增 `src/lib/options.ts`：commander 解析期拒绝非法数值（`intOption`/`temperatureOption`），命令内枚举统一 `parseEnum`，文件读取统一 `readTextCapped`（行边界截断）
- `release` 严格校验（非法 semver/无 package.json/tag 已存在）；hooks 时间戳备份 + 卸载恢复
- 新增 `npm run docs:check`（CLI surface 与 README 一致性检查）并接入 CI
