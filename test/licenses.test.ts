import { describe, it, expect } from "vitest";
import {
  LICENSE_TEMPLATES,
  findLicenseTemplate,
} from "../src/lib/licenses.js";

describe("LICENSE_TEMPLATES", () => {
  it("包含常见短许可模板", () => {
    const ids = LICENSE_TEMPLATES.map((l) => l.id);
    for (const id of ["mit", "isc", "bsd-2-clause", "bsd-3-clause", "unlicense", "mit-0"]) {
      expect(ids).toContain(id);
    }
  });

  it("MIT 注入年份与署名", () => {
    const mit = findLicenseTemplate("mit")!;
    const text = mit.render({ year: "2026", holder: "Yu" });
    expect(text).toContain("MIT License");
    expect(text).toContain("Copyright (c) 2026 Yu");
  });

  it("findLicenseTemplate 大小写不敏感", () => {
    expect(findLicenseTemplate("MIT")?.id).toBe("mit");
    expect(findLicenseTemplate("gpl")).toBeUndefined();
  });

  it("每个模板渲染结果非空", () => {
    for (const l of LICENSE_TEMPLATES) {
      const text = l.render({ year: "2026", holder: "Yu" });
      expect(text.length).toBeGreaterThan(0);
    }
  });
});