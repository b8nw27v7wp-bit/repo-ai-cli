# AI Coding Tutor — AI 编程教学助手

**An intelligent tutoring web app that helps programming beginners learn Python through Socratic AI guidance, structured courses, and an online coding playground.**

**基于大语言模型的编程初学者智能辅导系统 —— 通过苏格拉底式 AI 引导、结构化课程与在线编程练习环境，帮助编程零基础初学者学会 Python。**

---

## ✨ Features — 功能特性

- 🤖 **AI Chat Tutoring** — Socratic questioning with 5-level progressive hint strategy; streaming SSE output with typewriter effect (~1.3s first token).
  **AI 对话辅导** — 苏格拉底式提问，5 级渐进提示策略；SSE 流式输出，打字机效果（~1.3 秒首字响应）。
- 📚 **Structured Course System** — 10-lesson Python basics course with real-life analogies, rendered from MDX files.
  **结构化课程系统** — 10 课时 Python 基础课程，配合生活比喻，基于 MDX 文件渲染。
- 💻 **Online Coding Playground** — Monaco Editor (VS Code engine) with Python sandbox execution, auto-save, and keyboard shortcuts.
  **在线练习环境** — Monaco Editor（VS Code 内核）+ Python 沙箱执行，支持自动保存与快捷键。
- 🧪 **Automated Code Evaluation** — Test-case comparison + AI Review feedback when tests fail, with progressive hints.
  **代码自动评测** — 测试用例对比 + AI Review 反馈（失败时触发），支持渐进式提示。
- 📊 **Learning Dashboard** — Visual progress tracking for lessons and exercises, with cross-tab localStorage sync.
  **学习数据看板** — 课时与练习进度可视化，支持跨标签页同步。
- 🌓 **Dark Mode** — Follows system preference or manual toggle via `next-themes`.
  **暗色模式** — 跟随系统或手动切换（基于 `next-themes`）。
- 🔑 **BYOK (Bring Your Own Key)** — Users can provide their own DeepSeek API Key; stored only in browser localStorage and sent via request header.
  **BYOK 自带 API Key 模式** — 用户可填写自己的 DeepSeek API Key；仅存于浏览器 localStorage，通过请求头发送。
- 🛡️ **Sandbox Security** — Blocks `os`/`subprocess`/`eval`/`exec`/`open` etc., with 10s timeout and input length limit.
  **沙箱安全** — 阻止 `os`/`subprocess`/`eval`/`exec`/`open` 等危险操作，含 10 秒超时与输入长度限制。

---

## 🚀 Quick Start — 快速开始

### Prerequisites — 环境要求

