---
"repo-ai-cli": patch
---

fix: 敏感文件过滤 —— 不再把含明文密钥的文件作为 LLM 材料

- `readme` / `ask` / `fix` 收集项目材料时，文件名敏感（`.env*`、`*.env`、私钥、证书容器、`id_rsa`）或内容命中密钥模式（GitHub/AWS/PEM/OpenAI/Bearer，含带引号与无引号赋值）的文件不再发送给 LLM，被排除的文件逐一 warn 上报，`--json` 模式下静默
- 内容检测按形态而非长度判定：属性访问、camelCase 标识符、连字符词组、下划线标识符、占位符一律放行，经 4 个真实仓库标定误伤为 0
- `.env.example` / `.env.sample` / `.env.template` 公开模板显式放行（此前会被扩展名白名单静默丢弃）
- `secrets` 命令的打码对纯数字值改用首尾各 2 位（原为 4 位，短秘密空间下暴露过多明文）
- 测试 236 → 242
