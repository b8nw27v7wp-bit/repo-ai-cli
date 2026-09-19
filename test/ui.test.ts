import { describe, it, expect, vi, afterEach } from "vitest";
import { say, done, warn, setJsonMode } from "../src/lib/ui.js";

afterEach(() => {
  vi.restoreAllMocks();
  setJsonMode(false);
  process.exitCode = 0;
});

describe("ui 输出约定", () => {
  it("非 JSON 模式：say/done 走 stderr（stdout 只留产物）", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = vi.spyOn(console, "log").mockImplementation(() => {});
    say("hi");
    done("ok");
    expect(err).toHaveBeenCalledTimes(2);
    expect(out).not.toHaveBeenCalled();
  });

  it("JSON 模式：say/done/warn 全部静默", () => {
    setJsonMode(true);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = vi.spyOn(console, "log").mockImplementation(() => {});
    say("hi");
    done("ok");
    warn("careful");
    expect(err).not.toHaveBeenCalled();
    expect(out).not.toHaveBeenCalled();
  });
});
