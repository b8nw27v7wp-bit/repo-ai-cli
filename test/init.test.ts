import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runInit } from "../src/commands/init.js";
import { TEMPLATES } from "../src/lib/templates.js";
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
  const dir = await mkdtemp(path.join(os.tmpdir(), "repo-ai-init-"));
  cleanup.push(dir);
  return dir;
}

describe("init 命令: 前置校验", () => {
  it("未知模板报错、退出码 1，且不生成任何文件", async () => {
    const dir = await makeEmptyDir();
    const { stderr } = captureStdio();

    await inDir(dir, () => runInit({ name: "my-cli", template: "rust-cli" }));

    expect(process.exitCode).toBe(1);
    expect(stderr.join("\n")).toContain("rust-cli");
    // 报错信息里要列出可用模板，否则用户不知道该填什么
    for (const t of TEMPLATES) expect(stderr.join("\n")).toContain(t.id);
  });
});

describe("init 命令: 生成契约", () => {
  it("在指定目录名下落盘模板文件", async () => {
    const dir = await makeEmptyDir();
    captureStdio();

    await inDir(dir, () => runInit({ name: "my-cli", template: "ts-cli" }));

    const target = path.join(dir, "my-cli");
    expect(existsSync(path.join(target, "package.json"))).toBe(true);
    expect(process.exitCode).not.toBe(1);
  });

  it("--json 时 stdout 只有一行 JSON，含目录/模板/已创建清单", async () => {
    const dir = await makeEmptyDir();
    const { stdout } = captureStdio();

    await inDir(dir, () => runInit({ name: "my-cli", template: "ts-lib", json: true }));

    const body = soleJson<{
      ok: boolean;
      template: string;
      directory: string;
      name: string;
      packageName: string;
      created: string[];
      skipped: string[];
    }>(stdout);
    expect(body.ok).toBe(true);
    expect(body.template).toBe("ts-lib");
    expect(body.directory).toBe(path.join(dir, "my-cli"));
    expect(body.packageName).toBe("my-cli");
    expect(body.created).toContain("package.json");
    expect(body.skipped).toHaveLength(0);
  });

  it("文件已存在且未加 --force 时记入 skipped 且不覆盖内容", async () => {
    const dir = await makeEmptyDir();
    const target = path.join(dir, "my-cli");
    const { stdout } = captureStdio();

    await inDir(dir, () => runInit({ name: "my-cli", template: "ts-cli" }));
    await writeFile(path.join(target, "package.json"), '{"sentinel":true}\n');

    const second = captureStdio();
    await inDir(dir, () => runInit({ name: "my-cli", template: "ts-cli", json: true }));

    const body = soleJson<{ created: string[]; skipped: string[] }>(second.stdout);
    expect(body.skipped).toContain("package.json");
    expect(body.created).not.toContain("package.json");
    expect(await readFile(path.join(target, "package.json"), "utf8")).toContain("sentinel");
    expect(stdout).toBeDefined();
  });

  it("--force 覆盖已存在文件", async () => {
    const dir = await makeEmptyDir();
    const target = path.join(dir, "my-cli");
    captureStdio();

    await inDir(dir, () => runInit({ name: "my-cli", template: "ts-cli" }));
    await writeFile(path.join(target, "package.json"), '{"sentinel":true}\n');

    const second = captureStdio();
    await inDir(dir, () => runInit({ name: "my-cli", template: "ts-cli", force: true, json: true }));

    const body = soleJson<{ created: string[]; skipped: string[] }>(second.stdout);
    expect(body.created).toContain("package.json");
    expect(body.skipped).toHaveLength(0);
    expect(await readFile(path.join(target, "package.json"), "utf8")).not.toContain("sentinel");
  });
});

describe("init 命令: 输出契约", () => {
  it("文本模式下把创建清单写到 stderr，stdout 只留「下一步」提示", async () => {
    const dir = await makeEmptyDir();
    const { stdout, stderr } = captureStdio();

    await inDir(dir, () => runInit({ name: "my-cli", template: "ts-cli" }));

    // say() 走 stderr、console.log 的「下一步」走 stdout —— 这条约定坏了会让管道使用者拿到噪声
    expect(stderr.join("\n")).toContain("模板:");
    expect(stdout.join("\n")).toContain("npm install");
  });
});
