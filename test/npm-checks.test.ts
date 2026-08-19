import { describe, it, expect } from "vitest";
import {
  parseOutdatedJson,
  parseAuditJson,
} from "../src/lib/npm-checks.js";

describe("parseOutdatedJson", () => {
  it("解析标准 npm outdated --json", () => {
    const stdout = JSON.stringify({
      lodash: { current: "4.17.20", wanted: "4.17.21", latest: "4.17.21", location: "node_modules/lodash" },
      commander: { current: "15.0.0", wanted: "15.1.0", latest: "16.0.0", location: "node_modules/commander" },
    });
    const entries = parseOutdatedJson(stdout);
    expect(entries).toHaveLength(2);
    const lodash = entries.find((e) => e.name === "lodash");
    const commander = entries.find((e) => e.name === "commander");
    expect(lodash?.current).toBe("4.17.20");
    expect(commander?.latest).toBe("16.0.0");
  });

  it("空对象返回空数组", () => {
    expect(parseOutdatedJson("{}")).toEqual([]);
  });

  it("非法 JSON 返回空数组不抛错", () => {
    expect(parseOutdatedJson("not json")).toEqual([]);
  });

  it("缺失字段用 ? 占位", () => {
    const entries = parseOutdatedJson(JSON.stringify({ x: {} }));
    expect(entries[0]?.current).toBe("?");
    expect(entries[0]?.latest).toBe("?");
  });
});

describe("parseAuditJson", () => {
  it("统计各级别漏洞数并按严重度排序", () => {
    const stdout = JSON.stringify({
      metadata: { vulnerabilities: { low: 1, moderate: 1, high: 2, critical: 1 } },
      vulnerabilities: {
        "pkg-low": { severity: "low", range: "<2.0.0", via: [] },
        "pkg-critical": {
          severity: "critical",
          range: "*",
          via: [{ title: "RCE in pkg-critical" }],
        },
        "pkg-high": { severity: "high", range: ">=1.0.0", via: ["pkg-dep"] },
      },
    });
    const s = parseAuditJson(stdout);
    expect(s.total).toBe(3);
    expect(s.critical).toBe(1);
    expect(s.high).toBe(2);
    expect(s.advisories[0]?.name).toBe("pkg-critical"); // critical 排最前
    expect(s.advisories[0]?.title).toBe("RCE in pkg-critical");
    expect(s.advisories[1]?.severity).toBe("high");
  });

  it("via 为字符串数组时 title 为空", () => {
    const stdout = JSON.stringify({
      vulnerabilities: { a: { severity: "moderate", via: ["dep"] } },
    });
    const s = parseAuditJson(stdout);
    expect(s.advisories[0]?.title).toBe("");
  });

  it("无 vulnerabilities 时 total 为 0", () => {
    const s = parseAuditJson(JSON.stringify({ metadata: { vulnerabilities: {} } }));
    expect(s.total).toBe(0);
    expect(s.advisories).toEqual([]);
  });

  it("非法 JSON 抛错（由调用方捕获）", () => {
    expect(() => parseAuditJson("{{")).toThrow();
  });
});
