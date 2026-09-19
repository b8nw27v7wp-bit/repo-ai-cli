import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  intOption,
  temperatureOption,
  parseEnum,
  readTextCapped,
} from "../src/lib/options.js";
import { isJsonMode } from "../src/lib/ui.js";

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = 0;
});

describe("intOption", () => {
  it("接受正整数，拒绝 0/负数/小数/非数字", () => {
    expect(intOption()("5")).toBe(5);
    expect(() => intOption()("0")).toThrow();
    expect(() => intOption()("-3")).toThrow();
    expect(() => intOption()("1.5")).toThrow();
    expect(() => intOption()("abc")).toThrow();
  });
});

describe("temperatureOption", () => {
  it("接受 0~2，拒绝越界与非数字", () => {
    expect(temperatureOption()("0")).toBe(0);
    expect(temperatureOption()("2")).toBe(2);
    expect(temperatureOption()("0.7")).toBe(0.7);
    expect(() => temperatureOption()("2.5")).toThrow();
    expect(() => temperatureOption()("-0.1")).toThrow();
    expect(() => temperatureOption()("hot")).toThrow();
  });
});

describe("parseEnum", () => {
  it("缺省返回 fallback，合法返回取值", () => {
    expect(parseEnum(undefined, ["a", "b"] as const, "x", "a")).toBe("a");
    expect(parseEnum("b", ["a", "b"] as const, "x", "a")).toBe("b");
  });

  it("非法值 fail 并返回 null（JSON 感知）", () => {
    // 非 JSON 模式：走 console.error + exitCode 1
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(isJsonMode()).toBe(false);
    expect(parseEnum("c", ["a", "b"] as const, "x", "a")).toBeNull();
    expect(process.exitCode).toBe(1);
    expect(err).toHaveBeenCalled();
  });
});

describe("readTextCapped", () => {
  it("小文件原样返回且 truncated=false", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "repo-ai-opt-"));
    try {
      const p = path.join(dir, "a.txt");
      await writeFile(p, "line1\nline2\n", "utf8");
      const r = await readTextCapped(p, 1024);
      expect(r).toEqual({ content: "line1\nline2\n", truncated: false });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("超限时在行边界截断且 truncated=true", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "repo-ai-opt-"));
    try {
      const p = path.join(dir, "b.txt");
      await writeFile(p, "aaa\nbbb\nccc\nddd\n", "utf8");
      const r = await readTextCapped(p, 8);
      expect(r.truncated).toBe(true);
      // 8 字节预算内保留完整行 "aaa\nbbb"（7 字节），"ccc" 起被切掉
      expect(r.content).toBe("aaa\nbbb");
      expect(Buffer.byteLength(r.content, "utf8")).toBeLessThanOrEqual(8);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("不存在的文件直接抛错（由调用方 fail）", async () => {
    await expect(readTextCapped("/no/such/file-xyz.txt", 100)).rejects.toThrow();
  });
});
