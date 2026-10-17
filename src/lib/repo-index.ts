import { promises as fs } from "node:fs";
import path from "node:path";
import { collectFiles, isEntryPoint } from "./collect-files.js";
import { languageForPath } from "./stats.js";
import type { CollectedFile } from "../types.js";

/**
 * 仓库级轻量索引：文件清单 + 模块分组 + 文件级 import 图。
 *
 * 设计取舍：
 * - 文件遍历与过滤**直接复用 `collectFiles()`**——它是本仓库唯一带「敏感文件 +
 *   明文密钥」过滤的收集入口，再写一个 walker 既重复又可能把密钥带进结果。
 *   代价是只索引「可分析文件」（源码/配置/文档），图片等二进制本来也不需要。
 * - import 解析用正则而非 AST：零新增运行时依赖。代价分两类：
 *   漏报（路径别名、动态拼接的路径识别不了，计入 `unresolved`）与
 *   误报（注释/字符串里出现的 import 文本也会被当成边）。调用方应把
 *   `unresolved` 暴露给用户；误报只影响影响面「多报」，不会漏掉受害者。
 * - 索引只服务 map / impact / health / onboard 四条命令；不改变既有命令行为。
 */

export interface RepoIndexFile {
  /** 相对仓库根、POSIX 风格 */
  relPath: string;
  sizeBytes: number;
  lines: number;
  language: string;
  /** 测试文件（供 impact 圈定「该跑哪些测试」） */
  isTest: boolean;
  /** 解析到仓库内文件的 import（相对路径，去重） */
  imports: string[];
  /** 原始 import 说明符（含包名，便于调试） */
  rawImports: string[];
  /** TODO / FIXME 出现次数（health 的信息项） */
  todos: number;
}

export interface RepoIndexGroup {
  /** 顶层目录名；根目录文件归为 "(root)" */
  name: string;
  files: number;
  lines: number;
}

export interface RepoLanguageCount {
  language: string;
  files: number;
  lines: number;
}

export interface RepoIndex {
  rootDir: string;
  repoName: string;
  files: RepoIndexFile[];
  groups: RepoIndexGroup[];
  entryPoints: string[];
  languages: RepoLanguageCount[];
  /** 被依赖关系：relPath → 直接 import 它的文件（去重、排序） */
  dependents: Map<string, string[]>;
  /** 本地 import 无法解析到仓库文件的次数 */
  unresolved: number;
  /** 因敏感文件名或明文密钥被排除的文件 */
  sensitiveSkipped: string[];
  /** 因超过单文件上限被跳过的文件 */
  sizeSkipped: Array<{ relPath: string; sizeBytes: number }>;
  totals: { files: number; lines: number };
}

export interface RepoIndexOptions {
  /** 单文件读取上限（字节），默认 200KB（与 secrets 的默认一致） */
  maxFileBytes?: number;
  /** 是否尊重 .gitignore（默认 true，交给 collectFiles） */
  respectGitignore?: boolean;
  /**
   * 是否做内容级密钥扫描（默认 false）。
   *
   * 索引只保存路径/行数/import 边等元数据，**从不把内容发给 LLM**；在这里做内容
   * 过滤只会把「含测试用密钥 fixture 的测试文件」排除掉，让 impact 漏报受影响测试
   * （本仓库的 scan-secrets.test.ts 就是现成例子）。文件名级敏感过滤仍然生效。
   */
  scanSecretContent?: boolean;
}

/** 可参与 import 解析的扩展名（index 候选与精确匹配共用） */
const JS_RESOLVE_EXTS = [
  ".ts", ".tsx", ".mts", ".cts",
  ".js", ".jsx", ".mjs", ".cjs",
  ".vue", ".svelte",
];
const RESOLVABLE_EXTS = new Set([...JS_RESOLVE_EXTS, ".json", ".py", ".md", ".yml", ".yaml"]);

/**
 * ESM/TypeScript 的常见写法：源码是 `foo.ts`，import 写 `./foo.js`。
 * 只看扩展名会全部解析失败——必须把编译后的扩展名映射回源文件。
 */
