import { promises as fs } from "node:fs";
import path from "node:path";
import { intro } from "@clack/prompts";
import { getLog, getLatestTag, assertInGitRepo, createTag, tagExists } from "../lib/git.js";
import {
  suggestNextVersion,
  computeNext,
  bumpPackageVersion,
  parseSemver,
  type BumpLevel,
} from "../lib/version.js";
import {
  interactive,
  setJsonMode,
  isJsonMode,
  emitJson,
  say,
  done,
  fail,
  progress,
} from "../lib/ui.js";
import type { ReleaseOptions } from "../types.js";

const LEVELS: BumpLevel[] = ["major", "minor", "patch"];

async function currentVersion(cwd: string): Promise<string> {
  try {
    const pkg = JSON.parse(
      await fs.readFile(path.join(cwd, "package.json"), "utf8"),
    ) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * repo-ai release — 语义化版本建议与发布。
 * 默认只建议（离线、幂等）；--bump 实际改版本；--tag 打 tag。
 */
export async function runRelease(options: ReleaseOptions): Promise<void> {
  setJsonMode(options.json === true);
  if (interactive && !isJsonMode()) intro("repo-ai release");

  const cwd = process.cwd();
  try {
    await assertInGitRepo(cwd);
  } catch (err) {
    fail((err as Error).message);
    return;
  }

  const p = progress("分析提交历史...");
  const tag = await getLatestTag(cwd).catch(() => "");
  const commits = await getLog(cwd, {
    range: tag ? `${tag}..` : undefined,
    max: 200,
  }).catch(() => []);

  if (commits.length === 0) {
    p.stop();
    fail("自最近的 tag 以来没有任何提交");
    return;
  }

  const current = await currentVersion(cwd);
  if (!parseSemver(current)) {
    p.stop();
    fail(`package.json 版本号非法: ${current}（需要 x.y.z 格式）`);
    return;
  }
  const suggestion = suggestNextVersion(commits, current);
  p.stop();

  // 建议模式（未指定 --bump）
  if (!options.bump) {
    if (isJsonMode()) {
      emitJson({
        ok: true,
        ...suggestion,
        since: tag || null,
        commits: commits.map((c) => c.subject),
      });
      return;
    }
    console.log(`当前版本: ${current}`);
    console.log(
      `建议升级: ${suggestion.next}（${suggestion.level}）— ` +
        `breaking ${suggestion.breaking} / feat ${suggestion.features} / fix ${suggestion.fixes} / 共 ${suggestion.commitCount} 提交`,
    );
    console.log("\n将包含的提交:");
    for (const c of commits.slice(0, 20)) {
      console.log(`  ${c.shortHash} ${c.subject}`);
    }
    if (commits.length > 20) console.log(`  ... 共 ${commits.length} 条`);
    say(`确认后用: repo-ai release --bump ${suggestion.level} --tag`);
    return;
  }

  // 应用模式
  const level = options.bump === "auto"
    ? suggestion.level
    : LEVELS.includes(options.bump as BumpLevel)
      ? (options.bump as BumpLevel)
      : null;
  if (!level) {
    fail(`未知 bump: ${options.bump}。可用: ${LEVELS.join("/")} 或 auto`);
    return;
  }

  const next = level === suggestion.level ? suggestion.next : computeNext(current, level);
  const files = await bumpPackageVersion(cwd, next);
  if (!files.packageJson) {
    fail("当前目录没有 package.json，无法 bump 版本");
    return;
  }

  let tagName: string | null = null;
  if (options.tag) {
    tagName = `v${next}`;
    if (await tagExists(cwd, tagName)) {
      fail(`tag 已存在: ${tagName}（先删除或换版本号）`);
      return;
    }
    try {
      await createTag(cwd, tagName, `release ${tagName}`);
    } catch (err) {
      fail((err as Error).message);
      return;
    }
  }

  if (isJsonMode()) {
    emitJson({ ok: true, version: next, level, ...files, tag: tagName });
    return;
  }
  done(`版本已更新到 ${next}（level=${level}）`);
  if (tagName) say(`已打 tag: ${tagName}（用 git push --tags 发布）`);
  else say("未打 tag（加 --tag 自动打）");
  say("提示: 可运行 repo-ai changelog 生成 CHANGELOG");
}