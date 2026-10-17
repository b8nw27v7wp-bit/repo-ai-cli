import type { TokenUsage } from "../types.js";

/**
 * 单次命令的 token 用量账本。
 *
 * 为什么是模块级状态：一个 CLI 进程只跑一条命令，所以「本进程内最后一次 LLM 调用的
 * 用量」就等于「这条命令的用量」——与 ui.ts 的 jsonMode 是同一类进程级状态。
 * 也正因如此，测试里每个用例都要 resetUsage()。
 *
 * 与 ui.ts 分开是为了断开 import 环：llm.ts 要用 isJsonMode（ui），ui 不该反向依赖 llm。
 */

/** 是否已经发生过 LLM 调用——用来区分「没调用」与「调用了但没返回用量」 */
let called = false;
let last: TokenUsage | null = null;

export function resetUsage(): void {
  called = false;
  last = null;
}

/** llm.ts 在每次拿到响应后调用；usage 缺失时传 null */
export function recordUsage(usage: TokenUsage | null): void {
  called = true;
  last = usage;
}

/**
 * 已发生的用量。
 * - `undefined`：这条命令根本没调用过 LLM（离线命令、--dry-run）
 * - `null`：调用过，但 provider 没返回 usage
 */
export function getLastUsage(): TokenUsage | null | undefined {
  return called ? last : undefined;
}

/** 供 JSON 输出用：没调用过就不加字段，调用过但没用量则显式给 null */
export function withUsage<T extends Record<string, unknown>>(obj: T): T {
  const usage = getLastUsage();
  return usage === undefined ? obj : { ...obj, usage };
}

/** 人类可读的用量行；没调用过返回 undefined */
export function formatUsageLine(): string | undefined {
  const usage = getLastUsage();
  if (usage === undefined) return undefined;
  if (usage === null) {
    return "token 用量: 未知（该提供商或流式模式未返回 usage）";
  }
  const parts: string[] = [];
  if (usage.promptTokens !== undefined) parts.push(`输入 ${usage.promptTokens}`);
  if (usage.completionTokens !== undefined) parts.push(`输出 ${usage.completionTokens}`);
  if (usage.totalTokens !== undefined) parts.push(`合计 ${usage.totalTokens}`);
  if (parts.length === 0) return "token 用量: 未知（返回的 usage 不含可识别字段）";
  return `token 用量: ${parts.join(" / ")}`;
}
