import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { SECRET_PATTERNS } from "./secret-patterns.js";
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
  "yaml", "yml", "toml", "ini", "cfg", "conf", "xml", "gradle",
  "properties", "lock",
  // 注意：刻意不含 "env" —— xxx.env 通常是环境变量文件（含明文密钥），
  // 见 SENSITIVE_NAMES 的同类保护。
]);

/**
 * 敏感文件名：无论扩展名是否在白名单内，一律不收进 LLM 材料。
 * `.env` 这类无扩展名文件本来就会被白名单挡住，这里显式列出是防御性的——
 * 不让"白名单恰好挡住"当成安全边界。
 */
const SENSITIVE_NAMES = new Set([
  ".env", ".npmrc", ".pypirc", ".netrc", ".pgpass", ".htpasswd",
  "id_rsa", "id_ed25519", "id_dsa", "id_ecdsa",
  "credentials", "credentials.json", "service-account.json",
]);

/** 敏感文件名模式（匹配 basename）。
 * 刻意不收 secret/token/password 这类泛词——`scan-secrets.ts`、`useTokens.ts`
 * 这类正常源码会被误杀（本仓库自己就中招），泛词交给内容检测判。 */
const SENSITIVE_NAME_PATTERNS: RegExp[] = [
  // .env / .env.local / .env.production 拦；.env.example 这类公开模板不算敏感，
  // 但也别指望它被 SOURCE_EXTS 认下——见 TEMPLATE_NAMES 的显式放行
  /^\.env(\.(?!example$|sample$|template$).+)?$/i,
  /\.(env|pem|key|p12|pfx|jks|keystore|ppk|kdbx|asc|gpg)$/i, // xxx.env 与各类密钥/证书容器
  /^id_[a-z0-9]+$/i, // id_rsa / id_ed25519 等 SSH 私钥
];

function isSensitiveName(relPath: string): boolean {
  const base = path.basename(relPath);
  return SENSITIVE_NAMES.has(base) || SENSITIVE_NAME_PATTERNS.some((re) => re.test(base));
}


/** 反映项目定位的文件：优先级 1 */
const PRIORITY1_FILES = new Set([
  "readme.md", "readme.markdown", "readme.txt", "readme",
  "license", "license.md", "license.txt", "license.mit", "license.apache-2.0",
  "package.json", "pyproject.toml", "go.mod", "cargo.toml", "composer.json",
  "gemfile", "setup.py", "pom.xml", "build.gradle", "build.gradle.kts",
  "dockerfile", "makefile",
]);

/** 公开模板文件：`.env.example` / `.env.sample` / `.env.template` 等。
 * gitignore 惯例就是 `!.env.example` 反排除，它本来就没有真实密钥。
 * 但注意 SOURCE_EXTS 不认 `example/sample/template` 这些后缀，若不显式放行，
 * 它们会被 isSourceName 静默丢弃（既不在收集结果里、也不进敏感上报）——
 * 那种静默丢失比收进来更糟，所以这里显式声明。 */
