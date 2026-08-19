import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  loadConfig,
  loadRawConfig,
  saveConfig,
  unsetConfig,
  setActiveProfile,
  removeProfile,
  listProfiles,
  assertValidProfileName,
  resetConfig,
  DEFAULT_PROFILE,
} from "../src/lib/config.js";

const HOME_VARS = ["HOME", "USERPROFILE"] as const;
const envBackup: Record<string, string | undefined> = {};
let tmpHome: string;

beforeAll(async () => {
  tmpHome = await mkdtemp(path.join(os.tmpdir(), "repo-ai-profile-"));
  for (const v of HOME_VARS) {
    envBackup[v] = process.env[v];
    process.env[v] = tmpHome;
  }
});
afterAll(async () => {
  for (const v of HOME_VARS) {
    if (envBackup[v] === undefined) delete process.env[v];
    else process.env[v] = envBackup[v];
  }
  await rm(tmpHome, { recursive: true, force: true });
});
afterEach(async () => {
  await resetConfig();
});

describe("profile 多配置", () => {
  it("saveConfig 指定 profile 时写入 profiles.<name>", async () => {
    await saveConfig({ provider: "openai", model: "gpt-4o" }, "work");
    const raw = await loadRawConfig();
    expect(raw.profiles?.work?.provider).toBe("openai");
    expect(raw.profiles?.work?.model).toBe("gpt-4o");
    // 顶层不受影响
    expect(raw.provider).toBeUndefined();
  });

  it("loadConfig(profile) 顶层字段被 profile 覆盖", async () => {
    await saveConfig({ provider: "deepseek", maxTokens: 48000 });
    await saveConfig({ provider: "qwen" }, "alt");
    const cfg = await loadConfig("alt");
    expect(cfg.provider).toBe("qwen"); // 被覆盖
    expect(cfg.maxTokens).toBe(48000); // 继承顶层
  });

  it("activeProfile 影响默认 loadConfig", async () => {
    await saveConfig({ provider: "deepseek" });
    await saveConfig({ provider: "moonshot" }, "fast");
    await setActiveProfile("fast");
    const cfg = await loadConfig();
    expect(cfg.provider).toBe("moonshot");
    // 显式 default 回退顶层
    const def = await loadConfig(DEFAULT_PROFILE);
    expect(def.provider).toBe("deepseek");
  });

  it("激活不存在的 profile 抛错", async () => {
    await expect(setActiveProfile("ghost")).rejects.toThrow(/不存在/);
  });

  it("切回 default 清除 activeProfile", async () => {
    await saveConfig({ provider: "openai" }, "x");
    await setActiveProfile("x");
    await setActiveProfile(DEFAULT_PROFILE);
    const raw = await loadRawConfig();
    expect(raw.activeProfile).toBeUndefined();
  });

  it("removeProfile 删除并取消激活", async () => {
    await saveConfig({ provider: "groq" }, "tmp");
    await setActiveProfile("tmp");
    await removeProfile("tmp");
    const raw = await loadRawConfig();
    expect(raw.profiles?.tmp).toBeUndefined();
    expect(raw.activeProfile).toBeUndefined();
  });

  it("不能删除 default", async () => {
    await expect(removeProfile(DEFAULT_PROFILE)).rejects.toThrow(/default/);
  });

  it("删除不存在的 profile 抛错", async () => {
    await expect(removeProfile("nope")).rejects.toThrow(/不存在/);
  });

  it("unsetConfig 支持 profile", async () => {
    await saveConfig({ provider: "openai", model: "m" }, "w");
    await unsetConfig("model", "w");
    const raw = await loadRawConfig();
    expect(raw.profiles?.w?.model).toBeUndefined();
    expect(raw.profiles?.w?.provider).toBe("openai");
  });

  it("unset 清空 profile 最后一项时自动删除空 profile", async () => {
    await saveConfig({ provider: "openai" }, "solo");
    await unsetConfig("provider", "solo");
    const raw = await loadRawConfig();
    expect(raw.profiles?.solo).toBeUndefined();
  });

  it("listProfiles 返回 default + 命名 profile 与激活状态", async () => {
    await saveConfig({ provider: "deepseek" });
    await saveConfig({ provider: "ollama" }, "local");
    await setActiveProfile("local");
    const { active, profiles } = await listProfiles();
    expect(active).toBe("local");
    expect(profiles.default?.provider).toBe("deepseek");
    expect(profiles.local?.provider).toBe("ollama");
  });

  it("非法 profile 名被拒绝", () => {
    expect(() => assertValidProfileName("../evil")).toThrow(/非法/);
    expect(() => assertValidProfileName("")).toThrow(/非法/);
    expect(() => assertValidProfileName("a".repeat(33))).toThrow(/非法/);
    expect(() => assertValidProfileName("work-1")).not.toThrow();
  });

  it("loadConfig 指定不存在的 profile 时静默回退顶层", async () => {
    await saveConfig({ provider: "deepseek" });
    const cfg = await loadConfig("missing");
    expect(cfg.provider).toBe("deepseek");
  });
});
