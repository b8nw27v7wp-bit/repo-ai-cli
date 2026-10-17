import { promises as fs } from "node:fs";
import { Command, InvalidArgumentError, Option } from "commander";
import { fail, warn } from "./ui.js";

/**
 * CLI 参数解析与校验（各命令共用）。
 * - commander 解析器（index.ts 用）：非法输入直接报 usage 错误，不会产生 NaN 透传
 * - 命令内枚举校验（runX 用）：非法时走 fail()（JSON 感知），返回 null 表示已报错、调用方直接 return
 * - 文件读取截断：按行边界截断，避免切断 UTF-8 字符与代码行
 */

/** commander 解析器：正整数（min 默认为 1） */
export function intOption(min = 1): (v: string) => number {
  return (v: string) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min) {
      throw new InvalidArgumentError(`必须是 >= ${min} 的整数，收到: ${v}`);
    }
    return n;
  };
}

/** commander 解析器：采样 temperature 0~2 */
export function temperatureOption(): (v: string) => number {
  return (v: string) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 2) {
      throw new InvalidArgumentError(`必须是 0~2 的数字，收到: ${v}`);
    }
    return n;
  };
}

/** commander 解析器：YYYY-MM-DD 日期（校验真实日历日，如 2026-02-30 非法） */
export function dateOption(): (v: string) => string {
  return (v: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) {
      throw new InvalidArgumentError(`必须是 YYYY-MM-DD 格式的日期，收到: ${v}`);
    }
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (
      d.getUTCFullYear() !== year ||
      d.getUTCMonth() !== month - 1 ||
      d.getUTCDate() !== day
    ) {
      throw new InvalidArgumentError(`不是真实存在的日期，收到: ${v}`);
    }
    return v;
  };
}

/**
 * 已废弃的参数名 → 现用名（camelCase，与 commander 的 opts() 键一致）。
 *
 * v0.8 统一了「给 LLM 的材料预算」这套命名：同一类语义此前有四种写法
 * （--max-tokens / --max / --max-diff-kb / --max-file-kb），换一条命令含义就变。
 * 只改语义最含混的两个；--max-diff-kb 与 --max-file-kb 本身就表意清楚，保持不动。
 *
 * 旧名保留为隐藏别名（--help 不显示），命中时打一行警告，计划在下个 major 移除。
 */
export const DEPRECATED_ALIASES: Record<string, string> = {
  maxTokens: "budgetTokens",
  max: "maxCommits",
};

/** camelCase → kebab-case（用于拼出参数名给用户看） */
function toKebab(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/**
 * 构造隐藏的废弃别名选项：接受旧名但不进 --help，避免新用户学到已废弃的写法。
 * @param flags 旧参数写法，如 "--max-tokens <n>"
 * @param replacement 现用参数名（kebab），如 "budget-tokens"
 */
export function deprecatedOption(
  flags: string,
  replacement: string,
  parser: (v: string) => number,
): Option {
  return new Option(flags, `[已废弃] 请改用 --${replacement}`)
    .argParser(parser)
    .hideHelp();
}

/**
 * 把废弃参数的值搬到现用参数上，并打一行 deprecation 警告。
 *
 * 挂在 program 的 preAction 钩子里，让 4 条命令共用同一套迁移逻辑，而不是各写一遍。
 *
 * 警告刻意走 stderr 且不因 --json 静默：preAction 早于命令内的 setJsonMode，
 * 此时 jsonMode 还是 false，所以 JSON 模式下也会打印——这是想要的，
 * stdout 仍然只有产物，而需要迁移的 CI 用户不该被蒙在鼓里。
 */
export function applyDeprecatedAliases(cmd: Command): void {
  for (const [oldKey, newKey] of Object.entries(DEPRECATED_ALIASES)) {
    if (cmd.getOptionValueSource(oldKey) !== "cli") continue;
    warn(
      `--${toKebab(oldKey)} 已废弃，请改用 --${toKebab(newKey)}（旧名将在下个 major 版本移除）`,
    );
    // 新旧同时显式给出时以新名为准，不覆盖用户明确写的那个
    if (cmd.getOptionValueSource(newKey) !== "cli") {
      // 必须用 setOptionValueWithSource 而不是 setOptionValue：后者把来源记成
      // undefined，而 cli/shared.ts 的 resolveNumber 只在来源为 "cli" 时才认 CLI 值——
      // 用错就会让 `--max-tokens 5000` 配上 `config set maxTokens 8000` 静默用 8000，
      // 把用户显式传的值悄悄丢掉
      cmd.setOptionValueWithSource(newKey, cmd.opts()[oldKey], "cli");
    }
  }
}

/** 命令内枚举校验；合法返回取值，非法 fail() 后返回 null */
export function parseEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  name: string,
  fallback: T,
): T | null {
  if (value === undefined) return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  fail(`未知 ${name}: ${value}。可用: ${allowed.join("/")}`);
  return null;
}

export interface CappedText {
  content: string;
  truncated: boolean;
}

/** 读取 UTF-8 文本并按字节预算截断（在行边界处截断，最多保留 maxBytes 字节） */
export async function readTextCapped(
  abs: string,
  maxBytes: number,
): Promise<CappedText> {
  const raw = await fs.readFile(abs, "utf8");
  if (Buffer.byteLength(raw, "utf8") <= maxBytes) {
    return { content: raw, truncated: false };
  }
  const text = Buffer.from(raw, "utf8").subarray(0, maxBytes).toString("utf8");
  const nl = text.lastIndexOf("\n");
  return {
    content: nl > 0 ? text.slice(0, nl) : text,
    truncated: true,
  };
}
