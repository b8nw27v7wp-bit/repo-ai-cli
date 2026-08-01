import { intro, outro, spinner, confirm, select, log, text } from "@clack/prompts";
import { getDiff, assertInGitRepo } from "../lib/git.js";
import { chatCompletion } from "../lib/llm.js";
import { buildCommitPrompt } from "../prompts/commit.js";
import type { CommitOptions } from "../types.js";

const interactive = Boolean(process.stdout.isTTY);

function progress(label: string) {
  if (interactive) {
    const s = spinner();
    s.start(label);
    return {
      stop(msg?: string) {
        s.stop(msg ?? label);
      },
    };
  }
  console.log(`... ${label}`);
  return {
    stop(msg?: string) {
      console.log(msg ? `... ${msg}` : `... ${label}`);
    },
  };
}

function done(msg: string): void {
  if (interactive) outro(`✓ ${msg}`);
  else console.log(`✓ ${msg}`);
}

function fail(msg: string): void {
  if (interactive) outro(`✖ ${msg}`);
  else console.error(`✖ ${msg}`);
  process.exitCode = 1;
}

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
  if (interactive) intro("repo-ai commit");

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
      maxBytes: (options.maxDiffKb ?? 200) * 1024,
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
    if (interactive) log.warn("diff 过大已截断，建议分次提交");
    else console.warn("warning: diff 过大已截断，建议分次提交");
  }

  // 2. 生成（失败自动重试由 llm.ts 内部处理）
  const progressBar = progress("AI 生成 commit message...");
  const messages = buildCommitPrompt({
    diff: diffResult.diff,
    truncated: diffResult.truncated,
    forcedType: options.type,
    files: diffResult.files,
  });

  const llmConfig = {
    provider: options.provider,
    baseUrl: options.baseUrl,
    model: options.model,
    apiKey: options.apiKey,
    maxTokens: options.maxOutputTokens,
    temperature: options.temperature,
  };

  let message: string;
  try {
    const generated = cleanMessage(
      await chatCompletion(messages, llmConfig),
    );
    if (!generated) {
      progressBar.stop();
      fail("AI 返回了空内容，请重试。");
      return;
    }
    message = generated;
  } catch (err) {
    progressBar.stop("生成失败");
    fail((err as Error).message);
    return;
  }
  progressBar.stop();

  // 3. --print：直接输出，不交互
  if (options.print) {
    console.log(message);
    return;
  }

  if (!interactive) {
    // 非 TTY：直接打印 message（无法交互确认）
    done("生成的 commit message：");
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
      const s = spinner();
      s.start("重新生成...");
      try {
        message = cleanMessage(await chatCompletion(messages, llmConfig));
      } catch (err) {
        s.stop("生成失败");
        fail((err as Error).message);
        return;
      }
      s.stop();
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
