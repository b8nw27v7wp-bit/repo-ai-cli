import { describe, it, expect, vi, afterEach } from "vitest";
import { streamChatCompletion } from "../src/lib/llm.js";
import { PROVIDERS } from "../src/lib/providers.js";

const ALL_ENVS = [
  ...PROVIDERS.map((p) => p.apiKeyEnv),
  "LLM_API_KEY",
  "LLM_BASE_URL",
  "LLM_MODEL",
];
const ORIGINAL: Record<string, string | undefined> = {};
for (const env of ALL_ENVS) ORIGINAL[env] = process.env[env];

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const env of ALL_ENVS) {
    if (ORIGINAL[env] === undefined) delete process.env[env];
    else process.env[env] = ORIGINAL[env];
  }
});

describe("streamChatCompletion", () => {
  it("累积 SSE delta 并逐 token 回调", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":", world"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      ),
    );
    const tokens: string[] = [];
    const out = await streamChatCompletion(
      [{ role: "user", content: "hi" }],
      { apiKey: "sk-test" },
      (t) => tokens.push(t),
    );
    expect(out).toBe("Hello, world");
    expect(tokens).toEqual(["Hello", ", world"]);
  });

  it("忽略 reasoning deltas 与空 payload", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'data: {"choices":[{"delta":{"reasoning_content":"thinking"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      ),
    );
    const out = await streamChatCompletion(
      [{ role: "user", content: "hi" }],
      { apiKey: "sk-test" },
    );
    expect(out).toBe("ok");
  });

  it("空响应抛 empty-response", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => sseResponse(["data: [DONE]\n\n"])),
    );
    await expect(
      streamChatCompletion([{ role: "user", content: "hi" }], {
        apiKey: "sk-test",
      }),
    ).rejects.toMatchObject({ kind: "empty-response" });
  });

  it("401 抛 http-error", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: "bad key" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(
      streamChatCompletion([{ role: "user", content: "hi" }], {
        apiKey: "sk-test",
      }),
    ).rejects.toMatchObject({ kind: "http-error" });
  });
});