import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { debug } from "./log.js";

const pexecFile = promisify(execFile);

/**
 * 运行 npm 子命令。Windows 上 npm 是 .cmd，execFile 直接调用会 EINVAL；
 * 走 cmd.exe /c 而非 shell:true（后者会触发 DEP0190 且参数不转义有注入风险）。
 */
async function runNpm(
  args: string[],
  cwd: string,
  maxBuffer: number,
): Promise<{ stdout: string; stderr: string }> {
  const isWin = process.platform === "win32";
  const cmd = isWin ? "cmd.exe" : "npm";
  const argv = isWin ? ["/d", "/s", "/c", "npm", ...args] : args;
  return pexecFile(cmd, argv, { cwd, windowsHide: true, maxBuffer });
}

export interface OutdatedEntry {
  name: string;
  current: string;
  wanted: string;
  latest: string;
  location: string;
}

/**
 * 封装 `npm outdated --json`（npm 在有过期依赖时退出码 1，属于正常情况）。
 * 需要项目已安装依赖（node_modules），否则结果为空并附提示。
 */
export async function npmOutdated(cwd: string): Promise<{
  entries: OutdatedEntry[];
  error?: string;
}> {
  try {
    const { stdout } = await runNpm(["outdated", "--json"], cwd, 10 * 1024 * 1024);
    return { entries: parseOutdated(stdout) };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    // npm outdated 有结果时退出码为 1
    if (e.code === 1 && typeof e.stdout === "string") {
      return { entries: parseOutdated(e.stdout) };
    }
    debug(`npm outdated 失败: ${String(e.stderr ?? err)}`);
    return { entries: [], error: `npm outdated 执行失败: ${String(e.stderr ?? e.code ?? err).slice(0, 200)}` };
  }
}

function parseOutdated(stdout: string): OutdatedEntry[] {
  return parseOutdatedJson(stdout);
}

/** 纯函数：解析 `npm outdated --json` 输出（导出供测试） */
export function parseOutdatedJson(stdout: string): OutdatedEntry[] {
  try {
    const json = JSON.parse(stdout) as Record<
      string,
      { current?: string; wanted?: string; latest?: string; location?: string }
    >;
    return Object.entries(json).map(([name, v]) => ({
      name,
      current: v.current ?? "?",
      wanted: v.wanted ?? "?",
      latest: v.latest ?? "?",
      location: v.location ?? "",
    }));
  } catch {
    return [];
  }
}

export interface AuditSummary {
  total: number;
  low: number;
  moderate: number;
  high: number;
  critical: number;
  advisories: Array<{
    name: string;
    severity: string;
    title: string;
    range: string;
  }>;
}

/** 封装 `npm audit --json`（有漏洞时退出码 1，属正常情况） */
export async function npmAudit(cwd: string): Promise<{
  summary: AuditSummary;
  error?: string;
}> {
  let stdout: string;
  try {
    const r = await runNpm(["audit", "--json"], cwd, 20 * 1024 * 1024);
    stdout = r.stdout;
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    if (typeof e.stdout === "string" && e.stdout.trim()) {
      stdout = e.stdout; // 有漏洞时 npm 退出码非 0 但 stdout 是完整 JSON
    } else {
      debug(`npm audit 失败: ${String(e.stderr ?? err)}`);
      return {
        summary: { total: 0, low: 0, moderate: 0, high: 0, critical: 0, advisories: [] },
        error: `npm audit 执行失败: ${String(e.stderr ?? e.code ?? err).slice(0, 200)}`,
      };
    }
  }

  try {
    return { summary: parseAuditJson(stdout) };
  } catch {
    return {
      summary: { total: 0, low: 0, moderate: 0, high: 0, critical: 0, advisories: [] },
      error: "npm audit 输出无法解析",
    };
  }
}

/** 纯函数：解析 `npm audit --json` 输出为摘要（导出供测试）；无法解析时抛错 */
export function parseAuditJson(stdout: string): AuditSummary {
  const json = JSON.parse(stdout) as {
    metadata?: { vulnerabilities?: Record<string, number> };
    vulnerabilities?: Record<
      string,
      { severity?: string; range?: string; via?: Array<string | { title?: string }> }
    >;
  };
  const vul = json.metadata?.vulnerabilities ?? {};
  const advisories: AuditSummary["advisories"] = [];
  for (const [name, v] of Object.entries(json.vulnerabilities ?? {})) {
    const title =
      v.via?.find((x): x is { title?: string } => typeof x === "object")?.title ??
      "";
    advisories.push({
      name,
      severity: v.severity ?? "unknown",
      title,
      range: v.range ?? "",
    });
  }
  // 高危排前面
  const order = { critical: 0, high: 1, moderate: 2, low: 3, unknown: 4 } as Record<string, number>;
  advisories.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
  return {
    total: Object.keys(json.vulnerabilities ?? {}).length,
    low: vul.low ?? 0,
    moderate: vul.moderate ?? 0,
    high: vul.high ?? 0,
    critical: vul.critical ?? 0,
    advisories,
  };
}
