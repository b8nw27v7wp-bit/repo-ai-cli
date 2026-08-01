import type { ChatMessage, LLMConfig } from "../types.js";

export const DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_DEFAULT_MODEL = "deepseek-chat";

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
 * 调用 DeepSeek Chat Completions API。
 * - 无 API key → 抛 no-api-key
 * - 429/5xx/超时/空响应 → 重试（指数退避），耗尽后抛错
 * - 4xx 其他 → 直接抛 http-error（如 401 key 无效）
 */
export async function chatCompletion(
  messages: ChatMessage[],
  config: LLMConfig = {},
): Promise<string> {
  const apiKey = config.apiKey ?? process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new LLMError(
      "未检测到 DEEPSEEK_API_KEY。请设置环境变量，例如：\n" +
        "  export DEEPSEEK_API_KEY=sk-xxx   # macOS/Linux\n" +
        "  set DEEPSEEK_API_KEY=sk-xxx      # Windows (cmd)\n" +
        "  $env:DEEPSEEK_API_KEY=\"sk-xxx\"   # Windows (PowerShell)",
      "no-api-key",
    );
  }

  const baseUrl = (config.baseUrl ?? DEEPSEEK_DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = config.model ?? DEEPSEEK_DEFAULT_MODEL;
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
            max_tokens: 4096,
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
          `API key 无效或被拒绝（HTTP ${res.status}）。请检查 DEEPSEEK_API_KEY。`,
          "http-error",
        );
      }
      if (RETRYABLE_STATUS.has(res.status)) {
        lastError = new LLMError(
          `服务端错误 HTTP ${res.status}`,
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
      // 非重试性错误（401/403/其他 4xx）直接抛出
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
