import { describe, it, expect } from "vitest";
import { PROVIDERS, resolveLLMConfig, findProvider } from "../src/lib/providers.js";

const ALL_ENVS = [
  ...PROVIDERS.map((p) => p.apiKeyEnv),
  "LLM_API_KEY",
  "LLM_BASE_URL",
  "LLM_MODEL",
];
const ORIGINAL: Record<string, string | undefined> = {};
for (const env of ALL_ENVS) ORIGINAL[env] = process.env[env];

function clearAll(): void {
  for (const env of ALL_ENVS) delete process.env[env];
}
function restoreAll(): void {
  for (const [env, val] of Object.entries(ORIGINAL)) {
    if (val === undefined) delete process.env[env];
    else process.env[env] = val;
  }
}

describe("v0.6.0 提供商扩展", () => {
  it("内置提供商扩到 13 家，id 唯一", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PROVIDERS.length).toBe(13);
    for (const id of ["ollama", "openrouter", "groq", "volcengine", "gemini"]) {
      expect(findProvider(id)).toBeDefined();
    }
  });

  it("Ollama 无 key 也能解析（本地部署）", () => {
    clearAll();
    try {
      const r = resolveLLMConfig({ provider: "ollama" });
      expect(r.providerId).toBe("ollama");
      expect(r.baseUrl).toContain("127.0.0.1:11434");
      expect(r.apiKey.length).toBeGreaterThan(0); // 占位符
    } finally {
      restoreAll();
    }
  });

  it("Ollama 可通过 --model 指定本地模型", () => {
    clearAll();
    try {
      const r = resolveLLMConfig({ provider: "ollama", model: "qwen2.5:14b" });
      expect(r.model).toBe("qwen2.5:14b");
    } finally {
      restoreAll();
    }
  });

  it("其余新提供商缺 key 时报错指引", () => {
    clearAll();
    try {
      expect(() => resolveLLMConfig({ provider: "groq" })).toThrow(/GROQ_API_KEY/);
      expect(() => resolveLLMConfig({ provider: "openrouter" })).toThrow(/OPENROUTER_API_KEY/);
      expect(() => resolveLLMConfig({ provider: "volcengine" })).toThrow(/VOLCENGINE_API_KEY/);
      expect(() => resolveLLMConfig({ provider: "gemini" })).toThrow(/GEMINI_API_KEY/);
    } finally {
      restoreAll();
    }
  });

  it("非 optional 提供商仍强制要 key（回归保护）", () => {
    clearAll();
    try {
      expect(() => resolveLLMConfig({ provider: "deepseek" })).toThrow(/DEEPSEEK_API_KEY/);
    } finally {
      restoreAll();
    }
  });
});