const JS_EXT_ALIASES: Record<string, string[]> = {
  ".js": [".ts", ".tsx"],
  ".jsx": [".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"],
};

const TEST_PATTERNS: RegExp[] = [
  /^tests?\//,
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /(^|\/)test_[^/]+\.py$/,
  /_test\.py$/,
];

/** 用于解析 import 的语言类别 */
type ImportKind = "js" | "python";

function importKindFor(relPath: string): ImportKind | undefined {
  const ext = path.posix.extname(relPath).toLowerCase();
  if (JS_RESOLVE_EXTS.includes(ext)) return "js";
  if (ext === ".py") return "python";
  return undefined;
}

const JS_IMPORT_FROM = /\bimport\s+(?:type\s+)?[^;]*?\bfrom\s*["']([^"'\n]+)["']/g;
const JS_IMPORT_SIDE = /\bimport\s*["']([^"'\n]+)["']/g;
const JS_EXPORT_FROM = /\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s*from\s*["']([^"'\n]+)["']/g;
const JS_REQUIRE = /\brequire\s*\(\s*["']([^"'\n]+)["']\s*\)/g;
const JS_DYNAMIC_IMPORT = /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g;
const PY_FROM = /^\s*from\s+([.\w]+)\s+import\s+([^#\n]+)/gm;
const PY_IMPORT = /^\s*import\s+([\w.]+)/gm;

/**
 * 解析 `from . import (a, b as c)` 里的被导入名。
 * 这种写法模块部分只有点，真正的目标文件在 import 后面——不解析就会漏掉
 * `from . import utils` 这类常见的 Python 相对导入。
 */
function parseImportedNames(rest: string): string[] {
  return rest
    .replace(/[()]/g, " ")
    .split(",")
    .map((part) => part.trim().split(/\s+as\s+/)[0]?.trim() ?? "")
    .filter((name) => /^[A-Za-z_]\w*$/.test(name));
}

function collectRawImports(content: string, relPath: string): string[] {
  const kind = importKindFor(relPath);
  if (!kind) return [];
  const specs = new Set<string>();
  if (kind === "js") {
    for (const re of [
      JS_IMPORT_FROM,
      JS_IMPORT_SIDE,
      JS_EXPORT_FROM,
      JS_REQUIRE,
      JS_DYNAMIC_IMPORT,
    ]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        if (m[1]) specs.add(m[1]);
      }
    }
  } else {
    PY_FROM.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PY_FROM.exec(content)) !== null) {
      const mod = m[1];
      if (!mod) continue;
      specs.add(mod);
      // `from . import utils`：模块部分只有点，真正目标是 import 后面的名字
      if (/^\.+$/.test(mod) && m[2]) {
        for (const name of parseImportedNames(m[2])) specs.add(`${mod}${name}`);
      }
    }
    PY_IMPORT.lastIndex = 0;
    while ((m = PY_IMPORT.exec(content)) !== null) {
      if (m[1]) specs.add(m[1]);
    }
  }
  return [...specs];
}

function extOf(spec: string): string {
  const base = spec.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot).toLowerCase() : "";
}

interface ResolveOutcome {
  resolved: string | null;
  /** 解析失败是否该计入 unresolved（外部包 / 非源码资源不算） */
  counted: boolean;
}

function firstExisting(candidates: string[], fileSet: Set<string>): string | null {
  for (const c of candidates) {
    if (fileSet.has(c)) return c;
  }
  return null;
}

