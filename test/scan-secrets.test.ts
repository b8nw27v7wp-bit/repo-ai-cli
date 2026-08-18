import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { scanSecrets } from "../src/lib/scan-secrets.js";
import { SECRET_PATTERNS, maskValue } from "../src/lib/secret-patterns.js";

let tmp: string;

beforeAll(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "repo-ai-secrets-"));
  await mkdir(path.join(tmp, "node_modules"), { recursive: true });
  await writeFile(
    path.join(tmp, "app.ts"),
    [
      `const gh = "ghp_${"A".repeat(36)}";`,
      `const aws = "AKIA${"A".repeat(16)}";`,
      `const ok = "hello world";`,
    ].join("\n"),
  );
  await writeFile(
    path.join(tmp, ".env"),
    'OPENAI_KEY="sk-ABCDEFGHIJKLMNOPQRSTUVWX"\nPASSWORD="supersecret9999"\n',
  );
  // 二进制文件（按扩展名跳过）
  await writeFile(path.join(tmp, "pic.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  // node_modules 应被跳过
  await writeFile(
    path.join(tmp, "node_modules", "ignored.ts"),
    `const x = "ghp_${"B".repeat(36)}";`,
  );
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("scanSecrets", () => {
  it("命中多种密钥模式", async () => {
    const findings = await scanSecrets(tmp);
    const ids = findings.map((f) => f.pattern);
    expect(ids).toContain("github-pat");
    expect(ids).toContain("aws-access-key");
    expect(ids).toContain("openai-key");
    expect(ids).toContain("generic-assignment");
  });

  it("跳过 node_modules 与二进制文件", async () => {
    const findings = await scanSecrets(tmp);
    expect(findings.some((f) => f.file.includes("node_modules"))).toBe(false);
    expect(findings.some((f) => f.file.includes(".png"))).toBe(false);
  });

  it("带行号且值已打码（不泄露原文）", async () => {
    const findings = await scanSecrets(tmp);
    const gh = findings.find((f) => f.pattern === "github-pat");
    expect(gh?.line).toBe(1);
    expect(gh?.redacted).toContain("...");
    expect(gh?.redacted.indexOf("AAAAA")).toBe(-1); // 不含连续长串
  });

  it("severity 过滤：high 只含 critical/high", async () => {
    const findings = await scanSecrets(tmp, { severityThreshold: "high" });
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.severity === "critical" || f.severity === "high").toBe(true);
    }
  });
});

describe("SECRET_PATTERNS / maskValue", () => {
  it("每个模式都有 severity 与全局 regex", () => {
    for (const p of SECRET_PATTERNS) {
      expect(["critical", "high", "medium"]).toContain(p.severity);
      expect(p.regex.global).toBe(true);
      expect(p.id.length).toBeGreaterThan(0);
    }
  });

  it("maskValue 短值全打码，长值留头尾", () => {
    expect(maskValue("short")).toBe("****");
    expect(maskValue("abcdefghij")).toBe("abcd...ghij");
  });
});