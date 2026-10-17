import { describe, it, expect, vi, afterEach } from "vitest";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { runRelease } from "../src/commands/release.js";
import {
  captureStdio,
  git,
  inDir,
  makeGitRepo,
  makePlainDir,
  soleJson,
  type TempRepo,
} from "./helpers/command-harness.js";

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

/** 造一个带 package.json 的仓库，并追加若干约定式提交 */
async function makeReleasableRepo(): Promise<TempRepo> {
  const repo = await makeGitRepo("repo-ai-release-", {
    "package.json": '{\n  "name": "demo",\n  "version": "1.2.3"\n}\n',
  });
  cleanup.push(repo.dir);
  await repo.commit("b.ts", "export const b = 1;\n", "feat: add b");
  await repo.commit("c.ts", "export const c = 1;\n", "fix: correct c");
  return repo;
}

async function readVersion(dir: string): Promise<string> {
  const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8")) as {
    version: string;
  };
  return pkg.version;
}

describe("release 命令: 前置校验", () => {
  it("非 git 仓库直接失败、退出码 1", async () => {
    const dir = await makePlainDir();
    cleanup.push(dir);
    captureStdio();

    await inDir(dir, () => runRelease({}));

    expect(process.exitCode).toBe(1);
  });

  it("非法 --bump 报错、退出码 1，且不改动 package.json", async () => {
    const repo = await makeReleasableRepo();
    const { stderr } = captureStdio();

    await inDir(repo.dir, () => runRelease({ bump: "banana" }));

    expect(process.exitCode).toBe(1);
    expect(stderr.join("\n")).toContain("banana");
    expect(await readVersion(repo.dir)).toBe("1.2.3");
  });
});

describe("release 命令: 建议模式（默认不改动）", () => {
  it("--json 输出建议且不动 package.json", async () => {
    const repo = await makeReleasableRepo();
    const { stdout } = captureStdio();

    await inDir(repo.dir, () => runRelease({ json: true }));

    const body = soleJson<{
      ok: boolean;
      next: string;
      level: string;
      commitCount: number;
      commits: string[];
    }>(stdout);
    expect(body.ok).toBe(true);
    expect(body.next).toBe("1.3.0"); // feat 存在 → minor
    expect(body.level).toBe("minor");
    expect(body.commits).toContain("feat: add b");
    expect(await readVersion(repo.dir)).toBe("1.2.3");
  });

  it("文本模式打印当前版本与建议版本", async () => {
    const repo = await makeReleasableRepo();
    const { stdout } = captureStdio();

    await inDir(repo.dir, () => runRelease({}));

    const printed = stdout.join("\n");
    expect(printed).toContain("1.2.3");
    expect(printed).toContain("1.3.0");
  });
});

describe("release 命令: 应用模式", () => {
  it("--bump patch 写回 package.json", async () => {
    const repo = await makeReleasableRepo();
    const { stdout } = captureStdio();

    await inDir(repo.dir, () => runRelease({ bump: "patch", json: true }));

    const body = soleJson<{ version: string; level: string; tag: null }>(stdout);
    expect(body.version).toBe("1.2.4");
    expect(body.level).toBe("patch");
    expect(body.tag).toBeNull();
    expect(await readVersion(repo.dir)).toBe("1.2.4");
  });

  it("--bump auto --tag 采用建议级别并打 tag", async () => {
    const repo = await makeReleasableRepo();
    const { stdout } = captureStdio();

    await inDir(repo.dir, () => runRelease({ bump: "auto", tag: true, json: true }));

    const body = soleJson<{ version: string; tag: string }>(stdout);
    expect(body.version).toBe("1.3.0");
    expect(body.tag).toBe("v1.3.0");
    expect(git(["tag", "--list"], repo.dir).trim()).toBe("v1.3.0");
  });

  it("tag 已存在时失败、退出码 1，且不再改版本号", async () => {
    const repo = await makeReleasableRepo();
    // tag 打在倒数第二个提交上：这样它仍是「最近的 tag」（有提交可比），
    // 而 minor bump 算出的目标 tag 名 v1.3.0 恰好已存在 —— 正是要测的守卫分支
    git(["tag", "v1.3.0", "HEAD~1"], repo.dir);
    const { stderr } = captureStdio();

    await inDir(repo.dir, () => runRelease({ bump: "minor", tag: true }));

    expect(process.exitCode).toBe(1);
    expect(stderr.join("\n")).toContain("v1.3.0");
    expect(await readVersion(repo.dir)).toBe("1.2.3");
  });

  it("没有 package.json 时失败、退出码 1", async () => {
    const repo = await makeGitRepo("repo-ai-release-nopkg-");
    cleanup.push(repo.dir);
    const { stderr } = captureStdio();

    await inDir(repo.dir, () => runRelease({ bump: "patch" }));

    expect(process.exitCode).toBe(1);
    expect(stderr.join("\n")).toContain("package.json");
  });

  it("package.json 版本号非法时失败、退出码 1", async () => {
    const repo = await makeReleasableRepo();
    await writeFile(path.join(repo.dir, "package.json"), '{"name":"demo","version":"1.2"}\n');
    const { stderr } = captureStdio();

    await inDir(repo.dir, () => runRelease({ bump: "patch" }));

    expect(process.exitCode).toBe(1);
    expect(stderr.join("\n")).toContain("1.2");
  });
});