function resolveImport(
  spec: string,
  fromRel: string,
  fileSet: Set<string>,
): ResolveOutcome {
  const kind = importKindFor(fromRel) ?? "js";

  if (kind === "python") {
    const fromDir = path.posix.dirname(fromRel);
    const candidates: string[] = [];
    if (spec.startsWith(".")) {
      const dots = spec.match(/^\.+/)?.[0].length ?? 1;
      let baseDir = fromDir;
      for (let i = 1; i < dots; i++) {
        baseDir = path.posix.dirname(baseDir);
      }
      const rest = spec.slice(dots).replace(/\./g, "/");
      const joined = rest ? path.posix.join(baseDir, rest) : baseDir;
      candidates.push(`${joined}.py`, path.posix.join(joined, "__init__.py"));
    } else {
      // 绝对导入：先当成仓库内路径尝试；找不到就视为第三方包（不计入 unresolved）
      const joined = spec.replace(/\./g, "/");
      candidates.push(`${joined}.py`, path.posix.join(joined, "__init__.py"));
    }
    const resolved = firstExisting(candidates, fileSet);
    return { resolved, counted: Boolean(resolved === null && spec.startsWith(".")) };
  }

  // JS/TS：只解析相对/绝对路径；裸包名视为外部依赖
  if (!spec.startsWith(".") && !spec.startsWith("/")) {
    return { resolved: null, counted: false };
  }
  const base = spec.startsWith("/")
    ? path.posix.normalize(spec.slice(1))
    : path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
  const candidates: string[] = [];
  const ext = extOf(base);
  if (ext) {
    candidates.push(base);
    for (const alt of JS_EXT_ALIASES[ext] ?? []) {
      candidates.push(`${base.slice(0, -ext.length)}${alt}`);
    }
  } else {
    for (const e of JS_RESOLVE_EXTS) candidates.push(`${base}${e}`);
    for (const e of JS_RESOLVE_EXTS) candidates.push(`${base}/index${e}`);
  }
  const resolved = firstExisting(candidates, fileSet);
  if (resolved) return { resolved, counted: false };
  // ./styles.css 这类资源文件不在索引里，属于预期外情况，不制造噪音
  return { resolved: null, counted: !ext || RESOLVABLE_EXTS.has(ext) };
}

function isTestFile(relPath: string): boolean {
  return TEST_PATTERNS.some((re) => re.test(relPath));
}

/** 展示名优先用 package.json 的 name（worktree 目录名对人没有意义） */
async function detectRepoName(rootDir: string): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(rootDir, "package.json"), "utf8");
    const name = (JSON.parse(raw) as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) return name.trim();
  } catch {
    /* 非 Node 项目或文件不可读 */
  }
  return path.basename(rootDir);
}

function toIndexFile(file: CollectedFile, fileSet: Set<string>, stats: { unresolved: number }): RepoIndexFile {
  const rawImports = collectRawImports(file.content, file.relPath);
  const imports: string[] = [];
  for (const spec of rawImports) {
    const { resolved, counted } = resolveImport(spec, file.relPath, fileSet);
    if (resolved) {
      if (!imports.includes(resolved)) imports.push(resolved);
    } else if (counted) {
      stats.unresolved += 1;
    }
  }
  return {
    relPath: file.relPath,
    sizeBytes: file.sizeBytes,
    lines: (file.content.match(/\n/g) ?? []).length,
    language: languageForPath(file.relPath),
    isTest: isTestFile(file.relPath),
    imports: imports.sort(),
    rawImports: rawImports.sort(),
    todos: (file.content.match(/\b(?:TODO|FIXME)\b/g) ?? []).length,
  };
}

/**
 * 构建仓库索引。空目录返回空索引（不抛错——由命令层决定是否报错）。
 */
