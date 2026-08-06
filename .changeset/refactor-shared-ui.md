---
"repo-ai-cli": patch
---

refactor: 提取共享 UI helpers（lib/ui.ts）、LLM config 构造器、LLM CLI options，消除三个命令间的重复代码；修复 readme 命令 progress 在 --json 下漏判的问题
