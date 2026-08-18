import { describe, it, expect } from "vitest";
import {
  GITIGNORE_TEMPLATES,
  findGitignoreTemplate,
} from "../src/lib/gitignore-templates.js";

describe("GITIGNORE_TEMPLATES", () => {
  it("模板 id 唯一且非空内容", () => {
    const ids = GITIGNORE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of GITIGNORE_TEMPLATES) {
      expect(t.content.length).toBeGreaterThan(0);
    }
  });

  it("包含常见语言/框架模板", () => {
    const ids = GITIGNORE_TEMPLATES.map((t) => t.id);
    for (const id of ["node", "python", "go", "rust", "java", "nextjs", "vue", "react", "docker", "macos"]) {
      expect(ids).toContain(id);
    }
  });

  it("findGitignoreTemplate 大小写不敏感", () => {
    expect(findGitignoreTemplate("NODE")?.id).toBe("node");
    expect(findGitignoreTemplate("nope")).toBeUndefined();
  });
});