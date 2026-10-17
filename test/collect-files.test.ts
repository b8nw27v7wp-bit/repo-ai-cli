import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectFiles } from "../src/lib/collect-files.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "repo-ai-test-"));
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

describe("collectFiles", () => {
  it("收集源码文件并跳过 node_modules/锁文件/二进制", async () => {
    await makeTree({
      "src/index.ts": "export const a = 1;",
      "package.json": "{}",
      "node_modules/x/index.js": "ignore me",
      "package-lock.json": "{}",
      "dist/bundle.js": "ignored",
      "logo.png": "\u0000\u0000\u0000",
      "README.md": "# hi",
    });
    const files = await collectFiles(tmp);
    const rels = files.map((f) => f.relPath);
    expect(rels).toContain("src/index.ts");
    expect(rels).toContain("package.json");
    expect(rels).toContain("README.md");
    expect(rels).not.toContain("node_modules/x/index.js");
    expect(rels).not.toContain("package-lock.json");
    expect(rels).not.toContain("dist/bundle.js");
    expect(rels).not.toContain("logo.png");
  });

  it("跳过超过大小上限的文件", async () => {
    await makeTree({
      "big.ts": "x".repeat(200 * 1024),
      "small.ts": "ok",
    });
    const files = await collectFiles(tmp, { maxFileBytes: 100 * 1024 });
    expect(files.map((f) => f.relPath)).toEqual(["small.ts"]);
  });

  it("跳过非白名单扩展名", async () => {
    await makeTree({
      "a.ts": "code",
      "b.unknownext": "code",
      "c.log": "log",
    });
    const files = await collectFiles(tmp);
    expect(files.map((f) => f.relPath)).toEqual(["a.ts"]);
  });

  it("优先级: README/package.json 最高, 入口文件次之, 其余最低", async () => {
    await makeTree({
      "src/util.ts": "x",
      "src/index.ts": "x",
      "README.md": "# r",
      "package.json": "{}",
    });
    const files = await collectFiles(tmp);
    const byPath = new Map(files.map((f) => [f.relPath, f]));
    expect(byPath.get("README.md")!.priority).toBe(1);
    expect(byPath.get("package.json")!.priority).toBe(1);
    expect(byPath.get("src/index.ts")!.priority).toBe(2);
    expect(byPath.get("src/util.ts")!.priority).toBe(3);
  });

  it("非 git 仓库不报错（无 .gitignore 过滤）", async () => {
    await makeTree({ "a.ts": "code" });
    const files = await collectFiles(tmp);
    expect(files).toHaveLength(1);
  });

  it("空目录/全过滤时返回空数组", async () => {
    await makeTree({ "a.png": "\u0000" });
    const files = await collectFiles(tmp);
    expect(files).toHaveLength(0);
  });

  it("跳过敏感文件名并经 onSensitiveSkipped 上报", async () => {
    await makeTree({
      ".env": "K=1\n",
      ".env.local": "K=1\n",
      "config.env": "TOKEN=1\n",
      "id_rsa": "PRIVATE\n",
      "cert.pem": "x\n",
      "app.ts": "export const a = 1;",
    });
    const skipped: string[] = [];
    const files = await collectFiles(tmp, {
      onSensitiveSkipped: (rel) => skipped.push(rel),
    });
    expect(files.map((f) => f.relPath)).toEqual(["app.ts"]);
    expect([...skipped].sort()).toEqual(
      [".env", ".env.local", "cert.pem", "config.env", "id_rsa"].sort(),
    );
  });

  it(".env.example 公开模板不算敏感跳过", async () => {
    await makeTree({ ".env.example": "K=YOUR_KEY_HERE\n" });
    const skipped: string[] = [];
    const files = await collectFiles(tmp, {
      onSensitiveSkipped: (rel) => skipped.push(rel),
    });
    // 既不能进敏感名单，也不能被 isSourceName 静默丢掉（example 后缀不在白名单）
    expect(skipped).toEqual([]);
    expect(files.map((f) => f.relPath)).toEqual([".env.example"]);
  });

  it("跳过含明文密钥的文件并经回调上报", async () => {
    await makeTree({
      // YAML 无引号赋值（generic-assignment 抓不到这种）
      "settings.yaml": "password: hunter2secret\n",
      // JSON 键自带引号
      "service.json": '{"apiKey": "abcdef1234567890"}\n',
      "app.ts": "export const a = 1;",
    });
    const skipped: string[] = [];
    const files = await collectFiles(tmp, {
      onSensitiveSkipped: (rel) => skipped.push(rel),
    });
    expect(files.map((f) => f.relPath)).toEqual(["app.ts"]);
    expect([...skipped].sort()).toEqual(["service.json", "settings.yaml"]);
  });

  it("连字符值只有每段都是纯字母时才按人写词组放行", async () => {
    await makeTree({
      // 全字母词组：放行（错杀源码的代价高于 AI 少看一个文件）
      "phrase.yaml": [
        "password: new-password",
        "token: use-environment-variable",
        "secret: abc-def-ghi-jklmno", // 纯字母真密钥仍会漏，见「已知局限」
      ].join("\n"),
      // 「词组前缀 + 随机段」是常见密钥格式，必须拦下
      "leak.json": '{"apiKey": "sk-live-9f3a2b7c1d4e5f60"}\n',
      "app.ts": "export const a = 1;",
    });
    const skipped: string[] = [];
    const files = await collectFiles(tmp, {
      onSensitiveSkipped: (rel) => skipped.push(rel),
    });
    expect(files.map((f) => f.relPath)).toEqual(["app.ts", "phrase.yaml"]);
    expect(skipped).toEqual(["leak.json"]);
  });

  it("不误杀代码引用、测试桩与文件名含 secret 的源码", async () => {
    await makeTree({
      "lib.ts": [
        "const apiKey = options.apiKey;", // 属性访问
        "const token = committedToken;", // camelCase 标识符
        "const password = process.env.DB_PASS;", // 代码引用
        "const secret = _internal_secret;", // 下划线标识符
        "const key = not-the-token;", // 测试桩词组
      ].join("\n"),
      "Panel.vue": '<template><K :token="committedToken" /></template>\n',
      "scan-secrets.ts": "export const p = 1;\n",
      "useTokens.ts": "export const q = 1;\n",
    });
    const files = await collectFiles(tmp);
    const rels = files.map((f) => f.relPath);
    expect(rels).toContain("lib.ts");
    expect(rels).toContain("Panel.vue");
    expect(rels).toContain("scan-secrets.ts");
    expect(rels).toContain("useTokens.ts");
  });

  it("不传回调时敏感文件照样被跳过且不报错", async () => {
    await makeTree({
      "config.env": "TOKEN=1\n",
      "app.ts": "export const a = 1;",
    });
    const files = await collectFiles(tmp);
    expect(files.map((f) => f.relPath)).toEqual(["app.ts"]);
  });
});
