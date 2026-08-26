---
"repo-ai-cli": minor
---

doctor 体检升级：配置文件合法性校验（坏 JSON 从静默吞错改为明确报 fail）、逐 provider API key 状态矩阵（13 家全列，仅离线检查非空与前缀）、激活 profile 存在性检查、网络代理环境变量状态、未通过项附修复建议；--json 模式在有 fail 项时退出码改为 1（与文本模式一致，CI 门禁可用）
