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
import { llmConfigFromOptions } from "../lib/llm.js";
import { callLlmOrFail } from "../lib/llm-step.js";
import { buildPrPrompt, parsePrResult } from "../prompts/pr.js";
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
import { withUsage } from "../lib/usage.js";
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
  // 配置已由 CLI 层解析（CLI 参数 > 配置 > 内置默认），命令层不再读配置文件
  const cfg = options.resolvedConfig ?? {};
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
      maxBytes: options.maxDiffKb * 1024,
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

  const raw = await callLlmOrFail(
    messages,
    llmConfigFromOptions(options, cfg),
    progressBar,
    "生成失败",
  );
  if (raw === null) return;
  progressBar.stop();

  const result = parsePrResult(raw);
  if (!result.title) {
    // 与 llm-step 的「空响应」不是一回事：内容有，只是没解析出标题——
    // 提示要指向格式，否则用户会以为模型什么都没返回
    fail("未能从 AI 输出中解析出 PR 标题（期望首行为 `feat: ...` 形式的标题）。");
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
    emitJson(
      withUsage({
        ok: true,
        base,
        branch: branch ?? null,
        title: result.title,
        body: result.body,
        files: diffResult.files,
      }),
    );
    return;
  }
  console.log(result.title + "\n");
  console.log(result.body);
}