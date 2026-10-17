---
"repo-ai-cli": minor
---

新增 4 条仓库级智能命令，把「仓库」从命令的输入升级为可分析对象。全部零新增运行时依赖；三条离线命令不调用 LLM、不联网。

- **`map` 仓库地图（离线）**：语言分布、入口文件、模块分组与限深目录树，一屏看清仓库结构；支持 `--depth` / `--focus` / `--json`。
- **`impact` 变更影响分析（离线）**：新增文件级 import 图（支持 ESM 的 `.js → .ts` 映射、无扩展名与 `index` 解析、Python 相对导入含 `from . import x`），反向找出受影响的文件与测试；`--diff` 直接分析暂存改动，**删除与重命名也能算出影响面**（重命名同时分析新旧路径）。
- **`health` 仓库健康审计（离线）**：一次检查社区文件、CI、测试、包元数据、大文件与疑似密钥；`package.json` 损坏或缺关键字段（含 `name`）会明确报出。`--strict` 可接入 CI，`--network` 才做依赖更新与漏洞检查。与 `doctor` 的分工是「仓库本身」vs「本机环境」。
- **`onboard` 上手导读（AI）**：生成 `ONBOARDING.md`（架构地图、模块职责、运行与测试、从哪开始改），落盘前做结构校验，不合格不写文件。

命令总数 24 → **28**（叶子 33 → 37）。新增 `src/lib/repo-index.ts` 作为共享索引层；`collectFiles` 增加 `onSizeSkipped` 回调；`buildFileTree` 支持 `maxDepth`。
