import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runImpact } from "../src/commands/impact.js";
import type { ImpactOptions } from "../src/types.js";
import {
  captureStdio,
  inDir,
  makeGitRepo,
  soleJson,
  git,
} from "./helpers/command-harness.js";

const ORIGINAL_EXIT_CODE = process.exitCode;
const cleanup: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = ORIGINAL_EXIT_CODE;
  for (const dir of cleanup.splice(0)) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

const CHAIN = {
  "src/c.ts": "export const c = 1;\n",
  "src/b.ts": 'import { c } from "./c.js";\nexport const b = c;\n',
  "src/a.ts": 'import { b } from "./b.js";\nexport const a = b;\n',
  "test/b.test.ts": 'import { b } from "../src/b.js";\n',
};

async function makeChain(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "repo-ai-impact-"));
  cleanup.push(dir);
  for (const [rel, content] of Object.entries(CHAIN)) {
    const full = path.join(dir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  return dir;
}

function baseOptions(overrides: Partial<ImpactOptions> = {}): ImpactOptions {
  return { depth: 2, json: true, ...overrides };
}

describe("impact 命令: 反向依赖", () => {
  it("输出直接/传递依赖与受影响测试", async () => {
    const dir = await makeChain();
    const { stdout } = captureStdio();

    await inDir(dir, () =>
      runImpact(baseOptions({ targets: ["src/c.ts"], depth: 2 })),
    );

    const body = soleJson<{
      ok: boolean;
      targets: string[];
      direct: string[];
      transitive: string[];
      tests: string[];
    }>(stdout);
    expect(body.ok).toBe(true);
    expect(body.targets).toEqual(["src/c.ts"]);
    expect(body.direct).toEqual(["src/b.ts"]);
    expect(body.transitive.sort()).toEqual(["src/a.ts", "test/b.test.ts"]);
    expect(body.tests).toEqual(["test/b.test.ts"]);
    expect(process.exitCode).not.toBe(1);
  });

  it("暂存区删除文件时，仍能找出依赖它的文件与测试", async () => {
    const repo = await makeGitRepo("repo-ai-impact-del-", CHAIN);
    cleanup.push(repo.dir);
    await rm(path.join(repo.dir, "src/c.ts"));
    git(["add", "-A"], repo.dir);
    const { stdout } = captureStdio();

    await inDir(repo.dir, () => runImpact(baseOptions({ targets: [] })));

    const body = soleJson<{
      ok: boolean;
      targets: string[];
      direct: string[];
      tests: string[];
      notIndexed: string[];
    }>(stdout);
    expect(body.ok).toBe(true);
    expect(body.targets).toContain("src/c.ts");
    expect(body.direct).toContain("src/b.ts");
    expect(body.tests).toContain("test/b.test.ts");
    expect(body.notIndexed).toContain("src/c.ts");
  });

  it("暂存区纯重命名时，新旧路径都参与分析", async () => {
    const repo = await makeGitRepo("repo-ai-impact-ren-", CHAIN);
    cleanup.push(repo.dir);
    git(["mv", "src/c.ts", "src/c2.ts"], repo.dir);
    const { stdout } = captureStdio();

    await inDir(repo.dir, () => runImpact(baseOptions({ targets: [] })));

    const body = soleJson<{
      ok: boolean;
      targets: string[];
      direct: string[];
      tests: string[];
    }>(stdout);
    expect(body.ok).toBe(true);
    expect(body.targets).toEqual(expect.arrayContaining(["src/c.ts", "src/c2.ts"]));
    // b.ts 仍 import 旧路径，重命名后它是最直接的受害者
    expect(body.direct).toContain("src/b.ts");
    expect(body.tests).toContain("test/b.test.ts");
  });

  it("未传文件时从暂存区改动读取", async () => {
    const repo = await makeGitRepo("repo-ai-impact-git-", CHAIN);
    cleanup.push(repo.dir);
    await writeFile(
      path.join(repo.dir, "src/c.ts"),
      "export const c = 2;\n",
    );
    git(["add", "src/c.ts"], repo.dir);
    const { stdout } = captureStdio();

    await inDir(repo.dir, () => runImpact(baseOptions({ targets: [] })));

    const body = soleJson<{ targets: string[]; direct: string[] }>(stdout);
    expect(body.targets).toEqual(["src/c.ts"]);
    expect(body.direct).toEqual(["src/b.ts"]);
  });
});

describe("impact 命令: 失败路径", () => {
  it("暂存区没有改动时退出码 1", async () => {
    const repo = await makeGitRepo("repo-ai-impact-clean-", CHAIN);
    cleanup.push(repo.dir);
    const { stdout } = captureStdio();

    await inDir(repo.dir, () => runImpact(baseOptions({ targets: [] })));

    const body = soleJson<{ ok: boolean; error: string }>(stdout);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("暂存区没有可分析的改动");
    expect(process.exitCode).toBe(1);
  });

  it("文件不在索引中时退出码 1", async () => {
    const dir = await makeChain();
    const { stdout } = captureStdio();

    await inDir(dir, () =>
      runImpact(baseOptions({ targets: ["src/missing.ts"] })),
    );

    const body = soleJson<{ ok: boolean; error: string }>(stdout);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("都不在索引中");
    expect(process.exitCode).toBe(1);
  });

  it("不在 git 仓库内使用 --diff 时给出可读错误", async () => {
    const dir = await makeChain();
    const { stdout } = captureStdio();

    await inDir(dir, () => runImpact(baseOptions({ targets: [], diff: true })));

    const body = soleJson<{ ok: boolean; error: string }>(stdout);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("不在 git 仓库内");
    expect(process.exitCode).toBe(1);
  });
});
