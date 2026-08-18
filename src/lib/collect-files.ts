import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { CollectedFile, CollectOptions, Priority } from "../types.js";

/** 跑一个子进程：写入 input 后关闭 stdin，收集 stdout。input 为空时不写。 */
function runProcess(
  cmd: string,
  args: string[],
  cwd: string,
  input?: string,
): Promise<{ stdout: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true });
    const out: Buffer[] = [];
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", () => {
      /* 忽略 stderr */
    });
    child.on("error", reject);
    child.on("close", (code) =>
      resolve({ stdout: Buffer.concat(out).toString("utf8"), code }),
    );
    if (input !== undefined) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

/** 硬性跳过的目录名（任意层级） */
export const HARD_SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  ".cache",
  "__pycache__",
  ".venv",
  "venv",
  "target",
  ".idea",
  ".vscode",
  "vendor",
]);

/** 锁文件 / 生成文件：跳过 */
const HARD_SKIP_FILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "composer.lock",
  "Gemfile.lock",
  "poetry.lock",
  "Cargo.lock",
  "go.sum",
  "npm-shrinkwrap.json",
]);

/** 二进制 / 不可读扩展名 */
export const BINARY_EXTS = new Set([
  // images
  "png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "tiff", "avif", "heic",
  // media
  "mp4", "mkv", "mov", "avi", "webm", "mp3", "wav", "flac", "ogg", "aac", "m4a",
  // fonts
  "woff", "woff2", "ttf", "otf", "eot",
  // archives / binaries
  "zip", "tar", "gz", "bz2", "xz", "7z", "rar", "exe", "dll", "so", "dylib", "bin",
  "wasm", "class", "jar", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "pyc", "pyo", "o", "a", "obj", "db", "sqlite", "sqlite3", "whl", "deb", "rpm",
  "lockb",
]);

/** 源码扩展名白名单 */
const SOURCE_EXTS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts",
  "py", "go", "rs", "java", "kt", "kts", "c", "h", "cpp", "hpp", "cc",
  "cs", "rb", "php", "swift", "vue", "svelte", "sh", "bash", "zsh",
  "sql", "html", "css", "scss", "sass", "less", "md", "mdx", "json",
  "yaml", "yml", "toml", "ini", "cfg", "conf", "env", "xml", "gradle",
  "properties", "lock",
]);

/** 反映项目定位的文件：优先级 1 */
const PRIORITY1_FILES = new Set([
  "readme.md", "readme.markdown", "readme.txt", "readme",
  "license", "license.md", "license.txt", "license.mit", "license.apache-2.0",
  "package.json", "pyproject.toml", "go.mod", "cargo.toml", "composer.json",
  "gemfile", "setup.py", "pom.xml", "build.gradle", "build.gradle.kts",
  "dockerfile", "makefile",
]);

/** 入口文件模式：优先级 2 */
const ENTRY_PATTERNS: RegExp[] = [
  /^src\/index\./, /^src\/main\./, /^index\./, /^main\./,
  /^app\./, /^server\./, /^cli\./, /^manage\.py$/, /^app\/main\./,
  /^lib\/index\./, /^lib\/main\./,
];

function detectPriority(relPath: string): Priority {
  const lower = relPath.toLowerCase();
  if (PRIORITY1_FILES.has(lower)) return 1;
  if (ENTRY_PATTERNS.some((re) => re.test(lower))) return 2;
  return 3;
}

function isBinaryName(relPath: string): boolean {
  const ext = path.extname(relPath).slice(1).toLowerCase();
  return BINARY_EXTS.has(ext);
}

function isSourceName(relPath: string): boolean {
  const lower = relPath.toLowerCase();
  // README/LICENSE 无扩展名也要收
  if (/^readme(\..*)?$/.test(lower)) return true;
  if (/^license(\..*)?$/.test(lower)) return true;
  const ext = path.extname(relPath).slice(1).toLowerCase();
  return SOURCE_EXTS.has(ext);
}

/** 内容含 NUL 字节视为二进制 */
function looksBinary(content: string): boolean {
  return content.includes("\0");
}

async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const { code } = await runProcess("git", ["rev-parse", "--is-inside-work-tree"], dir);
    return code === 0;
  } catch {
    return false;
  }
}

/** 用 git check-ignore 批量过滤 .gitignore 中的文件；非 git 仓库返回空集 */
async function getGitIgnored(
  dir: string,
  relPaths: string[],
): Promise<Set<string>> {
  if (relPaths.length === 0) return new Set();
  if (!(await isGitRepo(dir))) return new Set();
  try {
    const { stdout } = await runProcess(
      "git",
      ["check-ignore", "--stdin", "--no-index"],
      dir,
      relPaths.join("\n") + "\n",
    );
    const ignored = new Set(
      stdout.split("\n").filter(Boolean).map((p) => p.replaceAll("\\", "/")),
    );
    return ignored;
  } catch {
    return new Set();
  }
}

async function walk(dir: string, base: string): Promise<string[]> {
  const out: string[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      if (HARD_SKIP_DIRS.has(entry.name)) continue;
      out.push(...(await walk(full, base)));
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

/**
 * 收集目录中值得送给 AI 的文件。
 * 过滤顺序：硬性跳过目录/文件 → 二进制/非白名单 → 大小上限 → .gitignore。
 */
export async function collectFiles(
  rootDir: string,
  options: CollectOptions = {},
): Promise<CollectedFile[]> {
  const maxBytes = options.maxFileBytes ?? 100 * 1024;
  const respectGitignore = options.respectGitignore ?? true;

  const relPaths = await walk(rootDir, rootDir);
  // 先做便宜过滤，再做 git check-ignore（贵）
  const candidates: string[] = [];
  for (const rel of relPaths) {
    const base = path.basename(rel);
    if (HARD_SKIP_FILES.has(base)) continue;
    if (isBinaryName(rel)) continue;
    if (!isSourceName(rel)) continue;
    candidates.push(rel);
  }

  let ignored = new Set<string>();
  if (respectGitignore) {
    ignored = await getGitIgnored(rootDir, candidates);
  }

  const files: CollectedFile[] = [];
  for (const rel of candidates) {
    if (ignored.has(rel)) continue;
    let stat;
    try {
      stat = await fs.stat(path.join(rootDir, rel));
    } catch {
      continue;
    }
    if (stat.size > maxBytes) continue;
    let content: string;
    try {
      content = await fs.readFile(path.join(rootDir, rel), "utf8");
    } catch {
      continue; // 无法按 UTF-8 读取 → 跳过
    }
    if (looksBinary(content)) continue;
    files.push({
      relPath: rel,
      content,
      sizeBytes: stat.size,
      priority: detectPriority(rel),
    });
  }

  // 按优先级排序（1 → 2 → 3），同级按路径
  files.sort((a, b) => a.priority - b.priority || a.relPath.localeCompare(b.relPath));
  return files;
}
