import { intro, confirm, select, text } from "@clack/prompts";
import { getDiff, assertInGitRepo } from "../lib/git.js";
import { llmConfigFromOptions } from "../lib/llm.js";
import { callLlmOrFail } from "../lib/llm-step.js";
import { buildCommitPrompt } from "../prompts/commit.js";
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
import type { CommitOptions } from "../types.js";

/** 去掉可能的 ``` 代码块包裹 / 首尾空白 */
function cleanMessage(raw: string): string {
  let m = raw.trim();
  if (m.startsWith("```")) {
    m = m.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "");
  }
  // 去掉 AI 可能加的引号
  m = m.replace(/^["']|["']$/g, "");
  return m.trim();
}

export async function runCommit(options: CommitOptions): Promise<void> {
  setJsonMode(options.json === true);
  // 配置已由 CLI 层解析（CLI 参数 > 配置 > 内置默认），命令层不再读配置文件
  const cfg = options.resolvedConfig ?? {};
  if (interactive && !isJsonMode()) intro("repo-ai commit");

  const cwd = process.cwd();
  try {
    await assertInGitRepo(cwd);
  } catch (err) {
    fail((err as Error).message);
    return;
  }

  // 1. 读 diff
  let diffResult;
  try {
    diffResult = await getDiff(cwd, {
      staged: options.staged !== false,
      all: options.all ?? false,
      maxBytes: options.maxDiffKb * 1024,
    });
  } catch (err) {
    fail((err as Error).message);
    return;
  }

  if (!diffResult.diff.trim()) {
    fail(
      options.all
        ? "没有检测到任何改动（git diff HEAD 为空）"
        : "没有检测到暂存区的改动。请先 git add，或用 --all 包含未暂存改动。",
    );
    return;
  }

  if (diffResult.truncated) {
    warn("diff 过大已截断，建议分次提交");
  }

  // 2. 生成（失败自动重试由 llm.ts 内部处理）
  const progressBar = progress("AI 生成 commit message...");
  const messages = buildCommitPrompt({
    diff: diffResult.diff,
    truncated: diffResult.truncated,
    forcedType: options.type,
    files: diffResult.files,
  });

  const llmConfig = llmConfigFromOptions(options, cfg);

  let message = await callLlmOrFail(
    messages,
    llmConfig,
    progressBar,
    "生成失败",
    cleanMessage,
  );
  if (message === null) return;
  progressBar.stop();

  // 3. --print 或 --json：直接输出，不交互
  if (options.print || isJsonMode()) {
    if (isJsonMode()) emitJson(withUsage({ ok: true, message }));
    else console.log(message);
    return;
  }

  if (!interactive) {
    // 非 TTY：只打印 message（无法交互确认；保持 stdout 纯净便于管道）
    console.log(message);
    return;
  }

  // 4. 交互确认流
  while (true) {
    console.log("\n" + message + "\n");
    const action = await select({
      message: "如何处理这条 commit message?",
      options: [
        { value: "use", label: "✓ 使用" },
        { value: "regenerate", label: "↻ 重新生成" },
        { value: "edit", label: "✎ 编辑" },
        { value: "abort", label: "✖ 放弃" },
      ],
    });

    if (action === "use") {
      done("commit message：");
      console.log(message);
      return;
    }
    if (action === "regenerate") {
      const regen = progress("重新生成...");
      const regenerated = await callLlmOrFail(
        messages,
        llmConfig,
        regen,
        "生成失败",
        cleanMessage,
      );
      if (regenerated === null) return;
      regen.stop();
      message = regenerated;
      continue;
    }
    if (action === "edit") {
      const edited = await text({
        message: "编辑 commit message",
        initialValue: message,
      });
      if (typeof edited === "string" && edited.trim()) {
        message = edited.trim();
        continue;
      }
      continue;
    }
    // abort
    const sure = await confirm({ message: "放弃本次生成?" });
    if (sure) {
      done("已放弃");
      return;
    }
  }
}