export async function buildRepoIndex(
  rootDir: string,
  options: RepoIndexOptions = {},
): Promise<RepoIndex> {
  const sensitiveSkipped: string[] = [];
  const sizeSkipped: Array<{ relPath: string; sizeBytes: number }> = [];
  const collected = await collectFiles(rootDir, {
    maxFileBytes: options.maxFileBytes ?? 200 * 1024,
    respectGitignore: options.respectGitignore,
    // 离线索引默认不做内容级密钥扫描，见 RepoIndexOptions.scanSecretContent
    contentSecretScan: options.scanSecretContent === true,
    onSensitiveSkipped: (rel) => sensitiveSkipped.push(rel),
    onSizeSkipped: (rel, sizeBytes) => sizeSkipped.push({ relPath: rel, sizeBytes }),
  });
  collected.sort((a, b) => a.relPath.localeCompare(b.relPath));

  const fileSet = new Set(collected.map((f) => f.relPath));
  const counter = { unresolved: 0 };
  const files = collected.map((f) => toIndexFile(f, fileSet, counter));

  const dependents = new Map<string, string[]>();
  for (const f of files) {
    for (const target of f.imports) {
      const list = dependents.get(target) ?? [];
      if (!list.includes(f.relPath)) list.push(f.relPath);
      dependents.set(target, list);
    }
  }
  for (const list of dependents.values()) list.sort();

  const groupMap = new Map<string, { files: number; lines: number }>();
  const langMap = new Map<string, { files: number; lines: number }>();
  let totalLines = 0;
  for (const f of files) {
    totalLines += f.lines;
    const groupName = f.relPath.includes("/")
      ? f.relPath.slice(0, f.relPath.indexOf("/"))
      : "(root)";
    const g = groupMap.get(groupName) ?? { files: 0, lines: 0 };
    g.files += 1;
    g.lines += f.lines;
    groupMap.set(groupName, g);

    const l = langMap.get(f.language) ?? { files: 0, lines: 0 };
    l.files += 1;
    l.lines += f.lines;
    langMap.set(f.language, l);
  }

  const groups = [...groupMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name));
  const languages = [...langMap.entries()]
    .map(([language, v]) => ({ language, ...v }))
    .sort((a, b) => b.lines - a.lines || a.language.localeCompare(b.language));

  return {
    rootDir,
    repoName: await detectRepoName(rootDir),
    files,
    groups,
    entryPoints: files.filter((f) => isEntryPoint(f.relPath)).map((f) => f.relPath),
    languages,
    dependents,
    unresolved: counter.unresolved,
    sensitiveSkipped,
    sizeSkipped,
    totals: { files: files.length, lines: totalLines },
  };
}

export interface ImpactResult {
  /** 实际参与分析的变更文件 */
  targets: string[];
  /** 第 1 层：直接依赖方 */
  direct: string[];
  /** 第 2 层及以后：传递依赖方 */
  transitive: string[];
  /** 受影响文件中的测试文件（去重、排序） */
  tests: string[];
}

/**
 * 反向依赖 BFS：给定变更文件，找「谁 import 了它」。
 *
 * @param depth 反向依赖层数；0 表示只看直接依赖方之外的零层（即不展开）
 */
export function computeImpact(
  index: RepoIndex,
  targets: string[],
  depth = 2,
): ImpactResult {
  const indexed = new Set(index.files.map((f) => f.relPath));

  /**
   * 变更文件可能已经不在工作区（暂存区里的删除 / 重命名旧路径）。
   * 这些目标不在索引里，但其他文件仍写着指向它的 import——把它们当作
   * 「虚拟文件」重新解析一遍，才能算出「删掉这个文件会影响谁」。
   */
  const virtualDependents = new Map<string, string[]>();
  for (const target of targets) {
    if (indexed.has(target)) continue;
    const fileSet = new Set(indexed);
    fileSet.add(target);
    const deps: string[] = [];
    for (const f of index.files) {
      for (const spec of f.rawImports) {
        if (resolveImport(spec, f.relPath, fileSet).resolved === target) {
          deps.push(f.relPath);
          break;
        }
      }
    }
    virtualDependents.set(target, deps.sort());
  }
  const dependentsOf = (file: string): string[] =>
    index.dependents.get(file) ?? virtualDependents.get(file) ?? [];

  const visited = new Set(targets);
  let frontier = [...targets];
  const levels: string[][] = [];

  for (let d = 0; d < Math.max(depth, 0); d++) {
    const next = new Set<string>();
    for (const file of frontier) {
      for (const dep of dependentsOf(file)) {
        if (!visited.has(dep)) {
          visited.add(dep);
          next.add(dep);
        }
      }
    }
    if (next.size === 0) break;
    const level = [...next].sort();
    levels.push(level);
    frontier = level;
  }

  const direct = levels[0] ?? [];
  const transitive = levels.slice(1).flat();
  const testPaths = new Map(
    index.files.filter((f) => f.isTest).map((f) => [f.relPath, true]),
  );
  const tests = [...direct, ...transitive]
    .filter((rel) => testPaths.has(rel))
    .sort();

  return { targets: [...targets].sort(), direct, transitive, tests };
}
