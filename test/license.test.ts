import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runLicense } from "../src/commands/license.js";
import { LICENSE_TEMPLATES } from "../src/lib/licenses.js";
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
  const dir = await mkdtemp(path.join(os.tmpdir(), "repo-ai-license-"));
  cleanup.push(dir);
  return dir;
}

describe("license 命令: 前置校验", () => {
  it("未知许可报错、退出码 1，并列出全部可用许可", async () => {
    const dir = await makeEmptyDir();
    const { stderr } = captureStdio();

    await inDir(dir, () => runLicense({ license: "wtfpl" }));

    expect(process.exitCode).toBe(1);
    const printed = stderr.join("\n");
    expect(printed).toContain("wtfpl");
    for (const t of LICENSE_TEMPLATES) expect(printed).toContain(t.id);
  });

  it("许可 id 大小写不敏感", async () => {
    const dir = await makeEmptyDir();
    captureStdio();

    await inDir(dir, () => runLicense({ license: "MIT", name: "Yu", output: "LICENSE" }));

    expect(process.exitCode).not.toBe(1);
  });
});

describe("license 命令: 生成契约", () => {
  it("把年份与署名渲染进文件", async () => {
    const dir = await makeEmptyDir();
    captureStdio();

    await inDir(dir, () =>
      runLicense({ license: "mit", name: "Yu Zhang", year: "2026", output: "LICENSE" }),
    );

    const content = await readFile(path.join(dir, "LICENSE"), "utf8");
    expect(content).toContain("Yu Zhang");
    expect(content).toContain("2026");
  });

  it("-o 支持子目录路径（自动建目录）", async () => {
    const dir = await makeEmptyDir();
    captureStdio();

    await inDir(dir, () =>
      runLicense({ license: "isc", name: "Yu", output: path.join("legal", "LICENSE") }),
    );

    expect(await readFile(path.join(dir, "legal", "LICENSE"), "utf8")).toContain("Yu");
  });

  it("git 里取不到 user.name 且未给 --name 时署名回退为 Your Name", async () => {
    // getGitUserName 走 `git config user.name`（无 --local），在非仓库目录会读到全局配置，
    // 所以「取不到」这一支只能靠打桩 git 模块触发，不能靠换目录。
    vi.resetModules();
    vi.doMock("../src/lib/git.js", () => ({
      getGitUserName: async () => "",
    }));
    try {
      const { runLicense: run } = await import("../src/commands/license.js");
      const dir = await makeEmptyDir();
      captureStdio();

      await inDir(dir, () => run({ license: "mit", output: "LICENSE" }));

      expect(await readFile(path.join(dir, "LICENSE"), "utf8")).toContain("Your Name");
    } finally {
      vi.doUnmock("../src/lib/git.js");
      vi.resetModules();
    }
  });

  it("--json 时 stdout 只有一行 JSON，含 license/holder/year/output", async () => {
    const dir = await makeEmptyDir();
    const { stdout } = captureStdio();

    await inDir(dir, () =>
      runLicense({ license: "unlicense", name: "Yu", year: "2026", json: true }),
    );

    const body = soleJson<{
      ok: boolean;
      license: string;
      holder: string;
      year: string;
      output: string;
    }>(stdout);
    expect(body.ok).toBe(true);
    expect(body.license).toBe("unlicense");
    expect(body.holder).toBe("Yu");
    expect(body.year).toBe("2026");
    expect(body.output).toBe(path.join(dir, "LICENSE"));
  });
});
