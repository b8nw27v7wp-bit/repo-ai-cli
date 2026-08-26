import { intro } from "@clack/prompts";
import { collectChecks, type CheckResult } from "../lib/doctor.js";
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

/** 汇总一行（JSON 与文本共用） */
function summarize(checks: CheckResult[]): { ok: boolean; fails: number; warns: number } {
  const fails = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  return { ok: fails === 0, fails, warns };
}

/**
 * repo-ai doctor — 离线体检：Node 版本 / git 仓库 / 配置文件合法性 /
 * 激活 profile / 各 provider key 状态 / 网络代理。
 * 有任何 fail 项时退出码 1（便于 CI 门禁）。绝不真实调用任何 LLM API。
 */
export async function runDoctor(options: DoctorOptions): Promise<void> {
  setJsonMode(options.json === true);
  if (interactive && !isJsonMode()) intro("repo-ai doctor");

  const cwd = process.cwd();
  const progressBar = progress("检查环境中...");
  const checks = await collectChecks(cwd);
  progressBar.stop();

  if (isJsonMode()) {
    const summary = summarize(checks);
    emitJson({ ok: summary.ok, checks });
    // 与文本模式一致：有 fail 项时退出码 1（CI 门禁依赖）
    if (!summary.ok) process.exitCode = 1;
    return;
  }

  for (const c of checks) {
    console.log(`${MARK[c.status]} ${c.name}: ${c.detail}`);
  }

  // 修复建议块：只列非通过项，按严重度排序（fail 在前）
  const needFix = checks
    .filter((c) => c.fix && c.status !== "ok")
    .sort((a, b) => (a.status === "fail" ? -1 : 1) - (b.status === "fail" ? -1 : 1));
  if (needFix.length > 0) {
    say("");
    say("修复建议：");
    for (const c of needFix) {
      console.log(`  ${MARK[c.status]} ${c.name} → ${c.fix}`);
    }
  }

  const { fails, warns } = summarize(checks);
  if (fails > 0) {
    say(`${fails} 项失败${warns > 0 ? `，${warns} 项提醒` : ""}`);
    process.exitCode = 1;
  } else {
    done(`检查完成（${warns > 0 ? `${warns} 项提醒` : "全部通过"}）`);
  }
}
