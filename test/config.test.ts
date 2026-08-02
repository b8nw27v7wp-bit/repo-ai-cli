import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  loadConfig,
  saveConfig,
  unsetConfig,
  resetConfig,
  maskSecret,
  getConfigPath,
} from "../src/lib/config.js";

// Windows 上 os.homedir() 读 USERPROFILE 而非 HOME，两个都要替换
const HOME_VARS = ["HOME", "USERPROFILE"] as const;
const envBackup: Record<string, string | undefined> = {};
let tmpHome: string;

beforeAll(async () => {
  tmpHome = await mkdtemp(path.join(os.tmpdir(), "repo-ai-cfg-"));
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

describe("config 读写", () => {
  it("无配置文件时返回空对象", async () => {
    const cfg = await loadConfig();
    expect(cfg).toEqual({});
  });

  it("saveConfig 写入并合并已有值", async () => {
    await saveConfig({ provider: "deepseek", apiKey: "sk-1234567890abcdef" });
    await saveConfig({ model: "deepseek-chat" });
    const cfg = await loadConfig();
    expect(cfg.provider).toBe("deepseek");
    expect(cfg.model).toBe("deepseek-chat");
    expect(cfg.apiKey).toBe("sk-1234567890abcdef");
  });

  it("文件写入到 ~/.repo-ai/config.json 且内容合法", async () => {
    const p = getConfigPath();
    const raw = await readFile(p, "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.provider).toBe("deepseek");
  });

  it("JSON 损坏时返回空对象不抛错", async () => {
    const p = getConfigPath();
    await writeFile(p, "{ broken json", "utf8");
    const cfg = await loadConfig();
    expect(cfg).toEqual({});
    // 恢复
    await saveConfig({ provider: "deepseek" });
  });

  it("unsetConfig 删除指定键", async () => {
    await saveConfig({ provider: "deepseek", model: "x", apiKey: "sk-y" });
    await unsetConfig("model");
    const cfg = await loadConfig();
    expect(cfg.model).toBeUndefined();
    expect(cfg.provider).toBe("deepseek");
    expect(cfg.apiKey).toBe("sk-y");
  });

  it("resetConfig 清空全部", async () => {
    await saveConfig({ provider: "deepseek", apiKey: "sk-z" });
    await resetConfig();
    const cfg = await loadConfig();
    expect(cfg).toEqual({});
  });

  it("数字字段保存后类型保持 number", async () => {
    await saveConfig({ maxTokens: 48000, temperature: 0.7 });
    const cfg = await loadConfig();
    expect(cfg.maxTokens).toBe(48000);
    expect(cfg.temperature).toBe(0.7);
  });
});

describe("maskSecret", () => {
  it("保留前4后4", () => {
    expect(maskSecret("sk-1234567890abcdef")).toBe("sk-1***********cdef");
  });

  it("短 key 全部打码", () => {
    expect(maskSecret("short")).toBe("****");
  });
});
