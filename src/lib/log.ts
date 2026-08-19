/**
 * 全局调试日志（--verbose）。
 * 输出到 stderr，不污染 stdout 的正常输出与 --json 结果。
 */

let verboseEnabled = false;

export function setVerbose(v: boolean): void {
  verboseEnabled = v;
}

export function isVerbose(): boolean {
  return verboseEnabled;
}

/** 调试行：`[repo-ai HH:MM:SS.mmm] <msg>`，仅 --verbose 时输出到 stderr */
export function debug(msg: string): void {
  if (!verboseEnabled) return;
  const ts = new Date().toISOString().slice(11, 23);
  process.stderr.write(`[repo-ai ${ts}] ${msg}\n`);
}
