import { promises as fs } from "node:fs";
import { InvalidArgumentError } from "commander";
import { fail } from "./ui.js";

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
