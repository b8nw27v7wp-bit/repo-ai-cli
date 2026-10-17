import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runGitignore } from "../src/commands/gitignore.js";
import { GITIGNORE_TEMPLATES } from "../src/lib/gitignore-templates.js";
import { captureStdio, inDir, soleJson } from "./helpers/command-harness.js";

const ORIGINAL_EXIT_CODE = process.exitCode;
const cleanup: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.exitCode = ORIGINAL_EXIT_CODE;
  for (const dir of cleanup.splice(0)) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

async function makeEmptyDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "repo-ai-gitignore-"));
  cleanup.push(dir);
  return dir;
}

describe("gitignore 命令: 前置校验", () => {
  it("未指定模板时失败、退出码 1，并提示 --list", async () => {
    const dir = await makeEmptyDir();
    const { stderr } = captureStdio();

    await inDir(dir, () => runGitignore({ templates: [] }));

    expect(process.exitCode).toBe(1);
    const printed = stderr.join("\n");
    expect(printed).toContain("--list");
    expect(printed).toContain("repo-ai gitignore node python");
  });

  it("未知模板报错、退出码 1，并列出可用模板", async () => {
    const dir = await makeEmptyDir();
    const { stderr } = captureStdio();

    await inDir(dir, () => runGitignore({ templates: ["node", "cobol"] }));

    expect(process.exitCode).toBe(1);
    const printed = stderr.join("\n");
    expect(printed).toContain("cobol");
    expect(printed).toContain("node");
  });
});

describe("gitignore 命令: 生成契约", () => {
  it("默认把内容打到 stdout，并提示可用 -o 落盘", async () => {
    const dir = await makeEmptyDir();
    const { stdout, stderr } = captureStdio();

    await inDir(dir, () => runGitignore({ templates: ["node"] }));

    expect(stdout.join("\n")).toContain("node_modules");
    expect(stderr.join("\n")).toContain("-o .gitignore");
    expect(process.exitCode).not.toBe(1);
  });

  it("多模板合并去重：同一行只出现一次", async () => {
    const dir = await makeEmptyDir();
    const { stdout } = captureStdio();

    await inDir(dir, () => runGitignore({ templates: ["node", "node"] }));

    const lines = stdout.join("\n").split("\n").filter((l) => l.trim() === ".env");
    expect(lines).toHaveLength(1);
  });

  it("-o 落盘到指定路径", async () => {
    const dir = await makeEmptyDir();
    const out = path.join(dir, "nested", ".gitignore");
    captureStdio();

    await inDir(dir, () => runGitignore({ templates: ["python"], output: out }));

    expect(await readFile(out, "utf8")).toContain("__pycache__");
  });

  it("--json 无 -o 时输出 content 字段，stdout 只有一行", async () => {
    const dir = await makeEmptyDir();
    const { stdout } = captureStdio();

    await inDir(dir, () => runGitignore({ templates: ["go"], json: true }));

    const body = soleJson<{ ok: boolean; content: string; templates: string[] }>(stdout);
    expect(body.ok).toBe(true);
    expect(body.templates).toEqual(["go"]);
    expect(body.content).toContain(".exe");
  });

  it("--json 加 -o 时输出落盘路径而非内容", async () => {
    const dir = await makeEmptyDir();
    const out = path.join(dir, ".gitignore");
    const { stdout } = captureStdio();

    await inDir(dir, () => runGitignore({ templates: ["go"], output: out, json: true }));

    const body = soleJson<{ output: string; content?: string }>(stdout);
    expect(body.output).toBe(out);
    expect(body.content).toBeUndefined();
  });
});

describe("gitignore 命令: --list", () => {
  it("--list --json 列出全部模板 id", async () => {
    const dir = await makeEmptyDir();
    const { stdout } = captureStdio();

    await inDir(dir, () => runGitignore({ list: true, json: true }));

    const body = soleJson<{ templates: Array<{ id: string }> }>(stdout);
    expect(body.templates.map((t) => t.id)).toEqual(GITIGNORE_TEMPLATES.map((t) => t.id));
  });
});
