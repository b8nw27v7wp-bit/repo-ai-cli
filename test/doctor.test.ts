import { describe, it, expect } from "vitest";
import { collectChecks } from "../src/lib/doctor.js";

describe("collectChecks", () => {
  it("返回固定的 4 项检查", async () => {
    const checks = await collectChecks(process.cwd());
    expect(checks.map((c) => c.id)).toEqual(["node", "git", "config", "llm"]);
  });

  it("每项都有非空 detail", async () => {
    const checks = await collectChecks(process.cwd());
    for (const c of checks) {
      expect(c.detail.length).toBeGreaterThan(0);
      expect(["ok", "warn", "fail"]).toContain(c.status);
    }
  });

  it("Node 版本项为 ok（本仓库要求 ≥ 20）", async () => {
    const checks = await collectChecks(process.cwd());
    expect(checks.find((c) => c.id === "node")?.status).toBe("ok");
  });
});