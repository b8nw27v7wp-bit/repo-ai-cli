import { intro } from "@clack/prompts";
import { LICENSE_TEMPLATES, findLicenseTemplate } from "../lib/licenses.js";
import { getGitUserName } from "../lib/git.js";
import { writeOutput } from "../lib/output.js";
import {
  interactive,
  setJsonMode,
  isJsonMode,
  emitJson,
  done,
  fail,
} from "../lib/ui.js";
import type { LicenseOptions } from "../types.js";

/**
 * repo-ai license — 生成 LICENSE 文件（内置开源许可模板，离线）。
 * 用法: repo-ai license mit [--name "Yu" --year 2026] [-o LICENSE]
 */
export async function runLicense(options: LicenseOptions): Promise<void> {
  setJsonMode(options.json === true);
  if (interactive && !isJsonMode()) intro("repo-ai license");

  const id = (options.license ?? "").trim().toLowerCase();
  const template = findLicenseTemplate(id);
  if (!template) {
    fail(
      `未知许可: ${id || "（空）"}。可用: ${LICENSE_TEMPLATES.map((l) => l.id).join(", ")}`,
    );
    return;
  }

  const year = options.year ?? String(new Date().getFullYear());
  const holder =
    (options.name ?? (await getGitUserName(process.cwd()))) || "Your Name";

  const content = template.render({ year, holder });

  const output = options.output ?? "LICENSE";
  const abs = await writeOutput(content, output);

  if (isJsonMode()) {
    emitJson({ ok: true, license: template.id, holder, year, output: abs });
    return;
  }
  done(`${template.name} 已写入: ${abs}（署名 ${holder}）`);
}