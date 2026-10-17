import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildRepoIndex, computeImpact } from "../src/lib/repo-index.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "repo-ai-index-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function makeTree(files: Record<string, string>): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(tmp, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }
}

describe("buildRepoIndex", () => {
  it("统计文件、行数、语言、分组与入口", async () => {
    await makeTree({
      "package.json": '{"name":"fixture"}\n',
      "README.md": "# fixture\n",
      "src/index.ts": "export const a = 1;\n",
      "src/lib/util.ts": "export const b = 2;\nexport const c = 3;\n",
      "test/a.test.ts": "import { a } from '../src/index.js';\n",
    });
    const index = await buildRepoIndex(tmp);

    expect(index.repoName).toBe("fixture");
    expect(index.totals.files).toBe(5);
    expect(index.groups.map((g) => g.name).sort()).toEqual([
      "(root)",
      "src",
      "test",
    ]);
    expect(index.entryPoints).toContain("src/index.ts");
    expect(index.languages[0]?.language).toBe("TypeScript");
    expect(index.files.find((f) => f.relPath === "src/lib/util.ts")?.lines).toBe(2);
  });

  it("解析 ESM 的 .js → .ts 映射与无扩展名 / index 解析", async () => {
    await makeTree({
      "src/a.ts": 'import { b } from "./b.js";\nimport { d } from "./dir";\n',
      "src/b.ts": "export const b = 1;\n",
      "src/dir/index.ts": "export const d = 1;\n",
    });
    const index = await buildRepoIndex(tmp);
    const a = index.files.find((f) => f.relPath === "src/a.ts");
    expect(a?.imports.sort()).toEqual(["src/b.ts", "src/dir/index.ts"]);
    expect(index.dependents.get("src/b.ts")).toEqual(["src/a.ts"]);
    expect(index.unresolved).toBe(0);
  });

  it("解析 Python 相对导入", async () => {
    await makeTree({
      "pkg/mod.py": "from .utils import helper\n",
      "pkg/utils.py": "def helper():\n    return 1\n",
    });
    const index = await buildRepoIndex(tmp);
    const mod = index.files.find((f) => f.relPath === "pkg/mod.py");
    expect(mod?.imports).toEqual(["pkg/utils.py"]);
    expect(index.dependents.get("pkg/utils.py")).toEqual(["pkg/mod.py"]);
  });

  it("解析 Python 的 from . import <name> 写法", async () => {
    await makeTree({
      "pkg/mod.py": "from . import utils\nfrom . import (a, b as bee)\n",
      "pkg/utils.py": "def helper():\n    return 1\n",
      "pkg/a.py": "A = 1\n",
      "pkg/b.py": "B = 2\n",
    });
    const index = await buildRepoIndex(tmp);
    const mod = index.files.find((f) => f.relPath === "pkg/mod.py");
    expect(mod?.imports).toEqual(["pkg/a.py", "pkg/b.py", "pkg/utils.py"]);
  });

  it("空目录返回空索引而不是抛错", async () => {
    const index = await buildRepoIndex(tmp);
    expect(index.totals).toEqual({ files: 0, lines: 0 });
    expect(index.files).toEqual([]);
    expect(index.groups).toEqual([]);
    expect(index.entryPoints).toEqual([]);
  });

  it("超过单文件上限的文件进入 sizeSkipped", async () => {
    await makeTree({ "big.ts": "x".repeat(2048), "small.ts": "ok" });
    const index = await buildRepoIndex(tmp, { maxFileBytes: 512 });
    expect(index.files.map((f) => f.relPath)).toEqual(["small.ts"]);
    expect(index.sizeSkipped).toEqual([{ relPath: "big.ts", sizeBytes: 2048 }]);
  });

  it("目录 import 缺少 index 时计入 unresolved", async () => {
    await makeTree({ "src/a.ts": 'import { x } from "./dir";\n' });
    const index = await buildRepoIndex(tmp);
    expect(index.unresolved).toBe(1);
  });

  it("只把本地且可解析的 import 计入 unresolved", async () => {
    await makeTree({
      "src/main.ts": [
        'import fs from "node:fs";', // 裸包名：外部
        'import { x } from "./missing";', // 本地缺失：计入
        'import "./style.css";', // 资源文件：不计入
      ].join("\n"),
    });
    const index = await buildRepoIndex(tmp);
    expect(index.unresolved).toBe(1);
  });

  it("识别测试文件", async () => {
    await makeTree({
      "src/a.test.ts": "export const a = 1;\n",
      "src/b.spec.ts": "export const b = 1;\n",
      "test/c.ts": "export const c = 1;\n",
      "tests/test_d.py": "def test_d():\n    assert True\n",
      "src/app.ts": "export const app = 1;\n",
    });
    const index = await buildRepoIndex(tmp);
    const tests = index.files.filter((f) => f.isTest).map((f) => f.relPath).sort();
    expect(tests).toEqual(["src/a.test.ts", "src/b.spec.ts", "test/c.ts", "tests/test_d.py"]);
  });

  it("敏感文件名被排除，但含测试密钥 fixture 的源码保留（离线索引不外发内容）", async () => {
    await makeTree({
      ".env": "TOKEN=abcdef1234567890\n",
      "service.json": '{"apiKey": "abcdef1234567890"}\n',
      "app.ts": "export const a = 1;\n",
    });
    const index = await buildRepoIndex(tmp);
    // service.json 内容像密钥，但索引只存元数据、从不外发——排除它会让
    // 含 fixture 的测试文件从影响面里消失。安全过滤留给 collectMaterials。
    expect(index.files.map((f) => f.relPath)).toEqual(["app.ts", "service.json"]);
    expect(index.sensitiveSkipped).toEqual([".env"]);
  });

  it("scanSecretContent=true 时才做内容级过滤（供需要严格模式的调用方）", async () => {
    await makeTree({
      "service.json": '{"apiKey": "abcdef1234567890"}\n',
      "app.ts": "export const a = 1;\n",
    });
    const index = await buildRepoIndex(tmp, { scanSecretContent: true });
    expect(index.files.map((f) => f.relPath)).toEqual(["app.ts"]);
    expect(index.sensitiveSkipped).toEqual(["service.json"]);
  });

  it("统计 TODO/FIXME 次数", async () => {
    await makeTree({
      "a.ts": "// TODO: one\n// FIXME: two\n// TODO: three\n",
    });
    const index = await buildRepoIndex(tmp);
    expect(index.files[0]?.todos).toBe(3);
  });
});

