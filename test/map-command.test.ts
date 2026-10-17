import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runMap } from "../src/commands/map.js";
import type { MapOptions } from "../src/types.js";
import { captureStdio, soleJson } from "./helpers/command-harness.js";

const ORIGINAL_EXIT_CODE = process.exitCode;
const cleanup: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = ORIGINAL_EXIT_CODE;
  for (const dir of cleanup.splice(0)) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

async function makeProject(files: Record<string, string> = {}): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "repo-ai-map-"));
  cleanup.push(dir);
  const all = {
    "package.json": '{"name":"demo-map"}\n',
    "README.md": "# demo\n",
    "src/index.ts": "export const a = 1;\n",
    "src/lib/util.ts": "export const u = 1;\n",
    "src/lib/deep/nested.ts": "export const n = 1;\n",
    "test/a.test.ts": "export const t = 1;\n",
    ...files,
  };
  for (const [rel, content] of Object.entries(all)) {
    const full = path.join(dir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  return dir;
}

function baseOptions(dir: string, overrides: Partial<MapOptions> = {}): MapOptions {
  return { target: dir, depth: 3, json: true, ...overrides };
}

describe("map 命令: JSON 契约", () => {
  it("输出仓库规模、分组、入口与树，且 stdout 只有一行 JSON", async () => {
    const dir = await makeProject();
    const { stdout } = captureStdio();

    await runMap(baseOptions(dir));

    const body = soleJson<{
      ok: boolean;
      name: string;
      totals: { files: number; lines: number };
      groups: Array<{ name: string }>;
      entryPoints: string[];
      tree: string;
    }>(stdout);
    expect(body.ok).toBe(true);
    expect(body.name).toBe("demo-map");
    expect(body.totals.files).toBeGreaterThan(0);
    expect(body.groups.map((g) => g.name)).toContain("src");
    expect(body.entryPoints).toContain("src/index.ts");
    expect(body.tree).toContain("src/");
    expect(process.exitCode).not.toBe(1);
  });

  it("--depth 截断深层目录并标记 …", async () => {
    const dir = await makeProject();
    const { stdout } = captureStdio();

    await runMap(baseOptions(dir, { depth: 1 }));

    const body = soleJson<{ tree: string }>(stdout);
    expect(body.tree).toContain("…");
    expect(body.tree).not.toContain("nested.ts");
  });

  it("--focus 只保留子目录", async () => {
    const dir = await makeProject();
    const { stdout } = captureStdio();

    await runMap(baseOptions(dir, { focus: "src/lib" }));

    const body = soleJson<{
      focus: string;
      groups: Array<{ name: string }>;
      tree: string;
    }>(stdout);
    expect(body.focus).toBe("src/lib");
    expect(body.groups.map((g) => g.name)).toEqual(["src"]);
    expect(body.tree).not.toContain("README.md");
    expect(body.tree).toContain("util.ts");
  });

  it("--depth 0 只画根并标记", async () => {
    const dir = await makeProject();
    const { stdout } = captureStdio();

    await runMap(baseOptions(dir, { depth: 0 }));

    const body = soleJson<{ tree: string }>(stdout);
    expect(body.tree).toBe("demo-map …");
  });

  it("--focus 接受仓库内的绝对路径（Windows 反斜杠也要归一化）", async () => {
    const dir = await makeProject();
    const { stdout } = captureStdio();

    await runMap(baseOptions(dir, { focus: path.join(dir, "src", "lib") }));

    const body = soleJson<{ ok: boolean; focus: string; tree: string }>(stdout);
    expect(body.ok).toBe(true);
    expect(body.focus).toBe("src/lib");
    expect(body.tree).toContain("util.ts");
  });

  it("--focus 指向单个文件时只地图该文件", async () => {
    const dir = await makeProject();
    const { stdout } = captureStdio();

    await runMap(baseOptions(dir, { focus: "src/index.ts" }));

    const body = soleJson<{ tree: string; groups: Array<{ name: string }> }>(stdout);
    expect(body.groups.map((g) => g.name)).toEqual(["src"]);
    expect(body.tree).toContain("index.ts");
    expect(body.tree).not.toContain("util.ts");
  });

  it("Unicode 与空格文件名能进入地图", async () => {
    const dir = await makeProject({ "src/中文 文件.ts": "export const u = 1;\n" });
    const { stdout } = captureStdio();

    await runMap(baseOptions(dir));

    const body = soleJson<{ tree: string }>(stdout);
    expect(body.tree).toContain("中文 文件.ts");
  });

  it("敏感文件被排除且只报路径", async () => {
    const dir = await makeProject({ ".env": "TOKEN=abcdef1234567890\n" });
    const { stdout } = captureStdio();

    await runMap(baseOptions(dir));

    const body = soleJson<{ sensitiveSkipped: string[] }>(stdout);
    expect(body.sensitiveSkipped).toContain(".env");
  });
});

describe("map 命令: 失败路径", () => {
  it("路径不存在时退出码 1", async () => {
    const { stdout } = captureStdio();

    await runMap({ target: path.join(os.tmpdir(), "does-not-exist-map"), depth: 2, json: true });

    const body = soleJson<{ ok: boolean; error: string }>(stdout);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("路径不存在");
    expect(process.exitCode).toBe(1);
  });

  it("传入文件而不是目录时报错", async () => {
    const dir = await makeProject();
    const { stdout } = captureStdio();

    await runMap({ target: path.join(dir, "src/index.ts"), depth: 2, json: true });

    const body = soleJson<{ ok: boolean; error: string }>(stdout);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("请传目录");
    expect(process.exitCode).toBe(1);
  });

  it("空目录时报错", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "repo-ai-map-empty-"));
    cleanup.push(dir);
    const { stdout } = captureStdio();

    await runMap({ target: dir, depth: 2, json: true });

    const body = soleJson<{ ok: boolean; error: string }>(stdout);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("未收集到任何可分析的文件");
    expect(process.exitCode).toBe(1);
  });

  it("--focus 指向仓库外时报错", async () => {
    const dir = await makeProject();
    const { stdout } = captureStdio();

    await runMap(baseOptions(dir, { focus: "../outside" }));

    const body = soleJson<{ ok: boolean; error: string }>(stdout);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("必须位于仓库内");
    expect(process.exitCode).toBe(1);
  });
});
