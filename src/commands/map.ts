import { promises as fs } from "node:fs";
import path from "node:path";
import { intro } from "@clack/prompts";
import { buildFileTree } from "../lib/file-tree.js";
import { isEntryPoint } from "../lib/collect-files.js";
import { buildRepoIndex, type RepoIndex, type RepoIndexFile } from "../lib/repo-index.js";
import { getCurrentBranch, getRepoMeta, type RepoMeta } from "../lib/git.js";
import {
  interactive,
  setJsonMode,
  isJsonMode,
  emitJson,
  warn,
  done,
  fail,
  progress,
} from "../lib/ui.js";
import type { MapOptions } from "../types.js";

const MAX_LANGUAGE_ROWS = 5;

/** 把 --focus 归一化为仓库内相对路径（POSIX）；非法时抛错 */
function normalizeFocus(rootDir: string, focus: string): string {
  // 两条分支都要转成 POSIX：Windows 的 path.relative 返回反斜杠，
  // 而索引里的 relPath 一律是 `/`，不转换会一个文件都匹配不上。
  const rel = (
    path.isAbsolute(focus) ? path.relative(rootDir, focus) : focus
  ).replaceAll("\\", "/");
  const normalized = path.posix.normalize(rel);
  const clean = normalized.replace(/^\.\//, "").replace(/\/+$/, "");
  if (!clean || clean === ".") return "";
  // path.relative 跨盘符时会返回绝对路径（含盘符），同样视为仓库外
  if (path.isAbsolute(normalized) || clean.startsWith("..")) {
    throw new Error(`--focus 必须位于仓库内: ${focus}`);
  }
  return clean;
}

function filterByFocus(index: RepoIndex, focus: string): RepoIndexFile[] {
  if (!focus) return index.files;
  return index.files.filter(
    (f) => f.relPath === focus || f.relPath.startsWith(`${focus}/`),
  );
}

function summarize(files: RepoIndexFile[]): Pick<RepoIndex, "groups" | "languages" | "totals" | "entryPoints"> {
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
  return {
    groups: [...groupMap.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name)),
    languages: [...langMap.entries()]
      .map(([language, v]) => ({ language, ...v }))
      .sort((a, b) => b.lines - a.lines || a.language.localeCompare(b.language)),
    totals: { files: files.length, lines: totalLines },
    entryPoints: files.filter((f) => isEntryPoint(f.relPath)).map((f) => f.relPath),
  };
}

async function tryGitMeta(dir: string): Promise<{ branch: string; meta: RepoMeta } | null> {
  try {
    const branch = await getCurrentBranch(dir);
    const meta = await getRepoMeta(dir);
    return { branch, meta };
  } catch {
    return null;
  }
}

/**
 * repo-ai map — 仓库地图（离线）。
 * 一屏给出：规模 / 语言 / 入口 / 模块分组 / 限深目录树。
 */
export async function runMap(options: MapOptions): Promise<void> {
  setJsonMode(options.json === true);
  if (interactive && !isJsonMode()) intro("repo-ai map");

  const target = options.target || ".";
  const dir = path.resolve(target);
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) {
      fail(`请传目录: ${target}`);
      return;
    }
  } catch {
    fail(`路径不存在: ${target}`);
    return;
  }

  let focus: string;
  try {
    focus = normalizeFocus(dir, options.focus ?? "");
  } catch (err) {
    fail((err as Error).message);
    return;
  }

  const p = progress("扫描仓库...");
  const index = await buildRepoIndex(dir);
  p.stop();

  const files = filterByFocus(index, focus);
  if (files.length === 0) {
    fail(focus ? `--focus 下没有可分析文件: ${focus}` : "未收集到任何可分析的文件（目录为空或全部被过滤）");
    return;
  }

  const summary = summarize(files);
  const tree = buildFileTree(files.map((f) => f.relPath), index.repoName, {
    maxDepth: options.depth,
  });
  const git = await tryGitMeta(dir);

  if (isJsonMode()) {
    emitJson({
      ok: true,
      root: dir,
      name: index.repoName,
      focus: focus || undefined,
      git,
      totals: summary.totals,
      languages: summary.languages,
      entryPoints: summary.entryPoints,
      groups: summary.groups,
      tree,
      unresolved: index.unresolved,
      sensitiveSkipped: index.sensitiveSkipped,
      sizeSkipped: index.sizeSkipped.map((s) => s.relPath),
    });
    return;
  }

  console.log(`仓库: ${index.repoName}${focus ? `（聚焦 ${focus}）` : ""}`);
  if (git) {
    console.log(
      `git: ${git.branch}  提交 ${git.meta.commitCount}  贡献者 ${git.meta.authorCount}`,
    );
  }
  console.log(`文件: ${summary.totals.files}  行数: ${summary.totals.lines}`);

  if (summary.languages.length > 0) {
    console.log("\n语言（按行数）:");
    for (const l of summary.languages.slice(0, MAX_LANGUAGE_ROWS)) {
      console.log(`  ${l.language.padEnd(14)} ${l.lines.toString().padStart(7)} 行  ${l.files} 文件`);
    }
    if (summary.languages.length > MAX_LANGUAGE_ROWS) {
      console.log(`  ... 共 ${summary.languages.length} 种`);
    }
  }

  if (summary.entryPoints.length > 0) {
    console.log("\n入口文件:");
    for (const entry of summary.entryPoints) console.log(`  ${entry}`);
  }

  console.log("\n模块分组（按行数）:");
  for (const g of summary.groups) {
    const name = g.name === "(root)" ? "(根目录)" : `${g.name}/`;
    console.log(`  ${name.padEnd(16)} ${g.files.toString().padStart(4)} 文件  ${g.lines.toString().padStart(7)} 行`);
  }

  console.log("\n目录树:");
  console.log(tree);

  if (index.sensitiveSkipped.length > 0) {
    warn(`已排除 ${index.sensitiveSkipped.length} 个敏感文件（不参与地图）`);
  }
  if (index.sizeSkipped.length > 0) {
    warn(`已跳过 ${index.sizeSkipped.length} 个超过单文件上限的文件`);
  }
  done("地图生成完成");
}
