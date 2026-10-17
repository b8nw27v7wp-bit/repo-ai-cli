import { promises as fs } from "node:fs";
import path from "node:path";
import { intro } from "@clack/prompts";
import { collectMaterials } from "../lib/materials.js";
import { buildRepoIndex } from "../lib/repo-index.js";
import { estimateTokens } from "../lib/token-budget.js";
import { llmConfigFromOptions } from "../lib/llm.js";
import { callLlmOrFail, streamLlmOrFail } from "../lib/llm-step.js";
import { buildOnboardPrompt, type OnboardNavigation } from "../prompts/onboard.js";
import { writeOutput } from "../lib/output.js";
import { validateOnboardStructure } from "../lib/onboard-validate.js";
import {
  interactive,
  setJsonMode,
  isJsonMode,
  emitJson,
  say,
  warn,
  done,
  fail,
  progress,
} from "../lib/ui.js";
import { withUsage } from "../lib/usage.js";
import type { OnboardOptions } from "../types.js";

/**
 * repo-ai onboard — 生成新维护者上手导读（ONBOARDING.md）。
 *
 * 与 readme 的差异：readme 面向使用者（项目是什么、怎么用），onboard 面向维护者
 * （代码怎么分层、从哪读起、怎么跑测试）。材料同样经 collectFiles 过滤敏感文件。
 */
export async function runOnboard(options: OnboardOptions): Promise<void> {
  setJsonMode(options.json === true);
  if (interactive && !isJsonMode()) intro("repo-ai onboard");

  const cfg = options.resolvedConfig ?? {};
  const target = options.target || ".";
  const dir = path.resolve(target);

  const p = progress("准备中...");
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) {
      p.stop();
      fail(`请传目录: ${target}`);
      return;
    }
  } catch {
    p.stop();
    fail(`路径不存在: ${target}`);
    return;
  }

  p.update("收集项目材料...");
  let materials;
  try {
    materials = await collectMaterials({
      rootDir: dir,
      maxTokens: options.maxTokens,
      maxFileKb: options.maxFileKb,
    });
  } catch (err) {
    p.stop();
    fail((err as Error).message);
    return;
  }
  for (const rel of materials.sensitiveSkipped) {
    warn(`已排除疑似含密钥的文件（不发送给 LLM）: ${rel}`);
  }

  p.update("构建结构导航...");
  const index = await buildRepoIndex(dir);
  // 与 map 保持同一个展示名（package.json name 优先），避免 worktree 目录名外泄到文档
  const repoName = index.repoName;
  const navigation: OnboardNavigation = {
    entryPoints: index.entryPoints,
    groups: index.groups,
    unresolved: index.unresolved,
  };

  if (options.dryRun) {
    const included = materials.budget.files.filter((f) => f.mode !== "skip");
    const full = included.filter((f) => f.mode === "full").length;
    const sampled = included.length - full;
    if (isJsonMode()) {
      emitJson({
        ok: true,
        dryRun: true,
        repo: repoName,
        filesCollected: materials.files.length,
        filesIncluded: included.length,
        filesFull: full,
        filesSampled: sampled,
        treeTokens: estimateTokens(materials.budget.treeText),
        estimatedTokens: materials.budget.estimatedTokens,
        budget: options.maxTokens,
        entryPoints: navigation.entryPoints,
        groups: navigation.groups,
        unresolved: navigation.unresolved,
      });
      return;
    }
    p.stop();
    say(`repo: ${repoName}`);
    say(`files collected: ${materials.files.length}`);
    say(`files included: ${included.length} (full: ${full}, sampled: ${sampled})`);
    say(`file tree tokens: ~${estimateTokens(materials.budget.treeText)}`);
    say(`estimated total tokens: ~${materials.budget.estimatedTokens}`);
    say(`budget: ${options.maxTokens} tokens`);
    say(`entry points: ${navigation.entryPoints.join(", ") || "(未识别)"}`);
    if (materials.budget.skippedNote) warn(materials.budget.skippedNote);
    done("dry-run 完成，未调用 API");
    return;
  }

  p.update("AI 生成上手导读中...");
  const messages = buildOnboardPrompt(
    repoName,
    materials.budget,
    navigation,
  );
  const llmConfig = llmConfigFromOptions(options, cfg);
  const stream = options.stream === true && interactive && !isJsonMode();

  let content: string | null;
  if (stream) {
    p.stop("流式生成开始");
    content = await streamLlmOrFail(messages, llmConfig, p, "生成失败");
  } else {
    content = await callLlmOrFail(messages, llmConfig, p, "生成失败");
  }
  if (content === null) return;
  p.stop("生成完成");

  const validation = validateOnboardStructure(content);
  if (!validation.ok) {
    fail(
      "ONBOARDING 结构校验未通过，未写入文件：\n" +
        validation.issues.map((i) => `  - ${i}`).join("\n"),
    );
    return;
  }

  const outputPath = options.output ?? "ONBOARDING.md";
  const abs = await writeOutput(content, outputPath);
  if (isJsonMode()) {
    emitJson(
      withUsage({
        ok: true,
        output: abs,
        bytes: Buffer.byteLength(content),
      }),
    );
    return;
  }
  done(`ONBOARDING 已写入: ${abs}`);
}
