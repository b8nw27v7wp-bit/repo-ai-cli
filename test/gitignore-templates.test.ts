import { describe, it, expect, vi, afterEach } from "vitest";
import {
  GITIGNORE_TEMPLATES,
  findGitignoreTemplate,
} from "../src/lib/gitignore-templates.js";
import { runGitignore } from "../src/commands/gitignore.js";

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = 0;
});

describe("runGitignore --list", () => {
  it("--json 输出 {ok, templates}，每项含 id 与 name", async () => {
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      out.push(a.map(String).join(" "));
    });
    await runGitignore({ list: true, json: true });
    expect(out).toHaveLength(1);
    const body = JSON.parse(out[0]!) as {
      ok: boolean;
      templates: { id: string; name: string }[];
    };
    expect(body.ok).toBe(true);
    expect(body.templates).toHaveLength(GITIGNORE_TEMPLATES.length);
    expect(body.templates.map((t) => t.id)).toEqual(
      GITIGNORE_TEMPLATES.map((t) => t.id),
    );
    expect(body.templates[0]).toEqual({
      id: GITIGNORE_TEMPLATES[0]!.id,
      name: GITIGNORE_TEMPLATES[0]!.name,
    });
    expect(process.exitCode ?? 0).toBe(0);
  });

  it("默认（无 --json）仍是文本表格，每模板一行、id 左对齐", async () => {
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      out.push(a.map(String).join(" "));
    });
    await runGitignore({ list: true });
    expect(out).toHaveLength(GITIGNORE_TEMPLATES.length);
    const first = GITIGNORE_TEMPLATES[0]!;
    expect(out[0]).toBe(`${first.id.padEnd(12)} ${first.name}`);
    expect(process.exitCode ?? 0).toBe(0);
  });
});

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