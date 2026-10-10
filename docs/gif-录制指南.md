# README 演示 GIF 录制指南（PLAN M5 欠账项）

本文件是给维护者本人执行的录屏操作脚本。GIF 必须由人本地真实录制，自动化工具无法代劳：

- 本机（Hermes/agent 运行环境）没有任何录屏工具，agent 无法截取真实终端画面。
- 用代码「画」一个假 GIF 属于伪造演示效果：clack spinner 的转速、LLM 流式输出的节奏、交互确认的等待都无法真实复现，一旦被识破对项目是负资产。
- 录制涉及真实 API Key 出现在画面里，必须由人负责打码/吊销，不能自动化。

## 一、录前准备

1. 环境：Node.js ≥ 20；`npm install -g repo-ai-cli`（或用 `npx repo-ai-cli ...` 逐步运行，但全局安装后录制更顺）。
2. 一个演示用的干净 git 仓库（建议新建，例如 `C:\Users\18434\demo-gif` 或任意空目录）：
   ```
   mkdir demo-gif && cd demo-gif
   git init
   echo "# demo" > index.js
   echo "console.log('hello')" >> index.js
   git add . && git commit -m "init"
   ```
   文件越多，readme 生成耗时越长；3-10 个小文件即可，控制在 1 分钟内录完。
3. 一个可用的 DeepSeek API Key（注册：<https://platform.deepseek.com/>）。免 Key 方案见「五、备选方案」。
4. 录屏工具（任选其一）：
   - Windows：ScreenToGif（免费，推荐，自带剪辑与马赛克打码）：<https://www.screentogif.com/>
   - 跨平台：LICEcap（<https://www.cockos.com/licecap/>）
5. 终端设置：窗口调到约 900x600 像素、等宽字体 16-18px、深色背景、关闭终端的透明与动画特效，保证 GIF 体积可控、文字清晰。

## 二、主分镜脚本（必录，目标 8-12 秒 GIF）

画面从清屏后的干净终端开始，按顺序执行（每一步的预期等待时间已标注）：

| 步骤 | 画面内容 | 命令 | 预期等待 |
|---|---|---|---|
| 1 | 输入环境变量 | `export DEEPSEEK_API_KEY=sk-你的key` | 1 秒 |
| 2 | 进入演示仓库 | `cd demo-gif` | 1 秒 |
| 3 | 一条命令跑通 | `npx repo-ai-cli readme` | 首次 npx 下载包 5-15 秒；随后 clack spinner + LLM 生成 20-60 秒（视仓库大小与网络） |
| 4 | 成功落盘 | spinner 结束，输出 README.md 生成成功的提示（含文件路径/耗时） | 即时 |
| 5 | 验证结果 | `head -20 README.md` | 即时 |

录制要点：
- 步骤 3 的 spinner 阶段全程保留，不要剪掉——clack 交互动画正是这段 GIF 的卖点（PLAN M5 原文要求「clack 交互录屏」）。
- 生成时间波动大：先空跑一次 `npx repo-ai-cli readme` 看实际耗时，再决定录几次取最顺的一条。
- 步骤 1 中的 Key 会在画面里出现：录制时用真实 Key，录完在 ScreenToGif 编辑器里对 Key 打马赛克；或者改用「五、备选方案 B（Ollama）」完全避开 Key。

## 三、可选分镜（增强效果，各 5-10 秒）

- 分镜 B（交互确认流）：在演示仓库 `git add .` 制造一次 staged 变更后执行 `repo-ai-cli commit`，录制 clack 的确认/选择交互，展示交互式 UI。
- 分镜 C（零配置离线）：新克隆目录里直接 `npx repo-ai-cli doctor` 与 `npx repo-ai-cli secrets`，展示「不设 Key 也能立刻用」的离线命令，约 5 秒。

## 四、后期处理与存放

1. 用 ScreenToGif 打开录制文件，裁掉首尾多余静止帧；对所有出现 API Key 的帧加马赛克。
2. 导出参数：FPS 8-12、宽度 960-1280px、循环播放、有损压缩到 3MB 以内（GitHub README 加载体验考虑）。
3. 文件名与路径（仓库内相对路径，需随代码一起 commit）：
   - `docs/assets/demo-readme.gif`（主分镜）
   - 可选：`docs/assets/demo-commit.gif`、`docs/assets/demo-offline.gif`
   - `docs/assets/` 目录不存在时新建。

## 五、备选方案

- A（默认，需 Key）：按第二节脚本录，Key 打码。
- B（免 Key，完全本地）：先 `ollama pull llama3.2`，把第 1 步换成 `export OLLAMA_BASE_URL`（默认 http://localhost:11434，通常无需设置），第 3 步换成：
  ```
  npx repo-ai-cli readme --provider ollama --model llama3.2
  ```
  画面里没有任何 Key，无需打码；代价是本地模型生成质量与速度取决于机器。

## 六、在 README 中引用

GIF 就位后，编辑 README.md 的 `## 🎬 Demo — 演示` 小节，把当前那行「录屏 GIF 待补充 —— ……」替换为：

```markdown
![repo-ai-cli 演示](docs/assets/demo-readme.gif)
```

用相对路径（`docs/assets/...`），不要用本地绝对路径或外链；GIF 必须已 commit 进仓库，否则 GitHub 上显示裂图。若录了多个分镜，可并排放：

```markdown
| 生成 README | 规范 commit |
|---|---|
| ![readme](docs/assets/demo-readme.gif) | ![commit](docs/assets/demo-commit.gif) |
```

## 七、验收清单

- [ ] GIF 在 GitHub 仓库页面能正常播放（非裂图）
- [ ] 画面中无任何真实 API Key（逐帧检查马赛克）
- [ ] 体积 ≤ 3MB，10 秒内能看完一轮
- [ ] README Demo 小节已引用且相对路径正确
- [ ] 一旦发现真实 Key 曾出现在公开画面中，立即到平台吊销并换新 Key
