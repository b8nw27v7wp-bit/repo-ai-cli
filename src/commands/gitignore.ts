import { intro } from "@clack/prompts";
import {
  GITIGNORE_TEMPLATES,
  findGitignoreTemplate,
} from "../lib/gitignore-templates.js";
import { writeOutput } from "../lib/output.js";
import {
  interactive,
  setJsonMode,
  isJsonMode,
  emitJson,
  say,
  done,
  fail,
} from "../lib/ui.js";
import type { GitignoreOptions } from "../types.js";

/**
 * repo-ai gitignore — 生成 .gitignore（内置多语言模板，离线）。
 * 用法: repo-ai gitignore node python [-o .gitignore] / --list
 */
export async function runGitignore(options: GitignoreOptions): Promise<void> {
  setJsonMode(options.json === true);
  if (interactive && !isJsonMode()) intro("repo-ai gitignore");

  if (options.list) {
    if (isJsonMode()) {
      emitJson({
        ok: true,
        templates: GITIGNORE_TEMPLATES.map((t) => ({ id: t.id, name: t.name })),
      });
      return;
    }
    for (const t of GITIGNORE_TEMPLATES) {
      console.log(`${t.id.padEnd(12)} ${t.name}`);
    }
    return;
  }

  const ids = options.templates ?? [];
  if (ids.length === 0) {
    fail("请指定至少一个模板，或用 --list 查看可用模板。示例: repo-ai gitignore node python");
    return;
  }

  const unknown = ids.filter((id) => !findGitignoreTemplate(id));
  if (unknown.length > 0) {
    fail(
      `未知模板: ${unknown.join(", ")}。可用: ${GITIGNORE_TEMPLATES.map((t) => t.id).join(", ")}（或用 --list）`,
    );
    return;
  }

  // 合并并去重（保留顺序）
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const id of ids) {
    const t = findGitignoreTemplate(id);
    if (!t) continue;
    lines.push(`# ${t.name}`, ...t.content.split("\n"));
  }
  const deduped = lines.filter((l) => {
    if (l.startsWith("#")) return true;
    const key = l.trim();
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const content = deduped.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";

  if (options.output) {
    const abs = await writeOutput(content, options.output);
    if (isJsonMode()) emitJson({ ok: true, output: abs, templates: ids });
    else done(`.gitignore 已写入: ${abs}`);
    return;
  }

  if (isJsonMode()) emitJson({ ok: true, content, templates: ids });
  else console.log(content);
  if (!options.output && !isJsonMode()) say("用 -o .gitignore 写入文件");
}