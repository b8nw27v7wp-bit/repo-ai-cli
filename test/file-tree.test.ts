import { describe, it, expect } from "vitest";
import { buildFileTree } from "../src/lib/file-tree.js";

describe("buildFileTree", () => {
  it("生成嵌套树", () => {
    const tree = buildFileTree(
      ["src/index.ts", "src/lib/util.ts", "README.md", "package.json"],
      "my-repo",
    );
    expect(tree).toContain("my-repo");
    expect(tree).toContain("src/");
    expect(tree).toContain("index.ts");
    expect(tree).toContain("util.ts");
    expect(tree).toContain("README.md");
  });

  it("目录在前，同级按字母序", () => {
    const tree = buildFileTree(["b.ts", "a.ts", "dir/c.ts"], "r");
    const lines = tree.split("\n");
    const dirIdx = lines.findIndex((l) => l.includes("dir/"));
    const aIdx = lines.findIndex((l) => l.includes("a.ts"));
    const bIdx = lines.findIndex((l) => l.includes("b.ts"));
    expect(dirIdx).toBeLessThan(aIdx);
    expect(dirIdx).toBeLessThan(bIdx);
    expect(aIdx).toBeLessThan(bIdx);
  });

  it("空列表只输出根", () => {
    expect(buildFileTree([], "r")).toBe("r");
  });

  it("深路径正确折叠", () => {
    const tree = buildFileTree(["a/b/c/d.ts"], "r");
    expect(tree).toContain("a/");
    expect(tree).toContain("b/");
    expect(tree).toContain("c/");
    expect(tree).toContain("d.ts");
  });
});
