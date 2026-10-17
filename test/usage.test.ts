import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { chatCompletion, streamChatCompletion } from "../src/lib/llm.js";
import { formatUsageLine, getLastUsage, resetUsage, withUsage } from "../src/lib/usage.js";
import { setJsonMode } from "../src/lib/ui.js";
import { PROVIDERS } from "../src/lib/providers.js";

/**
 * token 用量可观测（P1-3）。
 *
 * 关键契约有两条：
 * 1. provider 没返回 usage 时要能区分「未知」与「0」——按量付费的用户看这两个数
 *    的决策完全不同，用 0 顶替等于骗人。
 * 2. 非 JSON 模式打 stderr、JSON 模式走输出字段，且绝不污染 stdout。
 */

const ALL_ENVS = [
  ...PROVIDERS.map((p) => p.apiKeyEnv),
  "LLM_API_KEY",
  "LLM_BASE_URL",
  "LLM_MODEL",
];
const ORIGINAL: Record<string, string | undefined> = {};
for (const env of ALL_ENVS) ORIGINAL[env] = process.env[env];

const MSG = [{ role: "user" as const, content: "hi" }];

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

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

beforeEach(() => {
  process.env.DEEPSEEK_API_KEY = "sk-test";
  resetUsage();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setJsonMode(false);
  resetUsage();
  for (const env of ALL_ENVS) {
    if (ORIGINAL[env] === undefined) delete process.env[env];
    else process.env[env] = ORIGINAL[env];
  }
});

describe("用量采集", () => {
  it("未调用过 LLM 时是 undefined（离线命令、--dry-run 走这条）", () => {
    expect(getLastUsage()).toBeUndefined();
    expect(formatUsageLine()).toBeUndefined();
    expect(withUsage({ ok: true })).toEqual({ ok: true });
  });

  it("成功调用后记录 prompt/completion/total", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          choices: [{ message: { content: "ok" } }],
          usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
        }),
      ),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    await chatCompletion(MSG, { apiKey: "sk-test" });

    expect(getLastUsage()).toEqual({
      promptTokens: 120,
      completionTokens: 30,
      totalTokens: 150,
    });
  });

  it("provider 没返回 usage 时记 null 而不是 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ choices: [{ message: { content: "ok" } }] })),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    await chatCompletion(MSG, { apiKey: "sk-test" });

    expect(getLastUsage()).toBeNull();
    expect(formatUsageLine()).toContain("未知");
    expect(withUsage({ ok: true })).toEqual({ ok: true, usage: null });
  });

  it("usage 只有部分字段时按实际有的报，不补 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          choices: [{ message: { content: "ok" } }],
          usage: { total_tokens: 42 },
        }),
      ),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    await chatCompletion(MSG, { apiKey: "sk-test" });

    expect(getLastUsage()).toEqual({ totalTokens: 42 });
    expect(formatUsageLine()).toBe("token 用量: 合计 42");
  });

  it("兼容 input/output_tokens 命名，并在缺 total 时自行相加", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          choices: [{ message: { content: "ok" } }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      ),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    await chatCompletion(MSG, { apiKey: "sk-test" });

    expect(getLastUsage()).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
  });

  it("usage 里全是无法识别的字段时记 null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          choices: [{ message: { content: "ok" } }],
          usage: { something_else: 7 },
        }),
      ),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    await chatCompletion(MSG, { apiKey: "sk-test" });

    expect(getLastUsage()).toBeNull();
  });

  it("流式模式从末帧取 usage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'data: {"choices":[{"delta":{"content":"he"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n',
          'data: {"choices":[],"usage":{"prompt_tokens":8,"completion_tokens":2,"total_tokens":10}}\n\n',
          "data: [DONE]\n\n",
        ]),
      ),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    await streamChatCompletion(MSG, { apiKey: "sk-test" });

    expect(getLastUsage()).toEqual({
      promptTokens: 8,
      completionTokens: 2,
      totalTokens: 10,
    });
  });

  it("流式模式没有 usage 帧时记 null（多数 provider 需显式请求才返回）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      ),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    await streamChatCompletion(MSG, { apiKey: "sk-test" });

    expect(getLastUsage()).toBeNull();
  });

  it("调用失败时不记用量（重试路径由 llm.test.ts 覆盖）", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 400 })));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(chatCompletion(MSG, { apiKey: "sk-test" })).rejects.toThrow();

    expect(getLastUsage()).toBeUndefined();
  });
});

describe("用量呈现", () => {
  it("非 JSON 模式打一行到 stderr，stdout 保持干净", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          choices: [{ message: { content: "ok" } }],
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
        }),
      ),
    );
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await chatCompletion(MSG, { apiKey: "sk-test" });

    expect(errSpy.mock.calls.map((c) => c.join(" ")).join("\n")).toContain(
      "token 用量: 输入 1 / 输出 2 / 合计 3",
    );
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("JSON 模式不打 stderr（用量改由输出对象的 usage 字段承载）", async () => {
    setJsonMode(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          choices: [{ message: { content: "ok" } }],
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
        }),
      ),
    );
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await chatCompletion(MSG, { apiKey: "sk-test" });

    expect(errSpy).not.toHaveBeenCalled();
    expect(withUsage({ ok: true })).toEqual({
      ok: true,
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });
  });
});
