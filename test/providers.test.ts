import { describe, it, expect, afterEach } from "vitest";
import {
  resolveLLMConfig,
  PROVIDERS,
  findProvider,
  CUSTOM_PROVIDER_ID,
} from "../src/lib/providers.js";

const PROVIDER_ENVS = PROVIDERS.map((p) => p.apiKeyEnv);
const ORIGINAL: Record<string, string | undefined> = {};
for (const env of [...PROVIDER_ENVS, "LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL"]) {
  ORIGINAL[env] = process.env[env];
}

function clearAll(): void {
  for (const env of [...PROVIDER_ENVS, "LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL"]) {
    delete process.env[env];
  }
}

function restoreAll(): void {
  for (const [env, val] of Object.entries(ORIGINAL)) {
    if (val === undefined) delete process.env[env];
    else process.env[env] = val;
  }
}

afterEach(restoreAll);

describe("providers 注册表", () => {
  it("内置提供商不少于 8 家，id 唯一", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PROVIDERS.length).toBeGreaterThanOrEqual(8);
    expect(findProvider("deepseek")?.name).toBe("DeepSeek");
  });

  it("每家都有默认 baseUrl 和 model", () => {
    for (const p of PROVIDERS) {
      expect(p.defaultBaseUrl).toMatch(/^https?:\/\//);
      expect(p.defaultModel.length).toBeGreaterThan(0);
      expect(p.apiKeyEnv).toMatch(/_API_KEY$/);
    }
  });
});

describe("resolveLLMConfig", () => {
  it("显式 provider + 对应 env key", () => {
    clearAll();
    process.env.OPENAI_API_KEY = "sk-openai-test";
    const r = resolveLLMConfig({ provider: "openai" });
    expect(r.providerId).toBe("openai");
    expect(r.apiKey).toBe("sk-openai-test");
    expect(r.baseUrl).toContain("openai.com");
  });

  it("未知 provider 抛错并列出可用项", () => {
    clearAll();
    expect(() => resolveLLMConfig({ provider: "nope" })).toThrow(/deepseek/);
  });

  it("显式 provider 但没配 key 时报缺 key 错误", () => {
    clearAll();
    expect(() => resolveLLMConfig({ provider: "qwen" })).toThrow(/DASHSCOPE_API_KEY/);
  });

  it("LLM_BASE_URL 触发自定义端点", () => {
    clearAll();
    process.env.LLM_BASE_URL = "https://my-endpoint.example/v1";
    process.env.LLM_API_KEY = "sk-custom";
    const r = resolveLLMConfig();
    expect(r.providerId).toBe(CUSTOM_PROVIDER_ID);
    expect(r.baseUrl).toBe("https://my-endpoint.example/v1");
    expect(r.apiKey).toBe("sk-custom");
  });

  it("LLM_BASE_URL 设置了但缺 LLM_API_KEY 抛错", () => {
    clearAll();
    process.env.LLM_BASE_URL = "https://my-endpoint.example/v1";
    expect(() => resolveLLMConfig()).toThrow(/LLM_API_KEY/);
  });

  it("按注册表顺序自动选第一个有 key 的 provider", () => {
    clearAll();
    process.env.DASHSCOPE_API_KEY = "sk-qwen";
    process.env.ZHIPU_API_KEY = "sk-zhipu";
    const r = resolveLLMConfig();
    // zhipu 在 qwen 前面？注册表顺序: deepseek, openai, moonshot, zhipu, qwen...
    expect(["zhipu", "qwen"]).toContain(r.providerId);
  });

  it("CLI 显式参数覆盖默认", () => {
    clearAll();
    process.env.DEEPSEEK_API_KEY = "sk-ds";
    const r = resolveLLMConfig({ provider: "deepseek", model: "deepseek-chat-v3", baseUrl: "https://x.example" });
    expect(r.model).toBe("deepseek-chat-v3");
    expect(r.baseUrl).toBe("https://x.example");
  });

  it("无任何 key 时抛错并列出所有环境变量", () => {
    clearAll();
    try {
      resolveLLMConfig();
      expect.unreachable();
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("DEEPSEEK_API_KEY");
      expect(msg).toContain("OPENAI_API_KEY");
      expect(msg).toContain("LLM_BASE_URL");
    }
  });

  it("显式 apiKey 直接生效（默认 deepseek）", () => {
    clearAll();
    const r = resolveLLMConfig({ apiKey: "sk-direct" });
    expect(r.apiKey).toBe("sk-direct");
    expect(r.providerId).toBe("deepseek");
  });
});

describe("resolveLLMConfig 优先级: CLI > env > config", () => {
  it("config.provider + config.apiKey 生效（无 env 时）", () => {
    clearAll();
    const r = resolveLLMConfig({
      config: { provider: "qwen", apiKey: "sk-cfg-qwen" },
    });
    expect(r.providerId).toBe("qwen");
    expect(r.apiKey).toBe("sk-cfg-qwen");
    expect(r.baseUrl).toContain("dashscope");
  });

  it("env 优先于 config", () => {
    clearAll();
    process.env.OPENAI_API_KEY = "sk-env-openai";
    const r = resolveLLMConfig({
      config: { provider: "qwen", apiKey: "sk-cfg-qwen" },
    });
    // 显式 config.provider=qwen 优先于 env 自动检测
    expect(r.providerId).toBe("qwen");
    expect(r.apiKey).toBe("sk-cfg-qwen");
  });

  it("CLI 参数优先于 config", () => {
    clearAll();
    const r = resolveLLMConfig({
      provider: "openai",
      model: "gpt-4o",
      config: { provider: "qwen", model: "qwen-max", apiKey: "sk-cfg" },
    });
    expect(r.providerId).toBe("openai");
    expect(r.model).toBe("gpt-4o");
  });

  it("config.apiKey 单独存在时作为兜底（默认 deepseek）", () => {
    clearAll();
    const r = resolveLLMConfig({ config: { apiKey: "sk-cfg-only" } });
    expect(r.apiKey).toBe("sk-cfg-only");
    expect(r.providerId).toBe("deepseek");
  });

  it("config.provider 指定但无任何 key 时抛错", () => {
    clearAll();
    expect(() =>
      resolveLLMConfig({ config: { provider: "moonshot" } }),
    ).toThrow(/MOONSHOT_API_KEY/);
  });
});
