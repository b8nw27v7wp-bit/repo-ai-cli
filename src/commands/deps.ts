import { intro } from "@clack/prompts";
import { readDeps } from "../lib/deps.js";
import { npmOutdated, npmAudit } from "../lib/npm-checks.js";
import {
  interactive,
  setJsonMode,
  isJsonMode,
  emitJson,
  say,
  warn,
  done,
  fail,
} from "../lib/ui.js";
import type { DepsOptions } from "../types.js";

/**
 * repo-ai deps — 解析依赖清单（package.json / requirements.txt，离线）。
 * --outdated：封装 npm outdated 显示可升级依赖；--audit：封装 npm audit 安全检查。
 */
export async function runDeps(options: DepsOptions): Promise<void> {
  setJsonMode(options.json === true);
  if (interactive && !isJsonMode()) intro("repo-ai deps");

  const cwd = process.cwd();
  let info;
  try {
    info = await readDeps(cwd);
  } catch (err) {
    fail((err as Error).message);
    return;
  }

  const deps = Object.entries(info.dependencies);
  const devDeps = Object.entries(info.devDependencies);

  // 扩展模式：outdated / audit（仅 package.json 项目）
  if (options.outdated || options.audit) {
    if (info.manifest !== "package.json") {
      fail("--outdated / --audit 目前仅支持 Node 项目（package.json）");
      return;
    }
    const result: Record<string, unknown> = { ok: true, manifest: info.manifest };

    if (options.outdated) {
      const { entries, error } = await npmOutdated(cwd);
      result.outdated = entries;
      if (error) result.outdatedError = error;
      if (!isJsonMode()) {
        if (error) warn(error);
        if (entries.length === 0 && !error) {
          say("✓ 所有依赖均为最新（npm outdated 无输出）");
        } else {
          console.log("\n过期依赖:");
          console.log("  包名".padEnd(28) + "当前".padEnd(14) + "期望".padEnd(14) + "最新");
          for (const e of entries) {
            console.log(
              `  ${e.name.padEnd(26)}${e.current.padEnd(12)}${e.wanted.padEnd(12)}${e.latest}`,
            );
          }
        }
      }
    }

    if (options.audit) {
      const { summary, error } = await npmAudit(cwd);
      result.audit = summary;
      if (error) result.auditError = error;
      if (!isJsonMode()) {
        if (error) warn(error);
        const s = summary;
        console.log(
          `\n安全审计: 共 ${s.total} 个漏洞（critical ${s.critical} / high ${s.high} / moderate ${s.moderate} / low ${s.low}）`,
        );
        for (const a of s.advisories.slice(0, 10)) {
          console.log(`  [${a.severity}] ${a.name}${a.title ? ` — ${a.title}` : ""}${a.range ? ` (${a.range})` : ""}`);
        }
        if (s.advisories.length > 10) say(`  ... 其余 ${s.advisories.length - 10} 项省略`);
      }
      // 有 high/critical 漏洞时退出码非 0（CI 门禁）
      if (!isJsonMode() && (summary.critical > 0 || summary.high > 0)) {
        warn("存在高危漏洞，建议尽快升级（npm audit fix）");
      }
    }

    if (isJsonMode()) {
      emitJson(result);
      return;
    }
    done("依赖检查完成");
    return;
  }

  if (isJsonMode()) {
    emitJson({
      ok: true,
      manifest: info.manifest,
      dependencies: info.dependencies,
      devDependencies: info.devDependencies,
      total: deps.length + devDeps.length,
    });
    return;
  }

  console.log(`清单: ${info.manifest}（deps ${deps.length} + devDeps ${devDeps.length}）\n`);
  if (deps.length > 0) {
    console.log("dependencies:");
    for (const [name, ver] of deps) console.log(`  ${name} ${ver}`);
    console.log("");
  }
  if (devDeps.length > 0) {
    console.log("devDependencies:");
    for (const [name, ver] of devDeps) console.log(`  ${name} ${ver}`);
  }
  done("依赖读取完成（--outdated 检查升级 / --audit 安全审计）");
}
