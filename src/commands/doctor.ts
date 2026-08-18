import { intro } from "@clack/prompts";
import { collectChecks } from "../lib/doctor.js";
import {
  interactive,
  setJsonMode,
  isJsonMode,
  emitJson,
  say,
  done,
  progress,
} from "../lib/ui.js";
import type { DoctorOptions } from "../types.js";

const MARK = { ok: "✓", warn: "!", fail: "✖" } as const;

/**
 * repo-ai doctor — 离线体检：Node 版本 / git 仓库 / 配置 / LLM key。
 * 有任何 fail 项时退出码 1（便于 CI 门禁）。
 */
export async function runDoctor(options: DoctorOptions): Promise<void> {
  setJsonMode(options.json === true);
  if (interactive && !isJsonMode()) intro("repo-ai doctor");

  const cwd = process.cwd();
  const progressBar = progress("检查环境中...");
  const checks = await collectChecks(cwd);
  progressBar.stop();

  if (isJsonMode()) {
    emitJson({ ok: checks.every((c) => c.status !== "fail"), checks });
    return;
  }

  for (const c of checks) {
    console.log(`${MARK[c.status]} ${c.name}: ${c.detail}`);
  }
  const fails = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  if (fails > 0) {
    say(`${fails} 项失败${warns > 0 ? `，${warns} 项提醒` : ""}`);
    process.exitCode = 1;
  } else {
    done(`检查完成（${warns > 0 ? `${warns} 项提醒` : "全部通过"}）`);
  }
}