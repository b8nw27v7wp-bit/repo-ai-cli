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

interface RequestSpec {
  url: string;
  headers: Record<string, string>;
  body: string;
  providerName: string;
}

/** 组装 chat/completions 请求（含解析配置）。provider 缺失/key 缺失时抛错。 */
function buildRequest(
  messages: ChatMessage[],
  config: LLMConfig,
  stream = false,
): RequestSpec {
  const resolved = resolveLLMConfig(config as ResolveInput);
  const baseUrl = resolved.baseUrl.replace(/\/$/, "");
  return {
    url: `${baseUrl}/chat/completions`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resolved.apiKey}`,
    },
    body: JSON.stringify({
      model: resolved.model,
      messages,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? 4096,
      ...(stream ? { stream: true } : {}),
    }),
    providerName: resolved.providerName,
  };
}

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
  let spec: RequestSpec;
  try {
    spec = buildRequest(messages, config);
  } catch (err) {
    throw new LLMError((err as Error).message, "no-api-key");
  }

  const timeoutMs = config.timeoutMs ?? 120_000;
  const maxRetries = config.maxRetries ?? 2;

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(2 ** attempt * 1000, 8_000);
      await sleep(backoff);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(spec.url, {
        method: "POST",
        headers: spec.headers,
        body: spec.body,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        lastError = new LLMError(`请求超时（${timeoutMs / 1000}s）`, "timeout");
        continue;
      }
      lastError = new LLMError(`网络错误: ${String(err)}`, "network");
      continue;
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 || res.status === 403) {
      throw new LLMError(
        `API key 无效或被拒绝（HTTP ${res.status}）。请检查 ${spec.providerName} 的 key。`,
        "http-error",
      );
    }
    if (RETRYABLE_STATUS.has(res.status)) {
      lastError = new LLMError(
        `服务端错误 HTTP ${res.status}（${spec.providerName}）`,
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
  }

  // 不可达：for 循环内所有退出路径都有 throw/continue，这里仅作类型收窄防御
  throw lastError ?? new LLMError("未知错误", "network");
}

/**
 * 流式调用 chat/completions（stream: true），解析 SSE 增量并把每个 token 交给 onToken。
 * 返回拼接后的完整内容。
 *
 * 与 chatCompletion 的区别：不做重试（流式难以安全重放），错误就地抛出。
 */
export async function streamChatCompletion(
  messages: ChatMessage[],
  config: LLMConfig = {},
  onToken?: (token: string) => void,
): Promise<string> {
  let spec: RequestSpec;
  try {
    spec = buildRequest(messages, config, true);
  } catch (err) {
    throw new LLMError((err as Error).message, "no-api-key");
  }

  const timeoutMs = config.timeoutMs ?? 120_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(spec.url, {
      method: "POST",
      headers: spec.headers,
      body: spec.body,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new LLMError(`请求超时（${timeoutMs / 1000}s）`, "timeout");
    }
    throw new LLMError(`网络错误: ${String(err)}`, "network");
  }

  if (res.status === 401 || res.status === 403) {
    clearTimeout(timer);
    throw new LLMError(
      `API key 无效或被拒绝（HTTP ${res.status}）。请检查 ${spec.providerName} 的 key。`,
      "http-error",
    );
  }
  if (!res.ok) {
    clearTimeout(timer);
    throw new LLMError(`HTTP ${res.status}: ${await safeText(res)}`, "http-error");
  }

  const reader = res.body?.getReader();
  if (!reader) {
    clearTimeout(timer);
    throw new LLMError("流式响应不可读", "empty-response");
  }

  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        let json: { choices?: Array<{ delta?: { content?: string } }> };
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }
        const delta = json.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          full += delta;
          onToken?.(delta);
        }
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new LLMError(`请求超时（${timeoutMs / 1000}s）`, "timeout");
    }
    throw new LLMError(`流式读取中断: ${String(err)}`, "network");
  } finally {
    clearTimeout(timer);
  }

  if (!full.trim()) {
    throw new LLMError("API 返回空响应", "empty-response");
  }
  return full;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "<无法读取响应体>";
  }
}

/**
 * 从命令 options 构造 LLMConfig（命令共用的映射：maxOutputTokens → maxTokens）。
 * config 为 ~/.repo-ai/config.json 的持久化配置（优先级低于 env，见 providers.ts）。
 */
export function llmConfigFromOptions(
  options: {
    provider?: string;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
    maxOutputTokens?: number;
    temperature?: number;
  },
  config: LLMConfig["config"],
): LLMConfig {
  return {
    provider: options.provider,
    baseUrl: options.baseUrl,
    model: options.model,
    apiKey: options.apiKey,
    maxTokens: options.maxOutputTokens,
    temperature: options.temperature,
    config,
  };
}