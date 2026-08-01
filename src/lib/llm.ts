import type { ChatMessage, LLMConfig } from "../types.js";
import { resolveLLMConfig, type ResolveInput } from "./providers.js";

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | "no-api-key"
      | "timeout"
      | "rate-limit"
      | "server-error"
      | "empty-response"
      | "http-error"
      | "network",
  ) {
    super(message);
    this.name = "LLMError";
  }
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 调用任意 OpenAI 兼容 chat/completions API（DeepSeek / OpenAI / Kimi / GLM / 通义 / MiniMax / xAI / 硅基流动 / 自定义端点）。
 *
 * 配置解析顺序（见 providers.ts resolveLLMConfig）：
 * 1. CLI 显式参数（--provider / --base-url / --model）
 * 2. 自定义端点环境变量（LLM_BASE_URL + LLM_API_KEY）
 * 3. 提供商专用 key（DEEPSEEK_API_KEY、OPENAI_API_KEY ...）
 *
 * 错误处理：
 * - 无 key → 抛 no-api-key（带完整指引）
 * - 429/5xx/超时/空响应 → 指数退避重试
 * - 401/403 等其他 4xx → 直接抛 http-error
 */
export async function chatCompletion(
  messages: ChatMessage[],
  config: LLMConfig = {},
): Promise<string> {
  let resolved;
  try {
    resolved = resolveLLMConfig(config as ResolveInput);
  } catch (err) {
    throw new LLMError((err as Error).message, "no-api-key");
  }

  const baseUrl = resolved.baseUrl.replace(/\/$/, "");
  const model = resolved.model;
  const apiKey = resolved.apiKey;
  const timeoutMs = config.timeoutMs ?? 120_000;
  const maxRetries = config.maxRetries ?? 2;

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(2 ** attempt * 1000, 8_000);
      await sleep(backoff);
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let res: Response;
      try {
        res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.7,
            max_tokens: 8192,
          }),
          signal: controller.signal,
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          lastError = new LLMError(
            `请求超时（${timeoutMs / 1000}s）`,
            "timeout",
          );
          continue;
        }
        lastError = new LLMError(`网络错误: ${String(err)}`, "network");
        continue;
      } finally {
        clearTimeout(timer);
      }

      if (res.status === 401 || res.status === 403) {
        throw new LLMError(
          `API key 无效或被拒绝（HTTP ${res.status}）。请检查 ${resolved.providerName} 的 key。`,
          "http-error",
        );
      }
      if (RETRYABLE_STATUS.has(res.status)) {
        lastError = new LLMError(
          `服务端错误 HTTP ${res.status}（${resolved.providerName}）`,
          res.status === 429 ? "rate-limit" : "server-error",
        );
        continue;
      }
      if (!res.ok) {
        throw new LLMError(`HTTP ${res.status}: ${await safeText(res)}`, "http-error");
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };
      if (data.error?.message) {
        throw new LLMError(`API 返回错误: ${data.error.message}`, "http-error");
      }

      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) {
        lastError = new LLMError("API 返回空响应", "empty-response");
        continue;
      }
      return content;
    } catch (err) {
      if (err instanceof LLMError && err.kind !== "http-error") throw err;
      throw err;
    }
  }

  throw lastError ?? new LLMError("未知错误", "network");
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "<无法读取响应体>";
  }
}