const TEMPLATE_NAMES = new Set([
  ".env.example", ".env.sample", ".env.template",
  "env.example", "env.sample", "env.template",
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
  const base = path.basename(relPath);
  const lower = base.toLowerCase();
  // 公开模板（.env.example 等）显式放行，否则被静默丢弃
  if (TEMPLATE_NAMES.has(lower)) return true;
  // README/LICENSE 无扩展名也要收
  if (/^readme(\..*)?$/.test(lower)) return true;
  if (/^license(\..*)?$/.test(lower)) return true;
  const ext = path.extname(base).slice(1).toLowerCase();
  return SOURCE_EXTS.has(ext);
}

/** 内容含 NUL 字节视为二进制 */
function looksBinary(content: string): boolean {
  return content.includes("\0");
}

/**
 * 无引号赋值的密钥模式（补充 SECRET_PATTERNS）：YAML/INI/properties/env-file
 * 里 `password: xxxx12345678` 这种写法不带引号，generic-assignment 抓不到。
 * 只收长度 ≥10、字符集像随机串的值；占位符/模板变量/代码引用/描述性短语一律放行，避免误伤配置文件。
 */
const NOQUOTE_SECRET =
  /\b(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|private[_-]?key)\b["']?\s*[=:]\s*["']?([A-Za-z0-9+/_\-.=]{10,})["']?/gi;

/**
 * 带引号赋值（对应 SECRET_PATTERNS 的 generic-assignment），但带捕获组以便判值：
 * `token: "xxxx12345678"` 该拦，Vue 模板 `:token="committedToken"` 不该拦。
 * 键名后的 `["']?` 是为了 JSON：`{"apiKey": "..."}` 里键自带引号，少了它就整条漏掉。
 */
const QUOTED_SECRET =
  /\b(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|private[_-]?key)\b["']?\s*[=:]\s*["']([^"'\n]{8,})["']/gi;

/** 上面匹配到的"值"若属于这些形态，就是占位符/代码引用而非明文密钥 */
const PLACEHOLDER_VALUE =
  /^(\$\{|\$|process\.|env|environment|import|require|getenv|\{\{|%|your|my|the|some|all|use|set|from|read|enter|provide|replace|insert|please|must|should|changeme|example|dummy|test|fake|sample|xxxx|\*+|<|=)/i;

/** 连字符词组（纯小写/数字、至少一段连字符）是人写的说明或测试桩，不是随机密钥：`use-environment-variable`、`not-the-token`、`new-password` */
const LOOKS_LIKE_PHRASE = /^[a-z0-9]+(-[a-z0-9]+)+$/;

/** 下划线开头是标识符惯例（`_sesToken`、`__token`），不是密钥 */
const LEADING_UNDERSCORE = /^_/;

/** camelCase 标识符（小写开头、中途出现大写）：`committedToken`、`explicitApiKey` */
const CAMEL_IDENTIFIER = /^[a-z][a-z0-9]*[A-Z]/;

/**
 * 这个匹配到的值是否该放行。前三条挡占位符与语义词组，后三条挡代码引用——
 * 跨 4 个真实仓库标定时误伤的全是代码与测试桩：`apiKey=options.apiKey`、
 * `token=UUID.randomUUID()`、Vue 模板 `:token="committedToken"`、
 * Python 测试桩 `Token = "not-the-token"`、表单占位 `password = "new-password"`。
 * 判据按形态而非长度，因为长度挡不住 13 位的 `hunter2secret`。
 * 代价不对称：多放行一个文件只是 AI 少看一个文件，错杀核心源码直接伤生成质量。
 *
 * 已知局限：纯小写+连字符的真密钥（`abc-def-ghi-jklmno`）会被当词组放行，
 * JWT 这类点分段高熵串会被当属性访问放行——两者都要更重的启发式，暂不处理。
 */
function isPlausibleSecret(value: string): boolean {
  if (PLACEHOLDER_VALUE.test(value)) return false;
  if (LOOKS_LIKE_PHRASE.test(value)) return false;
  if (LEADING_UNDERSCORE.test(value)) return false;
  if (/[.(]/.test(value)) return false; // req.headers.get / UUID.randomUUID()
  if (CAMEL_IDENTIFIER.test(value)) return false; // committedToken / explicitApiKey
  return true;
}

/**
 * 内容级密钥检测：复用 secrets 命令的模式表（GitHub/AWS/私钥/OpenAI/Bearer/通用赋值），
 * 再补一条无引号赋值模式。
 *
 * 目的不是精确告警，而是别把明文密钥发给第三方 LLM——宁可多拦一个文件，
 * 让 AI 少看一个文件的代价远低于密钥外泄。
 *
 * 正则对象带 g 标志且被全仓库共享，每次必须重置 lastIndex，否则跨文件会漏匹配。
 */
function hasSecretContent(content: string): string | undefined {
  for (const p of SECRET_PATTERNS) {
    // generic-assignment 改走 QUOTED_SECRET：值要过 isPlausibleSecret 判，
    // 否则 Vue/JSX 的 `:token="committedToken"` 这种模板绑定会被误杀
    if (p.id === "generic-assignment") continue;
    p.regex.lastIndex = 0;
    if (p.regex.exec(content)) return p.id;
  }
  // 赋值类（带引号 / 无引号）：命中键名后还要判值，挡住代码引用与占位符
  for (const re of [QUOTED_SECRET, NOQUOTE_SECRET]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const value = m[2];
      if (value && isPlausibleSecret(value)) {
        return `assignment-${(m[1] ?? "key").toLowerCase()}`;
      }
    }
  }
  return undefined;
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
 * 过滤顺序：硬性跳过目录/文件 → 敏感文件名 → 二进制/非白名单 → .gitignore
 * → 大小上限 → 内容级密钥检测。
 *
 * 含明文密钥的文件一律不进 LLM 材料（BYOK 也挡不住"代码发到用户自己选的
 * 第三方 API"这件事，密钥本身不该跟着去）；被排除的文件经 onSensitiveSkipped
 * 上报，由调用方 warn，避免静默丢文件。
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
    if (isSensitiveName(rel)) {
      options.onSensitiveSkipped?.(rel);
      continue;
    }
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
    // 内容级：拦下含明文密钥的文件，避免把它发给第三方 LLM
    if (hasSecretContent(content)) {
      options.onSensitiveSkipped?.(rel);
      continue;
    }
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
