/**
 * gitignore 命令的内置模板。每个条目给 id / 显示名 / 内容。
 * 内容是常见语言/框架的惯用忽略规则。
 */

export interface GitignoreTemplate {
  id: string;
  name: string;
  content: string;
}

export const GITIGNORE_TEMPLATES: GitignoreTemplate[] = [
  {
    id: "node",
    name: "Node.js",
    content: `node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
.npmrc
.env
.env.*
!.env.example
.DS_Store
`,
  },
  {
    id: "python",
    name: "Python",
    content: `__pycache__/
*.py[cod]
*.so
.Python
build/
dist/
*.egg-info/
.venv/
venv/
env/
.pytest_cache/
.coverage
htmlcov/
.env
`,
  },
  {
    id: "go",
    name: "Go",
    content: `*.exe
*.exe~
*.dll
*.so
*.dylib
*.test
*.out
bin/
dist/
vendor/
`,
  },
  {
    id: "rust",
    name: "Rust",
    content: `/target
Cargo.lock
**/*.rs.bk
`,
  },
  {
    id: "java",
    name: "Java",
    content: `*.class
*.jar
*.war
*.nar
hs_err_pid*
target/
build/
.gradle/
.idea/
*.iml
`,
  },
  {
    id: "csharp",
    name: "C#",
    content: `bin/
obj/
*.user
*.suo
.vs/
[Tt]est[Rr]esult*/
packages/
`,
  },
  {
    id: "ruby",
    name: "Ruby",
    content: `*.gem
.bundle/
vendor/bundle/
log/
tmp/
coverage/
.ruby-version
`,
  },
  {
    id: "php",
    name: "PHP",
    content: `/vendor/
.env
composer.phar
*.log
`,
  },
  {
    id: "nextjs",
    name: "Next.js",
    content: `node_modules/
.next/
out/
build/
.next-env.d.ts
.env
.env.*
!.env.example
.DS_Store
`,
  },
  {
    id: "vue",
    name: "Vue",
    content: `node_modules/
dist/
dist-ssr/
*.local
.env
!.env.example
.DS_Store
`,
  },
  {
    id: "react",
    name: "React",
    content: `node_modules/
build/
dist/
.env
.env.*
!.env.example
.DS_Store
*.log
`,
  },
  {
    id: "docker",
    name: "Docker",
    content: `*.swp
*.log
.env
node_modules/
.DS_Store
`,
  },
  {
    id: "vscode",
    name: "Visual Studio Code",
    content: `.vscode/*
!.vscode/settings.json
!.vscode/extensions.json
!.vscode/tasks.json
!.vscode/launch.json
*.code-workspace
`,
  },
  {
    id: "macos",
    name: "macOS",
    content: `.DS_Store
.AppleDouble
.LSOverride
._*
.Spotlight-V100
.Trashes
`,
  },
  {
    id: "windows",
    name: "Windows",
    content: `Thumbs.db
Thumbs.db:encryptable
ehthumbs.db
Desktop.ini
$RECYCLE.BIN/
*.lnk
`,
  },
  {
    id: "linux",
    name: "Linux",
    content: `*~
.fuse_hidden*
.directory
.Trash-*
*.swp
`,
  },
];

export function findGitignoreTemplate(id: string): GitignoreTemplate | undefined {
  return GITIGNORE_TEMPLATES.find(
    (t) => t.id === id.toLowerCase(),
  );
}