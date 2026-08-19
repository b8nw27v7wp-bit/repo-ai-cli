/**
 * CONTRIBUTING.md 模板生成（离线）。
 * 结构参考开源社区通行格式：环境准备 → 开发流程 → 提交规范 → PR 规范。
 */

export interface ContributingVars {
  /** 项目名（默认取目录名） */
  project: string;
  /** owner/repo（检测到 git remote 时填入，否则用占位符） */
  repoSlug: string;
  /** 包管理器命令（检测到 lockfile 决定） */
  install: string;
  testCmd: string;
}

export function renderContributingZh(v: ContributingVars): string {
  return `# 贡献指南

感谢你对 **${v.project}** 的关注！欢迎通过以下方式参与贡献。

## 环境准备

- Node.js ≥ 20
- 克隆仓库并安装依赖：

\`\`\`bash
git clone https://github.com/${v.repoSlug}.git
cd ${v.project}
${v.install}
\`\`\`

## 开发流程

1. Fork 本仓库并创建特性分支：\`git checkout -b feat/你的功能\`
2. 编写代码与对应的测试
3. 本地验证通过后再提交：

\`\`\`bash
${v.testCmd}
\`\`\`

## 提交规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)：

- \`feat: xxx\` 新功能
- \`fix: xxx\` 修复 bug
- \`docs: xxx\` 文档
- \`refactor: xxx\` 重构（不改变行为）
- \`test: xxx\` 测试
- \`chore: xxx\` 构建/工具链

提交信息请用清晰的短句描述「做了什么、为什么」，不要写 "update" 这类空话。

## Pull Request 规范

1. 一个 PR 只做一件事
2. 描述里写清动机与实现要点，附测试说明
3. 保持 CI 全绿；评审意见请及时回复

## Issue 规范

提 bug 时请附：复现步骤、期望行为、实际行为、Node 版本与操作系统。

---

再次感谢你的贡献！
`;
}

export function renderContributingEn(v: ContributingVars): string {
  return `# Contributing

Thanks for your interest in **${v.project}**! Contributions are welcome.

## Setup

- Node.js ≥ 20
- Clone and install:

\`\`\`bash
git clone https://github.com/${v.repoSlug}.git
cd ${v.project}
${v.install}
\`\`\`

## Workflow

1. Fork this repo and create a feature branch: \`git checkout -b feat/your-feature\`
2. Write code together with tests
3. Verify locally before committing:

\`\`\`bash
${v.testCmd}
\`\`\`

## Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- \`feat: ...\` new feature
- \`fix: ...\` bug fix
- \`docs: ...\` documentation
- \`refactor: ...\` behavior-preserving refactor
- \`test: ...\` tests
- \`chore: ...\` build / tooling

Write clear subject lines describing what and why — no empty "update" messages.

## Pull Requests

1. One concern per PR
2. Describe motivation, key changes and how it was tested
3. Keep CI green; respond to review comments promptly

## Issues

For bugs, include: steps to reproduce, expected vs. actual behavior, Node version and OS.

---

Thanks again for contributing!
`;
}