- Node.js ≥ 18
- Python ≥ 3.8 (for code sandbox execution)
- DeepSeek API Key (optional, [get one here](https://platform.deepseek.com/))

### Installation & Run — 安装运行

```bash
# 1. Clone the repository
git clone <repo-url>
cd ai-coding-tutor

# 2. Install dependencies
npm install

# 3. (Optional) Configure server-side fallback API Key
echo "DEEPSEEK_API_KEY=sk-..." > .env.local

# 4. Start the development server
npm run dev

# 5. Open your browser
# http://localhost:3000
```

### API Key Modes (BYOK) — API Key 模式

The project supports two API key sources, **prioritizing the client-provided key**:

1. **Client-side (recommended)**: Open the AI chat panel, click the 🔑 button in the top-right corner, and enter your own DeepSeek API Key. The key is stored **only** in browser localStorage and sent via the `x-api-key` request header. Costs are billed to your own account, and the key is never written to the server.
2. **Server-side (fallback)**: Configure `DEEPSEEK_API_KEY` in `.env.local`. Used **only** when the client does not provide a key — suitable for development/debugging or self-hosted demos.

> **Note for production**: When deploying for customer use, it's recommended **not** to configure a server-side key, so each customer uses their own key.

### Production Build — 生产构建

```bash
npm run build
npm start
```

### Testing — 测试

```bash
npm run test          # Run tests once
npm run test:watch    # Run tests in watch mode
```

---

## ⚙️ Configuration — 配置说明

### Environment Variables — 环境变量

| Variable | Required | Description |
|----------|----------|-------------|
| `DEEPSEEK_API_KEY` | No | Server-side fallback API key for DeepSeek. Only used when the client doesn't provide a key via `x-api-key` header. |

### API Key Resolution Priority — Key 解析优先级

1. **Client-provided key** via `x-api-key` request header (BYOK mode)
2. **Server-side key** from `.env.local` or environment variable (fallback)

The key is resolved via `resolveApiKey()` in `lib/api-key.ts` for all API routes.

---

## 🛠 Tech Stack — 技术栈

| Category | Technology |
|----------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 (strict mode) |
| Styling | Tailwind CSS 4 + shadcn/ui (Base UI) |
| Editor | Monaco Editor (@monaco-editor/react) |
| AI | DeepSeek Chat API (OpenAI-compatible) |
| Theme | next-themes (dark mode) |
| Sandbox | Python subprocess (cross-spawn) |
| Icons | Lucide React |
| Testing | Vitest (53 tests, 5 files) |
| Package Manager | npm |

---

## 📁 Directory Structure — 目录结构

```
ai-coding-tutor/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (Theme + Tooltip + Toast)
│   ├── page.tsx                  # Home page (4 tabs)
│   ├── api/
│   │   ├── ai/
│   │   │   ├── chat/route.ts     # Non-streaming AI chat
│   │   │   └── chat/stream/route.ts  # Streaming AI (SSE)
│   │   └── code/
│   │       ├── run/route.ts      # Python sandbox execution
│   │       └── evaluate/route.ts # Code evaluation + AI Review
│   └── courses/
│       ├── page.tsx              # Course list page
│       └── [courseId]/
│           ├── page.tsx          # Course syllabus (with progress)
│           └── [lessonId]/page.tsx  # Lesson content + exercises
├── components/
│   ├── ui/                       # shadcn/ui components (11 total)
│   ├── theme-provider.tsx        # Dark mode provider
│   ├── theme-toggle.tsx          # Theme toggle button
│   ├── toast-provider.tsx        # Toast notification system
│   └── tutor/
│       ├── chat-panel.tsx        # AI chat panel (streaming + persistence)
│       ├── code-playground.tsx   # Monaco Editor playground
│       ├── exercise-panel.tsx    # Exercise evaluation panel
│       ├── learning-dashboard.tsx # Learning data dashboard
│       ├── lesson-complete-indicator.tsx  # Completion indicator
│       └── lesson-progress-tracker.tsx    # Auto-mark lesson complete
├── lib/
│   ├── api-key.ts                # BYOK key management (header first, server fallback)
│   ├── courses.ts                # Course loading + MDX→HTML conversion
│   ├── exercises.ts              # Exercise loader
│   ├── progress.ts               # Learning progress management (localStorage)
│   ├── sandbox-safety.ts         # Python code safety filter
│   ├── llm/                      # LLM Provider abstraction layer
│   │   ├── provider.ts           # Interface definition
│   │   ├── index.ts              # Unified entry (default: DeepSeek)
│   │   ├── deepseek.ts           # DeepSeek direct API
│   │   └── opencode.ts           # OpenCode CLI fallback (agent mode)
│   ├── opencode/
│   │   └── agent.ts              # OpenCode CLI wrapper
│   └── prompts/
│       └── tutor.ts              # Teaching prompt templates
├── content/
│   └── python-basics/            # Python basics course
│       ├── manifest.json         # Course metadata
│       ├── 01-*.mdx ~ 10-*.mdx   # 10 MDX lessons
│       └── exercises/            # 20 exercises (JSON)
├── tests/
│   └── lib/                      # Unit tests (53 total)
│       ├── courses-db.test.ts    # Course loading tests
│       ├── courses.test.ts       # Markdown rendering tests
│       ├── exercises.test.ts     # Exercise loader tests
│       ├── prompts.test.ts       # Prompt template tests
│       └── sandbox-safety.test.ts # Safety filter tests
├── PROGRESS.md                   # Development progress log
├── ROADMAP.md                    # Development roadmap
└── .hermes.md                    # Project conventions
```

---

## 🔌 API Endpoints — API 端点

| Endpoint | Method | Description | Response Time |
|----------|--------|-------------|---------------|
| `/api/ai/chat` | POST | Non-streaming AI chat | ~1.3s |
| `/api/ai/chat/stream` | POST | Streaming AI chat (SSE) | ~1.3s first token |
| `/api/code/run` | POST | Python code execution | ~0.5s |
| `/api/code/evaluate` | POST | Code evaluation + AI Review | ~1.5s |

### Request Examples — 请求示例

```bash
# AI chat (client-provided key via x-api-key header)
curl -X POST http://localhost:3000/api/ai/chat/stream \
  -H "Content-Type: application/json" \
  -H "x-api-key: sk-your-deepseek-key" \
  -d '{"message": "What is a variable?"}'

# AI chat (falls back to server-side .env.local config)
curl -X POST http://localhost:3000/api/ai/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "What is a variable?"}'

# Code evaluation
curl -X POST http://localhost:3000/api/code/evaluate \
  -H "Content-Type: application/json" \
  -d '{"code": "print(\"Hello, World!\")", "exerciseId": "python-basics-01-01"}'
```

---

## 📚 Course Content — 课程内容

| # | Lesson | Duration | Exercises |
|---|--------|----------|-----------|
| 01 | Hello, Python! (认识 Python) | 15min | 2 |
| 02 | Variables & Assignment (变量与赋值) | 20min | 2 |
| 03 | Data Types (数据类型) | 25min | 2 |
| 04 | Input & Output (输入与输出) | 20min | 2 |
| 05 | Conditionals (条件判断) | 25min | 2 |
| 06 | Loops (循环结构) | 30min | 2 |
| 07 | Lists (列表) | 25min | 2 |
| 08 | Functions (函数) | 30min | 2 |
| 09 | Dictionaries (字典) | 25min | 2 |
| 10 | Final Project: Student Grade System (综合项目) | 45min | 2 |

**Total: 10 lessons, 20 programming exercises**

---

## 🛡 Security Measures — 安全措施

- ✅ API keys are **not** committed to the repository (`.env.local` is gitignored)
- ✅ BYOK mode: Client keys stored only in browser localStorage, transmitted via `x-api-key` header, never persisted on the server
- ✅ Client keys take priority over server config; error responses are masked by DeepSeek, not exposing full keys
- ✅ Code sandbox blocks `import os` / `import subprocess` / `eval` / `exec` / `open` etc.
- ✅ 10-second timeout prevents infinite loops
- ✅ Input length limit (50KB)
- ✅ `cross-spawn` used instead of `child_process.exec` for cross-platform compatibility

---

## 🤝 Contributing — 贡献指南

We welcome contributions! Here's how you can help:

### Development Conventions — 开发约定

- **User-facing text**: All user-visible text should be in **Chinese** (中文)
- **Code comments**: Chinese (public APIs may use English)
- **Commit format**: `feat:` / `fix:` / `docs:` / `refactor:`
- **Code style**:
  - TypeScript strict mode
  - PascalCase for component files: `CodeEditor.tsx`
  - camelCase for utility functions: `formatHint.ts`
  - kebab-case for directories: `ai-tutor/`, `code-sandbox/`

### Getting Started — 开始贡献

1. Fork the repository
2. Create your feature branch: `git checkout -b feat/my-feature`
3. Commit your changes: `git commit -m "feat: add new feature"`
4. Push to the branch: `git push origin feat/my-feature`
5. Open a Pull Request

### Run Tests — 运行测试

```bash
npm run test
```

All 53 tests should pass before submitting a PR.

---

## 📝 License — 许可证

This project is a **Bachelor's degree thesis project** (本科毕业设计项目). 

TODO: License information to be added.

---

*For more details, see [PROGRESS.md](./PROGRESS.md) for development progress and [ROADMAP.md](./ROADMAP.md) for the roadmap.*