describe("computeImpact", () => {
  it("按层反向展开并圈定受影响测试", async () => {
    await makeTree({
      "src/c.ts": "export const c = 1;\n",
      "src/b.ts": 'import { c } from "./c.js";\n',
      "src/a.ts": 'import { b } from "./b.js";\n',
      "test/b.test.ts": 'import { b } from "../src/b.js";\n',
    });
    const index = await buildRepoIndex(tmp);

    const depth1 = computeImpact(index, ["src/c.ts"], 1);
    expect(depth1.direct).toEqual(["src/b.ts"]);
    expect(depth1.transitive).toEqual([]);

    const depth2 = computeImpact(index, ["src/c.ts"], 2);
    expect(depth2.direct).toEqual(["src/b.ts"]);
    expect(depth2.transitive.sort()).toEqual(["src/a.ts", "test/b.test.ts"]);
    expect(depth2.tests).toEqual(["test/b.test.ts"]);
  });

  it("目标文件已被删除时，仍按其他文件的 raw import 找出依赖方", async () => {
    // 模拟「暂存区里删除了 src/c.ts」：文件已不在工作区，但 b.ts 仍 import 它
    await makeTree({
      "src/b.ts": 'import { c } from "./c.js";\n',
      "test/b.test.ts": 'import { b } from "../src/b.js";\n',
    });
    const index = await buildRepoIndex(tmp);
    const impact = computeImpact(index, ["src/c.ts"], 2);
    expect(impact.targets).toEqual(["src/c.ts"]);
    expect(impact.direct).toEqual(["src/b.ts"]);
    expect(impact.transitive).toEqual(["test/b.test.ts"]);
    expect(impact.tests).toEqual(["test/b.test.ts"]);
  });

  it("自引用不会导致自己出现在依赖方里", async () => {
    await makeTree({ "src/a.ts": 'import { a } from "./a.js";\nexport const a = 1;\n' });
    const index = await buildRepoIndex(tmp);
    const impact = computeImpact(index, ["src/a.ts"], 3);
    expect(impact.direct).toEqual([]);
    expect(impact.transitive).toEqual([]);
  });

  it("循环依赖不会无限递归", async () => {
    await makeTree({
      "src/a.ts": 'import { b } from "./b.js";\n',
      "src/b.ts": 'import { a } from "./a.js";\n',
    });
    const index = await buildRepoIndex(tmp);
    const impact = computeImpact(index, ["src/a.ts"], 10);
    expect(impact.direct).toEqual(["src/b.ts"]);
    expect(impact.transitive).toEqual([]);
  });

  it("depth 为 0 时不展开", async () => {
    await makeTree({
      "src/a.ts": 'import { b } from "./b.js";\n',
      "src/b.ts": "export const b = 1;\n",
    });
    const index = await buildRepoIndex(tmp);
    expect(computeImpact(index, ["src/b.ts"], 0)).toEqual({
      targets: ["src/b.ts"],
      direct: [],
      transitive: [],
      tests: [],
    });
  });
});
