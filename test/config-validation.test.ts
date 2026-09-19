import { describe, it, expect, vi, afterEach } from "vitest";
import { validateNumericValue, runConfigSet } from "../src/commands/config.js";

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = 0;
});

describe("validateNumericValue", () => {
  it("temperature 校验 0~2 范围", () => {
    expect(validateNumericValue("temperature", "1.5")).toBeNull();
    expect(validateNumericValue("temperature", "0")).toBeNull();
    expect(validateNumericValue("temperature", "2")).toBeNull();
    expect(validateNumericValue("temperature", "3")).toContain("超出范围");
    expect(validateNumericValue("temperature", "-1")).toContain("超出范围");
  });

  it("整数项拒绝小数", () => {
    expect(validateNumericValue("maxTokens", "48000")).toBeNull();
    expect(validateNumericValue("maxTokens", "100.5")).toContain("整数");
  });

  it("正整数项拒绝 0 与负数", () => {
    expect(validateNumericValue("maxFileKb", "0")).toContain("超出范围");
    expect(validateNumericValue("maxDiffKb", "-5")).toContain("超出范围");
  });

  it("非数字时报错", () => {
    expect(validateNumericValue("maxTokens", "abc")).toContain("数字");
  });

  it("非数值键不校验数值", () => {
    expect(validateNumericValue("provider", "deepseek")).toBeNull();
  });
});

describe("runConfigSet provider 校验", () => {
  it("--json 下未知 provider 输出 JSON 错误且不保存", async () => {
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      out.push(a.map(String).join(" "));
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await runConfigSet("provider", "nope", { json: true });
    expect(process.exitCode).toBe(1);
    expect(err).not.toHaveBeenCalled();
    expect(out).toHaveLength(1);
    expect(JSON.parse(out[0]!)).toMatchObject({ ok: false });
  });
});