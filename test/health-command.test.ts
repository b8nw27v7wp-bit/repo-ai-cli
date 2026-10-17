import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runHealth } from "../src/commands/health.js";
import type { HealthOptions } from "../src/types.js";
import { captureStdio, soleJson } from "./helpers/command-harness.js";

vi.mock("../src/lib/npm-checks.js", () => ({
  npmOutdated: vi.fn(async () => ({
    entries: [
      { name: "left-pad", current: "1.0.0", wanted: "2.0.0", latest: "2.0.0", location: "" },
    ],
  })),
  npmAudit: vi.fn(async () => ({
    summary: { total: 0, low: 0, moderate: 0, high: 0, critical: 0, advisories: [] },
  })),
}));

const ORIGINAL_EXIT_CODE = process.exitCode;
const cleanup: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = ORIGINAL_EXIT_CODE;
  for (const dir of cleanup.splice(0)) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

const COMPLETE = {
  "README.md": "# demo\n",
  "LICENSE": "MIT\n",
  ".gitignore": "node_modules/\n",
  "CONTRIBUTING.md": "# contributing\n",
  "CHANGELOG.md": "# changelog\n",
  ".github/workflows/ci.yml": "name: CI\n",
  "package.json": JSON.stringify({
    name: "healthy-demo",
    description: "demo",
    keywords: ["demo"],
    repository: "https://example.com/demo.git",
    engines: { node: ">=20" },
    license: "MIT",
  }),
  "src/index.ts": "export const a = 1;\n",
  "test/a.test.ts": "export const t = 1;\n",
};

async function makeProject(
  files: Record<string, string> = {},
  prefix = "repo-ai-health-",
): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  cleanup.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  return dir;
}

function baseOptions(dir: string, overrides: Partial<HealthOptions> = {}): HealthOptions {
  return { target: dir, json: true, ...overrides };
}

describe("health 命令: 健康仓库", () => {
  it("完整项目全部通过", async () => {
    const dir = await makeProject(COMPLETE);
    const { stdout } = captureStdio();

    await runHealth(baseOptions(dir));

    const body = soleJson<{
      ok: boolean;
      summary: { ok: number; warn: number; fail: number };
      checks: Array<{ id: string; status: string }>;
    }>(stdout);
    expect(body.ok).toBe(true);
    expect(body.summary.fail).toBe(0);
    expect(body.summary.warn).toBe(0);
    expect(body.checks.every((c) => c.status === "ok")).toBe(true);
    expect(process.exitCode).not.toBe(1);
  });
});

describe("health 命令: 缺口与退出码", () => {
  it("缺 README / LICENSE 记为失败并退出 1", async () => {
    const dir = await makeProject({ "src/index.ts": "export const a = 1;\n" });
    const { stdout } = captureStdio();

    await runHealth(baseOptions(dir));

    const body = soleJson<{
      ok: boolean;
      checks: Array<{ id: string; status: string; fix?: string }>;
    }>(stdout);
    expect(body.ok).toBe(false);
    expect(body.checks.find((c) => c.id === "readme")?.status).toBe("fail");
    expect(body.checks.find((c) => c.id === "license")?.status).toBe("fail");
    expect(body.checks.find((c) => c.id === "readme")?.fix).toContain("repo-ai-cli readme");
    expect(process.exitCode).toBe(1);
  });

  async function makeWarnOnlyProject(): Promise<string> {
    return makeProject({
      "README.md": "# demo\n",
      "LICENSE": "MIT\n",
      "package.json": COMPLETE["package.json"],
      "src/index.ts": "export const a = 1;\n",
      "test/a.test.ts": "export const t = 1;\n",
    });
  }

  it("只有警告时默认通过", async () => {
    const dir = await makeWarnOnlyProject();
    const { stdout } = captureStdio();

    await runHealth(baseOptions(dir));

    const body = soleJson<{ ok: boolean; summary: { warn: number; fail: number } }>(stdout);
    expect(body.ok).toBe(true);
    expect(body.summary.fail).toBe(0);
    expect(body.summary.warn).toBeGreaterThan(0);
    expect(process.exitCode).not.toBe(1);
  });

  it("--strict 时警告也退出 1", async () => {
    const dir = await makeWarnOnlyProject();
    const { stdout } = captureStdio();

    await runHealth(baseOptions(dir, { strict: true }));

    const body = soleJson<{ ok: boolean; summary: { fail: number } }>(stdout);
    expect(body.ok).toBe(false);
    expect(body.summary.fail).toBe(0);
    expect(process.exitCode).toBe(1);
  });
});

