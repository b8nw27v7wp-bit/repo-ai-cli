import { intro } from "@clack/prompts";
import { collectBadgesContext, renderBadges } from "../lib/badges.js";
import {
  interactive,
  setJsonMode,
  isJsonMode,
  emitJson,
  done,
  fail,
} from "../lib/ui.js";
import { writeOutput } from "../lib/output.js";
import type { BadgesOptions } from "../types.js";

/**
 * repo-ai badges — 根据仓库上下文离线生成 README 徽章（CI/npm/license/node/stars）。
 */
export async function runBadges(options: BadgesOptions): Promise<void> {
  setJsonMode(options.json === true);
  if (interactive && !isJsonMode()) intro("repo-ai badges");

  const cwd = process.cwd();
  const ctx = await collectBadgesContext(cwd);
  const text = renderBadges(ctx);

  if (!text) {
    fail(
      "未检测到可生成徽章的上下文（需要 git remote 指向 GitHub 或 package.json）",
    );
    return;
  }

  if (options.output) {
    const abs = await writeOutput(text + "\n", options.output);
    if (isJsonMode()) {
      emitJson({ ok: true, output: abs, badges: text.split("\n").length });
      return;
    }
    done(`徽章已写入: ${abs}`);
    return;
  }

  if (isJsonMode()) {
    emitJson({ ok: true, badges: text.split("\n").length, markdown: text });
    return;
  }
  console.log(text);
}
