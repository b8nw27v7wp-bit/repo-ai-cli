import path from "node:path";
import { intro } from "@clack/prompts";
import { buildRepoIndex, computeImpact } from "../lib/repo-index.js";
import { assertInGitRepo, getRepoRoot, getStagedChanges } from "../lib/git.js";
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
import type { ImpactOptions } from "../types.js";

/** 把用户输入（相对当前目录 / 绝对路径）归一化为索引里的相对路径 */
function toRelPath(cwd: string, input: string): string {
  const abs = path.isAbsolute(input) ? input : path.resolve(cwd, input);
  return path.relative(cwd, abs).replaceAll("\\", "/");
}

async function stagedTargets(cwd: string): Promise<string[]> {
  try {
    await assertInGitRepo(cwd);
  } catch {
    // git 自己会抛 "fatal: not a git repository"，对用户不友好；这里统一成一句人话
    throw new Error("当前目录不在 git 仓库内（--diff 需要 git）");
  }
  const changes = await getStagedChanges(cwd);
  if (changes.length === 0) return [];
  // git 给的是仓库根相对路径；从子目录运行时换算成当前目录相对路径
  const repoRoot = await getRepoRoot(cwd);
  const rawPaths = new Set<string>();
  for (const change of changes) {
    rawPaths.add(change.path);
    // 重命名/复制：旧路径上仍可能有 import，必须一起分析
    if (change.oldPath) rawPaths.add(change.oldPath);
  }
  const out: string[] = [];
  for (const rel of rawPaths) {
    const relToCwd = path
      .relative(cwd, path.resolve(repoRoot, rel))
      .replaceAll("\\", "/");
    if (!relToCwd.startsWith("..")) out.push(relToCwd);
  }
  return out.sort();
}

/**
 * repo-ai impact — 变更影响分析（离线）。
 * 基于文件级 import 图，反向找出「改这个文件会影响谁、该跑哪些测试」。
 */
export async function runImpact(options: ImpactOptions): Promise<void> {
  setJsonMode(options.json === true);
  if (interactive && !isJsonMode()) intro("repo-ai impact");

  const cwd = process.cwd();
  const explicit = options.targets ?? [];
  const useDiff = options.diff === true || explicit.length === 0;

  let inputs: string[];
  if (useDiff) {
    try {
      inputs = await stagedTargets(cwd);
    } catch (err) {
      fail((err as Error).message);
      return;
    }
    if (inputs.length === 0) {
      fail("暂存区没有可分析的改动（先 git add，或直接传文件路径）");
      return;
    }
  } else {
    inputs = explicit;
  }

  const p = progress("构建 import 图...");
  const index = await buildRepoIndex(cwd);
  p.stop();
  if (index.files.length === 0) {
    fail("未收集到任何可分析的文件（目录为空或全部被过滤）");
    return;
  }

  const indexed = new Set(index.files.map((f) => f.relPath));
  const targets: string[] = [];
  const notIndexed: string[] = [];
  // --diff 里的文件可能是已删除/已重命名的旧路径：不在索引里也要分析，
  // computeImpact 会把它们当作虚拟节点重新解析其他文件的 import。
  const allowMissing = useDiff;
  for (const input of inputs) {
    const rel = toRelPath(cwd, input);
    const known = indexed.has(rel);
    if (known || allowMissing) {
      if (!targets.includes(rel)) targets.push(rel);
      if (!known) notIndexed.push(input);
    } else {
      notIndexed.push(input);
    }
  }

  if (targets.length === 0) {
    fail(
      "变更文件都不在索引中（可能是敏感文件、超大文件或非源码文件）: " +
        notIndexed.join(", "),
    );
    return;
  }

  const impact = computeImpact(index, targets, options.depth);

  if (isJsonMode()) {
    emitJson({
      ok: true,
      depth: options.depth,
      targets: impact.targets,
      direct: impact.direct,
      transitive: impact.transitive,
      tests: impact.tests,
      unresolved: index.unresolved,
      notIndexed,
    });
    return;
  }

  console.log(`变更文件: ${impact.targets.join(", ")}`);
  console.log(`\n直接依赖方（${impact.direct.length}）:`);
  if (impact.direct.length === 0) console.log("  (无)");
  for (const f of impact.direct) console.log(`  ${f}`);
  console.log(`\n传递依赖方（${impact.transitive.length}）:`);
  if (impact.transitive.length === 0) console.log("  (无)");
  for (const f of impact.transitive) console.log(`  ${f}`);
  console.log(`\n受影响测试（${impact.tests.length}）:`);
  if (impact.tests.length === 0) console.log("  (无)");
  for (const f of impact.tests) console.log(`  ${f}`);

  if (notIndexed.length > 0) {
    warn(
      allowMissing
        ? `有 ${notIndexed.length} 个变更文件已不在工作区（删除/重命名旧路径），已按虚拟节点分析: ${notIndexed.join(", ")}`
        : `有 ${notIndexed.length} 个变更文件不在索引中（已跳过）: ${notIndexed.join(", ")}`,
    );
  }
  if (index.unresolved > 0) {
    warn(`有 ${index.unresolved} 处本地 import 无法解析（路径别名/动态拼接不在支持范围）`);
  }
  done("影响分析完成");
}
