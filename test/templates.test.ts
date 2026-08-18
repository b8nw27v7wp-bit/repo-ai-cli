import { describe, it, expect } from "vitest";
import {
  TEMPLATES,
  toPackageName,
  findTemplate,
} from "../src/lib/templates.js";

describe("toPackageName", () => {
  it("转为 kebab-case", () => {
    expect(toPackageName("My Cool Project!")).toBe("my-cool-project");
    expect(toPackageName("  Foo_Bar  ")).toBe("foo-bar");
    expect(toPackageName("Hello World")).toBe("hello-world");
  });

  it("全非法字符回退 my-project", () => {
    expect(toPackageName("!!@#")).toBe("my-project");
    expect(toPackageName("")).toBe("my-project");
  });
});

describe("TEMPLATES", () => {
  it("包含 ts-cli 与 ts-lib，查找大小写不敏感", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(ids).toContain("ts-cli");
    expect(ids).toContain("ts-lib");
    expect(findTemplate("TS-CLI")?.id).toBe("ts-cli");
    expect(findTemplate("nope")).toBeUndefined();
  });

  it("ts-cli 生成合法 package.json（带 bin）", () => {
    const t = findTemplate("ts-cli")!;
    const pkg = t.files["package.json"]!({
      name: "My Project",
      packageName: "my-project",
      description: "demo",
    });
    const parsed = JSON.parse(pkg);
    expect(parsed.name).toBe("my-project");
    expect(parsed.bin).toEqual({ "my-project": "./dist/index.js" });
    expect(parsed.scripts.build).toBe("tsup");
    expect(parsed.type).toBe("module");
  });

  it("ts-lib 生成带 exports 的 package.json（无 bin）", () => {
    const t = findTemplate("ts-lib")!;
    const pkg = t.files["package.json"]!({
      name: "x",
      packageName: "x-lib",
      description: "d",
    });
    const parsed = JSON.parse(pkg);
    expect(parsed.exports["."]).toBeTruthy();
    expect(parsed.main).toBe("./dist/index.js");
    expect(parsed.bin).toBeUndefined();
  });

  it("模板文件都非空", () => {
    for (const t of TEMPLATES) {
      for (const [rel, fn] of Object.entries(t.files)) {
        const content = fn({ name: "demo", packageName: "demo", description: "demo" });
        expect(content.length, `${t.id}/${rel} 为空`).toBeGreaterThan(0);
      }
    }
  });

  it("ts-cli 源码引用 packageName", () => {
    const t = findTemplate("ts-cli")!;
    const src = t.files["src/index.ts"]!({
      name: "demo",
      packageName: "demo-cli",
      description: "d",
    });
    expect(src).toContain('name("demo-cli")');
    expect(src).toContain("commander");
  });
});