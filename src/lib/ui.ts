import { outro, spinner, log } from "@clack/prompts";

/**
 * 统一 UI 辅助：TTY 用 clack（spinner/outro/log.info），非 TTY / --json 降级为纯文本。
 * 所有命令共用一份实现，避免重复。
 */

/** 非 TTY（管道/CI）时 clack 的 spinner 会疯狂重绘，降级为普通日志 */
export const interactive = Boolean(process.stdout.isTTY);

/** JSON 输出模式（模块级状态，命令入口处 setJsonMode 设置） */
let jsonMode = false;

export function setJsonMode(v: boolean): void {
  jsonMode = v;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

export function emitJson(obj: Record<string, unknown>): void {
  console.log(JSON.stringify(obj));
}

/** 信息行：JSON 模式静默 */
export function say(msg: string): void {
  if (jsonMode) return;
  if (interactive) log.info(msg);
  else console.log(msg);
}

export function done(msg: string): void {
  if (jsonMode) return;
  if (interactive) outro(`✓ ${msg}`);
  else console.log(`✓ ${msg}`);
}

/** 失败：JSON 模式输出 {ok:false} 并设 exit code 1 */
export function fail(msg: string): void {
  if (jsonMode) {
    emitJson({ ok: false, error: msg });
    process.exitCode = 1;
    return;
  }
  if (interactive) outro(`✖ ${msg}`);
  else console.error(`✖ ${msg}`);
  process.exitCode = 1;
}

export interface Progress {
  update(next: string): void;
  stop(msg?: string): void;
}

/**
 * 进度提示：TTY + 非 JSON 模式用 clack spinner；
 * 否则打印静态行（不重复重绘，避免管道/CI 下刷屏）。
 */
export function progress(label: string): Progress {
  let current = label;
  if (interactive && !jsonMode) {
    const s = spinner();
    s.start(label);
    return {
      update(next: string) {
        current = next;
        s.start(next);
      },
      stop(msg?: string) {
        s.stop(msg ?? current);
      },
    };
  }
  if (!jsonMode) console.log(`... ${label}`);
  return {
    update(next: string) {
      current = next;
      if (!jsonMode) console.log(`... ${next}`);
    },
    stop(msg?: string) {
      // 无参 stop 不重复打印（update 已打过最新状态）
      if (msg && !jsonMode) console.log(`... ${msg}`);
    },
  };
}
