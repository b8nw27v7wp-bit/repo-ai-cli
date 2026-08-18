import { promises as fs } from "node:fs";
import path from "node:path";
import { HARD_SKIP_DIRS, BINARY_EXTS } from "./collect-files.js";
import { assertInGitRepo, getRepoMeta, type RepoMeta } from "./git.js";

/** 扩展名 → 语言名（覆盖常见语言，其余按扩展名大写兜底） */
const EXT_LANG: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript", cts: "TypeScript",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  py: "Python", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", kts: "Kotlin",
  c: "C", h: "C", cpp: "C++", hpp: "C++", cc: "C++", cs: "C#", rb: "Ruby",
  php: "PHP", swift: "Swift", vue: "Vue", svelte: "Svelte", sh: "Shell",
  bash: "Shell", zsh: "Shell", sql: "SQL", html: "HTML", css: "CSS",
  scss: "SCSS", sass: "Sass", less: "Less", md: "Markdown", mdx: "Markdown",
  json: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML", xml: "XML",
  gradle: "Gradle", properties: "Properties",
};

export interface LanguageStat {
  language: string;
  files: number;
  lines: number;
}

export interface RepoStats {
  files: number;
  lines: number;
  /** 按行数降序 */
  languages: LanguageStat[];
  repo?: RepoMeta;
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
 * 统计目录：文件数、总行数、按语言归类（跳过二进制与常见生成目录）。
 * 若在 git 仓库内，附带提交数 / 贡献者数 / 首次与最近提交日期。
 */
export async function getRepoStats(rootDir: string): Promise<RepoStats> {
  const relPaths = await walk(rootDir, rootDir);

  const langMap = new Map<string, { files: number; lines: number }>();
  let totalLines = 0;
  let fileCount = 0;

  for (const rel of relPaths) {
    const ext = path.extname(rel).slice(1).toLowerCase();
    if (BINARY_EXTS.has(ext)) continue;
    const language = EXT_LANG[ext] ?? (ext ? ext.toUpperCase() : "other");

    let content: string;
    try {
      content = await fs.readFile(path.join(rootDir, rel), "utf8");
    } catch {
      continue;
    }
    if (content.includes("\0")) continue;

    fileCount += 1;
    const lines = (content.match(/\n/g) ?? []).length;
    totalLines += lines;
    const cur = langMap.get(language) ?? { files: 0, lines: 0 };
    cur.files += 1;
    cur.lines += lines;
    langMap.set(language, cur);
  }

  const languages: LanguageStat[] = [...langMap.entries()]
    .map(([language, v]) => ({ language, files: v.files, lines: v.lines }))
    .sort((a, b) => b.lines - a.lines);

  let repo: RepoMeta | undefined;
  try {
    await assertInGitRepo(rootDir);
    repo = await getRepoMeta(rootDir);
  } catch {
    /* 非 git 仓库则无元信息 */
  }

  return { files: fileCount, lines: totalLines, languages, repo };
}