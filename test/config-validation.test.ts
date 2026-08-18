import { describe, it, expect } from "vitest";
import { validateNumericValue } from "../src/commands/config.js";

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