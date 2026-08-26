import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectChecks } from "../src/lib/doctor.js";
import { PROVIDERS } from "../src/lib/providers.js";
import { getConfigPath, CONFIG_DIR_NAME } from "../src/lib/config.js";

/**
 * 测试环境隔离：
 * - HOME/USERPROFILE 指向临时目录（Windows 读 USERPROFILE）
 * - 清空所有 provider key 与代理变量，避免读到宿主机真实配置
 */
const HOME_VARS = ["HOME", "USERPROFILE"] as const;
const PROXY_VARS = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "NO_PROXY", "no_proxy"];
const ALL_ENV_KEYS = [...PROVIDERS.map((p) => p.apiKeyEnv), "LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL", ...PROXY_VARS];
const envBackup: Record<string, string | undefined> = {};
let tmpHome: string;

beforeAll(async () => {
  for (const k of ALL_ENV_KEYS) {
    envBackup[k] = process.env[k];
    delete process.env[k];
  }
  for (const v of HOME_VARS) {
    envBackup[v] = process.env[v];
  }
  tmpHome = await mkdtemp(path.join(os.tmpdir(), "repo-ai-doctor-"));
  for (const v of HOME_VARS) {
    process.env[v] = tmpHome;
  }
});

afterAll(async () => {
  for (const [k, v] of Object.entries(envBackup)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await rm(tmpHome, { recursive: true, force: true });
});

/** 在临时 HOME 下写 ~/.repo-ai/config.json */
async function writeHomeConfig(text: string): Promise<void> {
  const dir = path.join(tmpHome, CONFIG_DIR_NAME);
  await mkdir(dir, { recursive: true });
  await writeFile(getConfigPath(), text, "utf8");
}

describe("collectChecks（正常环境）", () => {
  it("返回固定检查项：node/git/config/llm/proxy（无 activeProfile 时无 profile 项）", async () => {
    const checks = await collectChecks(process.cwd());
    expect(checks.map((c) => c.id)).toEqual(["node", "git", "config", "llm", "proxy"]);
  });

  it("每项都有非空 detail，status 合法", async () => {
    const checks = await collectChecks(process.cwd());
    for (const c of checks) {
      expect(c.detail.length).toBeGreaterThan(0);
      expect(["ok", "warn", "fail"]).toContain(c.status);
    }
  });

  it("Node 版本项为 ok（本仓库要求 ≥ 20）", async () => {
    const checks = await collectChecks(process.cwd());
    expect(checks.find((c) => c.id === "node")?.status).toBe("ok");
  });

  it("配置文件不存在时为 warn 且带修复建议，llm 为 fail", async () => {
    const checks = await collectChecks(process.cwd());
    const cfg = checks.find((c) => c.id === "config")!;
    expect(cfg.status).toBe("warn");
    expect(cfg.fix).toBeTruthy();
    const llm = checks.find((c) => c.id === "llm")!;
    expect(llm.status).toBe("fail");
    expect(llm.detail).toContain("未配置");
  });

  it("配置了合法 provider+key 时 llm 为 ok", async () => {
    await writeHomeConfig(JSON.stringify({ provider: "deepseek", apiKey: "sk-test-1234567890" }));
    const checks = await collectChecks(process.cwd());
    expect(checks.find((c) => c.id === "config")?.status).toBe("ok");
    expect(checks.find((c) => c.id === "llm")?.status).toBe("ok");
    expect(checks.find((c) => c.id === "llm")?.detail).toContain("DeepSeek: ✓");
  });
});

describe("collectChecks（坏配置）", () => {
  it("坏 JSON 配置文件报 fail 并带修复建议，不影响其余检查", async () => {
    await writeHomeConfig("{ broken json !!!");
    const checks = await collectChecks(process.cwd());
    const cfg = checks.find((c) => c.id === "config")!;
    expect(cfg.status).toBe("fail");
    expect(cfg.fix).toContain("config reset");
    // 其余检查照常执行
    expect(checks.find((c) => c.id === "node")).toBeDefined();
    expect(checks.find((c) => c.id === "proxy")).toBeDefined();
  });

  it("JSON 是数组而非对象时同样报 fail", async () => {
    await writeHomeConfig('["not","an","object"]');
    const checks = await collectChecks(process.cwd());
    expect(checks.find((c) => c.id === "config")?.status).toBe("fail");
  });

  it("activeProfile 指向不存在的 profile 时报 fail", async () => {
    await writeHomeConfig(JSON.stringify({ activeProfile: "ghost" }));
    const checks = await collectChecks(process.cwd());
    const profile = checks.find((c) => c.id === "profile");
    expect(profile?.status).toBe("fail");
    expect(profile?.detail).toContain("ghost");
  });

  it("activeProfile 存在时为 ok", async () => {
    await writeHomeConfig(
      JSON.stringify({ activeProfile: "work", profiles: { work: { provider: "openai", apiKey: "sk-test-1234567890" } } }),
    );
    const checks = await collectChecks(process.cwd());
    expect(checks.find((c) => c.id === "profile")?.status).toBe("ok");
  });
});

describe("collectChecks（key 状态矩阵）", () => {
  it("环境变量配好一家即 llm ok；未配置的 provider 在明细中显示未配置", async () => {
    await writeHomeConfig("{}");
    process.env.DEEPSEEK_API_KEY = "sk-test-1234567890";
    try {
      const checks = await collectChecks(process.cwd());
      const llm = checks.find((c) => c.id === "llm")!;
      expect(llm.status).toBe("ok");
      expect(llm.detail).toContain("DeepSeek: ✓");
      expect(llm.detail).toContain("OpenAI: 未配置");
    } finally {
      delete process.env.DEEPSEEK_API_KEY;
    }
  });

  it("key 前缀异常时报 warn（如 OPENAI_API_KEY 不以 sk- 开头）", async () => {
    await writeHomeConfig("{}");
    process.env.OPENAI_API_KEY = "not-a-real-key-format";
    try {
      const checks = await collectChecks(process.cwd());
      const llm = checks.find((c) => c.id === "llm")!;
      expect(llm.status).toBe("warn");
      expect(llm.detail).toContain("前缀异常");
      expect(llm.fix).toBeTruthy();
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it("Ollama 免 key 仅在显式 provider 时生效：默认展示为本地提示，不影响 fail 判定", async () => {
    await writeHomeConfig("{}");
    const checks = await collectChecks(process.cwd());
    const llm = checks.find((c) => c.id === "llm")!;
    expect(llm.status).toBe("fail");
    expect(llm.detail).toContain("Ollama (本地): 本地（无需 key，--provider ollama 启用）");
  });
});

describe("collectChecks（网络代理）", () => {
  it("设置代理变量时报告状态且不含修复建议", async () => {
    process.env.HTTPS_PROXY = "http://127.0.0.1:33210";
    try {
      const checks = await collectChecks(process.cwd());
      const proxy = checks.find((c) => c.id === "proxy")!;
      expect(proxy.status).toBe("ok");
      expect(proxy.detail).toContain("http://127.0.0.1:33210");
      expect(proxy.fix).toBeUndefined();
    } finally {
      delete process.env.HTTPS_PROXY;
    }
  });
});
