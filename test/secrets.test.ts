import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSecrets } from "../src/commands/secrets.js";

let tmp: string;

beforeAll(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "repo-ai-secrets-cmd-"));
  await writeFile(path.join(tmp, "key.txt"), `token = "AKIA${"C".repeat(16)}"\n`);
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = 0;
});

describe("runSecrets --json", () => {
  it("命中时输出 {ok:false} 且退出码为 1", async () => {
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      out.push(a.map(String).join(" "));
    });
    await runSecrets({ target: tmp, json: true });
    expect(process.exitCode).toBe(1);
    expect(out).toHaveLength(1);
    const body = JSON.parse(out[0]!) as { ok: boolean; count: number };
    expect(body.ok).toBe(false);
    expect(body.count).toBeGreaterThan(0);
  });
});
