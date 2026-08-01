import { describe, it, expect, vi, afterEach } from "vitest";
import { chatCompletion, LLMError } from "../src/lib/llm.js";

const ORIGINAL_KEY = process.env.DEEPSEEK_API_KEY;

function mockFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = ORIGINAL_KEY;
});

describe("chatCompletion", () => {
  it("无 API key 时报友好错误", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    await expect(chatCompletion([{ role: "user", content: "hi" }])).rejects.toThrow(
      LLMError,
    );
    await expect(
      chatCompletion([{ role: "user", content: "hi" }]),
    ).rejects.toThrow(/DEEPSEEK_API_KEY/);
  });

  it("成功返回 content", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    mockFetch(async () =>
      jsonResponse(200, {
        choices: [{ message: { content: "生成的 README" } }],
      }),
    );
    const out = await chatCompletion(
      [{ role: "user", content: "hi" }],
      { apiKey: "sk-test" },
    );
    expect(out).toBe("生成的 README");
  });

  it("429 后重试成功", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    let calls = 0;
    mockFetch(async () => {
      calls++;
      if (calls === 1) return jsonResponse(429, { error: { message: "slow" } });
      return jsonResponse(200, {
        choices: [{ message: { content: "ok" } }],
      });
    });
    const out = await chatCompletion(
      [{ role: "user", content: "hi" }],
      { apiKey: "sk-test", maxRetries: 2 },
    );
    expect(out).toBe("ok");
    expect(calls).toBe(2);
  });

  it("重试耗尽后抛 rate-limit", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    mockFetch(async () => jsonResponse(429, { error: { message: "slow" } }));
    await expect(
      chatCompletion([{ role: "user", content: "hi" }], {
        apiKey: "sk-test",
        maxRetries: 1,
      }),
    ).rejects.toMatchObject({ kind: "rate-limit" });
  });

  it("401 直接抛 http-error 不重试", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    let calls = 0;
    mockFetch(async () => {
      calls++;
      return jsonResponse(401, { error: { message: "invalid key" } });
    });
    await expect(
      chatCompletion([{ role: "user", content: "hi" }], {
        apiKey: "sk-test",
        maxRetries: 3,
      }),
    ).rejects.toMatchObject({ kind: "http-error" });
    expect(calls).toBe(1);
  });

  it("空响应抛 empty-response", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    mockFetch(async () =>
      jsonResponse(200, { choices: [{ message: { content: "  " } }] }),
    );
    await expect(
      chatCompletion([{ role: "user", content: "hi" }], {
        apiKey: "sk-test",
        maxRetries: 0,
      }),
    ).rejects.toMatchObject({ kind: "empty-response" });
  });

  it("500 重试后成功", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    let calls = 0;
    mockFetch(async () => {
      calls++;
      if (calls === 1) return jsonResponse(500, {});
      return jsonResponse(200, {
        choices: [{ message: { content: "recovered" } }],
      });
    });
    const out = await chatCompletion(
      [{ role: "user", content: "hi" }],
      { apiKey: "sk-test", maxRetries: 2 },
    );
    expect(out).toBe("recovered");
  });
});