describe("health 命令: package.json 边界", () => {
  it("package.json 损坏时记为失败，而不是当成非 Node 项目跳过", async () => {
    const dir = await makeProject({ ...COMPLETE, "package.json": "{ not json !" });
    const { stdout } = captureStdio();

    await runHealth(baseOptions(dir));

    const body = soleJson<{
      checks: Array<{ id: string; status: string; detail: string }>;
    }>(stdout);
    const meta = body.checks.find((c) => c.id === "package-meta");
    expect(meta?.status).toBe("fail");
    expect(meta?.detail).toContain("无法解析");
    expect(body.checks.find((c) => c.id === "deps")?.status).toBe("warn");
    expect(process.exitCode).toBe(1);
  });

  it("package.json 缺少 name 时告警", async () => {
    const dir = await makeProject({
      ...COMPLETE,
      "package.json": JSON.stringify({
        description: "demo",
        keywords: ["demo"],
        repository: "https://example.com/demo.git",
        engines: { node: ">=20" },
        license: "MIT",
      }),
    });
    const { stdout } = captureStdio();

    await runHealth(baseOptions(dir));

    const body = soleJson<{
      checks: Array<{ id: string; status: string; detail: string }>;
    }>(stdout);
    const meta = body.checks.find((c) => c.id === "package-meta");
    expect(meta?.status).toBe("warn");
    expect(meta?.detail).toContain("name");
  });
});

describe("health 命令: 密钥与网络", () => {
  it("发现高危密钥时记为失败且不打印命中值", async () => {
    const dir = await makeProject({
      ...COMPLETE,
      "leak.txt": `token = "AKIA${"C".repeat(16)}"\n`,
    });
    const { stdout } = captureStdio();

    await runHealth(baseOptions(dir));

    const body = soleJson<{
      checks: Array<{ id: string; status: string; detail: string }>;
    }>(stdout);
    const secrets = body.checks.find((c) => c.id === "secrets");
    expect(secrets?.status).toBe("fail");
    expect(secrets?.detail).toContain("high 1");
    expect(JSON.stringify(body)).not.toContain("AKIA");
    expect(process.exitCode).toBe(1);
  });

  it("默认离线，不跑依赖网络检查", async () => {
    const dir = await makeProject(COMPLETE);
    const { stdout } = captureStdio();

    await runHealth(baseOptions(dir));

    const body = soleJson<{ checks: Array<{ id: string }> }>(stdout);
    expect(body.checks.some((c) => c.id === "deps-outdated")).toBe(false);
    expect(body.checks.some((c) => c.id === "deps-audit")).toBe(false);
  });

  it("--network 时汇总 outdated / audit 结果", async () => {
    const dir = await makeProject(COMPLETE);
    const { stdout } = captureStdio();

    await runHealth(baseOptions(dir, { network: true }));

    const body = soleJson<{
      checks: Array<{ id: string; status: string }>;
    }>(stdout);
    expect(body.checks.find((c) => c.id === "deps-outdated")?.status).toBe("warn");
    expect(body.checks.find((c) => c.id === "deps-audit")?.status).toBe("ok");
  });
});

describe("health 命令: 失败路径", () => {
  it("路径不存在时退出码 1", async () => {
    const { stdout } = captureStdio();

    await runHealth({
      target: path.join(os.tmpdir(), `repo-ai-missing-health-${Date.now()}`),
      json: true,
    });

    const body = soleJson<{ ok: boolean; error: string }>(stdout);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("路径不存在");
    expect(process.exitCode).toBe(1);
  });
});
