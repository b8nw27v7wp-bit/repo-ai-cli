import { promises as fs } from "node:fs";
import path from "node:path";
import { intro } from "@clack/prompts";
import { getRepoStats } from "../lib/stats.js";
import {
  interactive,
  setJsonMode,
  isJsonMode,
  emitJson,
  done,
  fail,
  progress,
} from "../lib/ui.js";
import type { StatsOptions } from "../types.js";

/**
 * repo-ai stats — 仓库统计（文件 / 行数 / 语言 / 提交信息，离线）。
 */
export async function runStats(options: StatsOptions): Promise<void> {
  setJsonMode(options.json === true);
  if (interactive && !isJsonMode()) intro("repo-ai stats");

  const target = options.target || ".";
  const dir = path.resolve(target);
  try {
    const s = await fs.stat(dir);
    if (!s.isDirectory()) {
      fail(`请传目录: ${target}`);
      return;
    }
  } catch {
    fail(`路径不存在: ${target}`);
    return;
  }

  const progressBar = progress("统计中...");
  const stats = await getRepoStats(dir);
  progressBar.stop();

  if (isJsonMode()) {
    emitJson({ ok: true, ...stats });
    return;
  }

  console.log(`文件: ${stats.files}  总行数: ${stats.lines}`);
  if (stats.repo) {
    console.log(
      `提交: ${stats.repo.commitCount}  贡献者: ${stats.repo.authorCount}` +
        (stats.repo.firstCommitDate
          ? `  ${stats.repo.firstCommitDate} ~ ${stats.repo.lastCommitDate ?? ""}`
          : ""),
    );
  }
  console.log("\n语言分布（按行数）:");
  for (const l of stats.languages.slice(0, 10)) {
    console.log(`  ${l.language.padEnd(14)} ${l.lines.toString().padStart(7)} 行  ${l.files} 文件`);
  }
  if (stats.languages.length > 10) {
    console.log(`  ... 共 ${stats.languages.length} 种`);
  }
  done("统计完成");
}