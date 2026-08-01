# AI Coding Tutor

**AI 编程教学助手 — 基于大语言模型的编程初学者智能辅导系统**

[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![DeepSeek](https://img.shields.io/badge/LLM-DeepSeek--Chat-purple)](https://deepseek.com/)
[![Build](https://img.shields.io/badge/build-passing-brightgreen)]()

---

## 📖 Introduction / 项目简介

**AI Coding Tutor** is an intelligent tutoring web application designed for absolute beginners learning programming. Built on Next.js and powered by the DeepSeek large language model, the system employs a **Socratic teaching method** to guide students toward discovering solutions themselves — rather than simply handing them answers.

**AI 编程教学助手** 是一个面向编程零基础初学者的智能辅导 Web 应用。系统基于 Next.js 构建，集成 DeepSeek 大语言模型，通过苏格拉底式引导教学法，帮助学生**自己学会编程**，而非直接获取答案。

### 🎯 Core Features / 核心特色

- 🤖 **AI Conversational Tutoring** — Socratic questioning with a 5-level progressive hint strategy
- 📚 **Structured Curriculum** — 10 lessons covering Python basics with real-life analogies
- 💻 **Online Practice Environment** — Monaco Editor (VS Code kernel) + Python sandbox
- 🧪 **Automated Code Evaluation** — Test case verification + AI Review feedback
- 📊 **Learning Dashboard** — Progress visualization and statistics tracking
- 🌓 **Dark Mode** — Follows system preference / manual toggle
- ⚡ **Streaming Output** — Typewriter effect for AI responses, ~1.3s first-token latency

- 🤖 **AI 对话辅导** — 苏格拉底式提问，5 级渐进提示策略
- 📚 **结构化课程** — 10 课时 Python 基础，配合生活比喻
- 💻 **在线练习环境** — Monaco Editor (VS Code 内核) + Python 沙箱
- 🧪 **代码自动评测** — 测试用例验证 + AI Review 反馈
- 📊 **学习数据看板** — 进度可视化，统计追踪
- 🌓 **暗色模式** — 跟随系统 / 手动切换
- ⚡ **流式输出** — AI 回答打字机效果，1.3s 首字响应

---

## 🏗 System Architecture / 系统架构

```
┌────────────────────────────────────────────────────────┐
│              浏览器 (Next.js App Router)                 │
│  ┌──────────┬──────────────┬──────────────┬──────────┐ │
│  │ 课程学习  │  在线练习     │  AI 辅导     │ 学习数据  │ │
│  │ (MDX)    │ (Monaco)     │ (流式对话)   │ (看板)    │ │
│  └──────────┴──────────────┴──────────────┴──────────┘ │
├────────────────────────────────────────────────────────┤
│                  API 层 (Route Handlers)                │
│  /api/ai/chat  /api/ai/chat/stream                     │
│  /api/code/run  /api/code/evaluate                     │
├────────────────────────────────────────────────────────┤
│                   核心逻辑层                              │
│  LLM Provider (DeepSeek)  │  课程引擎  │  评测引擎      │
│  教学 Prompt 模板          │  MDX 解析  │  沙箱执行      │
├────────────────────────────────────────────────────────┤
│                  数据 / 存储层                            │
│  localStorage (进度/对话)  │  MDX 文件系统  │  JSON 题库 │
└────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start / 快速开始

### Prerequisites / 环境要求

- **Node.js** ≥ 18
- **Python** ≥ 3.8 (for sandbox execution)
- **DeepSeek API Key** (optional, [get one here](https://platform.deepseek.com/))

### Installation & Development / 安装运行

```bash
# 1. Clone the repository
git clone <repo-url>
cd ai-coding-tutor

# 2. Install dependencies
npm install

# 3. (Optional) Configure a server-side fallback API key
echo "DEEPSEEK_API_KEY=sk-..." > .env.local

# 4. Start the development server
npm run dev

# 5. Open your browser
# http://localhost:3000
```

### API Key Modes (BYOK) / API Key 模式

The project supports **two API key sources** — the client-provided key always takes priority:

1. **Client-side key (recommended)** — Open the AI chat panel, click the 🔑 button in the top-right corner, and paste your own DeepSeek API key. The key is stored **only in browser localStorage** and transmitted via the `x-api-key` request header. Your key is never written to the server, and usage is billed to your own account.
2. **Server-side fallback** — Configure `DEEPSEEK_API_KEY` in `.env.local`. This is only used when no client key is provided, suitable for development and self-hosted demos.

> When deploying for production use, it's recommended **not** to configure a server-side key — let each user use their own key.

### Production Build / 生产构建

```bash
npm run build
npm start
```

---

## 📁 Project Structure / 项目结构

```
ai-coding-tutor/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (Theme + Tooltip)
│   ├── page.tsx                  # Homepage (4 tabs)
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
│   ├── ui/                       # shadcn/ui component library
│   ├── theme-provider.tsx        # Dark mode provider
│   ├── theme-toggle.tsx          # Theme toggle button
│   └── tutor/
│       ├── chat-panel.tsx        # AI chat panel (streaming + persistence)
│       ├── code-playground.tsx   # Monaco Editor practice environment
│       ├── exercise-panel.tsx    # Exercise evaluation panel
│       ├── learning-dashboard.tsx # Learning data dashboard
│       └── lesson-*.tsx          # Progress tracking components
├── lib/
│   ├── api-key.ts                # BYOK key management (header priority, server fallback)
│   ├── courses.ts                # Course loading + MDX→HTML
│   ├── exercises.ts              # Exercise loader
│   ├── progress.ts               # Learning progress management
│   ├── llm/                      # LLM provider abstraction layer
│   │   ├── provider.ts           # Interface definition
│   │   ├── deepseek.ts           # DeepSeek direct connection
│   │   └── opencode.ts           # OpenCode CLI fallback
│   └── prompts/
│       └── tutor.ts              # Teaching prompt templates
├── content/
│   └── python-basics/            # Python basics course
│       ├── manifest.json         # Course metadata
│       ├── 01-*.mdx ~ 10-*.mdx   # 10 MDX lessons
│       └── exercises/            # 20 exercise JSON files
├── tests/                        # Vitest test files
├── PROGRESS.md                   # Development progress log
├── ROADMAP.md                    # Future roadmap
└── README.md
```

---

## 🔌 API Endpoints / API 端点

| Endpoint / 端点 | Method / 方法 | Description / 说明 | Response Time / 响应时间 |
|---|---|---|---|
| `/api/ai/chat` | POST | Non-streaming AI chat | ~1.3s |
| `/api/ai/chat/stream` | POST | Streaming AI chat (SSE) | ~1.3s first token |
| `/api/code/run` | POST | Python code execution | ~0.5s |
| `/api/code/evaluate` | POST | Code evaluation + AI Review | ~1.5s |

### Request Examples / 请求示例

```bash
# AI chat (client-provided key via x-api-key header)
curl -X POST http://localhost:3000/api/ai/chat/stream \
  -H "Content-Type: application/json" \
  -H "x-api-key: sk-your-deepseek-key" \
  -d '{"message": "什么是变量？"}'

# AI chat (falls back to server .env.local config when no x-api-key)
curl -X POST http://localhost:3000/api/ai/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "什么是变量？"}'

# Code evaluation
curl -X POST http://localhost:3000/api/code/evaluate \
  -H "Content-Type: application/json" \
  -d '{"code": "print(\"Hello, World!\")", "exerciseId": "python-basics-01-01"}'
```

---

## 📊 Course Content / 课程内容

| # | Lesson / 课时 | Duration / 时长 | Exercises / 练习题 |
|---|---|---|---|
| 01 | 认识 Python | 15min | 2 |
| 02 | 变量与赋值 | 20min | 2 |
| 03 | 数据类型 | 25min | 2 |
| 04 | 输入与输出 | 20min | 2 |
| 05 | 条件判断 | 25min | 2 |
| 06 | 循环结构 | 30min | 2 |
| 07 | 列表 | 25min | 2 |
| 08 | 函数 | 30min | 2 |
| 09 | 字典 | 25min | 2 |
| 10 | 综合项目 | 45min | 2 |

**Total: 10 lessons, 20 programming exercises**

---

## 🛠 Tech Stack / 技术栈

| Category / 类别 | Technology / 技术 |
|---|---|
| Framework / 框架 | Next.js 16 (App Router) |
| Language / 语言 | TypeScript 5 |
| Styling / 样式 | Tailwind CSS 4 + shadcn/ui |
| Editor / 编辑器 | Monaco Editor (@monaco-editor/react) |
| AI / 人工智能 | DeepSeek Chat API (OpenAI-compatible) |
| Theme / 主题 | next-themes (dark mode) |
| Sandbox / 沙箱 | Python subprocess (cross-spawn) |
| Icons / 图标 | Lucide React |
| Package Manager / 包管理 | npm |

---

## 🌍 Deployment / 部署

### Vercel (Recommended)

1. Push the project to GitHub
2. Import the repository in [Vercel](https://vercel.com)
3. Deploy — no server-side `DEEPSEEK_API_KEY` needed (client-provided keys only)
4. For server fallback, configure the `DEEPSEEK_API_KEY` environment variable

> ⚠️ **Note:** The Vercel environment may not have a Python runtime. Code execution features require additional Python environment support.

### Docker

```bash
docker build -t ai-coding-tutor .
docker run -p 3000:3000 ai-coding-tutor
# For server fallback: -e DEEPSEEK_API_KEY=sk-xxx
```

---

## 🔒 Security Measures / 安全措施

- ✅ API keys are not committed to the repository (`.env.local` is gitignored)
- ✅ BYOK mode: client keys are stored only in browser localStorage, transmitted via `x-api-key` header, never persisted on the server
- ✅ Client keys take priority over server configuration; error responses are redacted by DeepSeek to prevent key leakage
- ✅ Code sandbox blocks `import os` / `subprocess` / `eval` / `exec`
- ✅ 10-second timeout to prevent infinite loops
- ✅ Input length limit (50KB)
- ✅ `cross-spawn` used instead of `child_process.exec`

---

## 🧪 Testing / 测试

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

Tests are located in `tests/lib/` and cover courses, exercises, prompts, and sandbox safety.

---

## 🤝 Contributing / 贡献指南

Contributions are welcome! Please follow these conventions:

1. **Commit messages**: Use the format `feat:` / `fix:` / `docs:` / `refactor:`
2. **Code style**: TypeScript strict mode; components use PascalCase, utilities use camelCase, directories use kebab-case
3. **Language**: All user-facing text should be in **Chinese**; code comments in Chinese (English allowed for public APIs)
4. **Package management**: Use `npm` for all package operations

请遵循以上规范提交 PR，共同完善这个教学助手项目。

---

## 📝 License / 许可证

This is a **undergraduate thesis project** (本科毕业设计) for educational purposes.

---

## 📌 TODO / 待办事项

- [ ] Phase 4: Production deployment + thesis writing + defense preparation
- [ ] Additional course content (beyond Python basics)
- [ ] More exercise types and difficulty levels
- [ ] User authentication and multi-user support
- [ ] Server-side progress persistence (beyond localStorage)

---

**AI Coding Tutor** — Helping beginners learn to code, one Socratic question at a time. 🎓