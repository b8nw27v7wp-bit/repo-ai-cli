import { describe, it, expect, vi, afterEach } from "vitest";
import { setVerbose, isVerbose, debug } from "../src/lib/log.js";

afterEach(() => {
  setVerbose(false);
  vi.restoreAllMocks();
});

describe("verbose 调试日志", () => {
  it("默认关闭，debug 不输出", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    debug("secret message");
    expect(spy).not.toHaveBeenCalled();
    expect(isVerbose()).toBe(false);
  });

  it("setVerbose(true) 后 debug 输出到 stderr 且带时间戳前缀", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setVerbose(true);
    debug("hello debug");
    expect(spy).toHaveBeenCalledTimes(1);
    const line = (spy.mock.calls[0] ?? [""])[0] as string;
    expect(line).toContain("[repo-ai ");
    expect(line).toContain("hello debug");
    expect(line.endsWith("\n")).toBe(true);
  });

  it("debug 输出不含敏感字段泄露检查（只打印传入内容）", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setVerbose(true);
    debug("url=https://example.com");
    expect((spy.mock.calls[0] ?? [""])[0]).toContain("url=https://example.com");
  });
});
