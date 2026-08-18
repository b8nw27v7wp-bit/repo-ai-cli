import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { intro, confirm } from "@clack/prompts";
import {
  assertInGitRepo,
  detectBaseBranch,
  getBranchDiff,
  getCurrentBranch,
} from "../lib/git.js";
import { chatCompletion, llmConfigFromOptions } from "../lib/llm.js";
import { buildPrPrompt, parsePrResult } from "../prompts/pr.js";
import { loadConfig } from "../lib/config.js";
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
import type { PrOptions } from "../types.js";

const execFileAsync = promisify(execFile);

/** 用 gh CLI 创建 PR；body 通过临时文件传入，完成后清理。 */
async function createGithubPr(
  title: string,
  body: string,
  base: string,
): Promise<string | null> {
  try {
    await execFileAsync("gh", ["--version"]);
  } catch {
    fail(
      "未检测到 gh CLI。安装: https://cli.github.com/（或 brew install gh / winget install GitHub.cli）",
    );
    return null;
  }

  const tmp = path.join(os.tmpdir(), `repo-ai-pr-${process.pid}.md`);
  await fs.writeFile(tmp, body, "utf8");
  try {
    const args = ["pr", "create", "--title", title, "--body-file", tmp, "--base", base];
    const { stdout } = await execFileAsync("gh", args);
    return stdout.trim() || null;
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
}

/**
 * repo-ai pr — 根据当前分支相对 base 的差异生成 PR 标题 + 描述。
 * 输出打印到 stdout；--json 结构化；--create 用 gh 直接创建 PR。
 */
export async function runPr(options: PrOptions): Promise<void> {
  setJsonMode(options.json === true);
  const cfg = await loadConfig();
  if (interactive && !isJsonMode()) intro("repo-ai pr");

  const cwd = process.cwd();
  try {
    await assertInGitRepo(cwd);
  } catch (err) {
    fail((err as Error).message);
    return;
  }

  // 1. 确定 base 分支
  let base: string;
  try {
    base = options.base ?? (await detectBaseBranch(cwd));
  } catch (err) {
    fail((err as Error).message);
    return;
  }

  const branch = await getCurrentBranch(cwd).catch(() => undefined);

  // 2. 读差异
  let diffResult;
  try {
    diffResult = await getBranchDiff(cwd, {
      base,
      maxBytes: (options.maxDiffKb ?? 200) * 1024,
    });
  } catch (err) {
    fail((err as Error).message);
    return;
  }

  if (!diffResult.diff.trim()) {
    fail(`当前分支与 ${base} 无差异，无需生成 PR。`);
    return;
  }

  if (diffResult.truncated) {
    warn("diff 过大已截断，PR 描述可能不完整");
  }

  // 3. 生成
  const progressBar = progress("AI 生成 PR 描述...");
  const repoName = path.basename(cwd);
  const messages = buildPrPrompt({
    repoName,
    branch,
    base,
    diff: diffResult.diff,
    truncated: diffResult.truncated,
    files: diffResult.files,
  });

  let result;
  try {
    const raw = await chatCompletion(messages, llmConfigFromOptions(options, cfg));
    result = parsePrResult(raw);
  } catch (err) {
    progressBar.stop("生成失败");
    fail((err as Error).message);
    return;
  }
  progressBar.stop();

  if (!result.title) {
    fail("AI 返回了空内容，请重试。");
    return;
  }

  // 4. --create：确认后用 gh 直接创建 PR（JSON 模式保持纯输出）
  if (options.create && !isJsonMode()) {
    console.log(result.title + "\n");
    console.log(result.body + "\n");
    if (interactive) {
      const ok = await confirm({ message: "用 gh 创建这个 PR?" });
      if (!ok) {
        done("已取消，未创建 PR");
        return;
      }
    }
    try {
      const ghOut = await createGithubPr(result.title, result.body, base);
      done(ghOut ? ghOut : "PR 已创建");
    } catch (err) {
      fail((err as Error).message);
    }
    return;
  }

  // 5. 输出
  if (isJsonMode()) {
    emitJson({
      ok: true,
      base,
      branch: branch ?? null,
      title: result.title,
      body: result.body,
      files: diffResult.files,
    });
    return;
  }
  console.log(result.title + "\n");
  console.log(result.body);
}