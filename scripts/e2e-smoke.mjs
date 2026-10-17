// 用法: npm run e2e（需先 npm run build）
//
// 在**构建产物**（dist/index.js）上跑一条固定命令序列，断言退出码与关键输出。
//
// 为什么不放进单元测试：单测 import 的是 src 里的函数，抓不到「命令注册漏了 / option
// 名字写错 / 退出码接反」这类只有真正起进程才会暴露的问题；而这类问题恰恰是本仓库
// 历史上出过的（secrets --json 缺退出码、changelog 非法 --format 多打一行）。
//
// 全程离线、不读用户的 ~/.repo-ai/config.json（HOME 指向临时目录）、不读任何
// provider 的环境变量（按 *_API_KEY / LLM_* 清空），所以结果与跑它的机器无关。
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "dist", "index.js");

if (!existsSync(CLI)) {
  console.error("dist/index.js 不存在，请先运行 npm run build");
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));

/** 临时工作区：隔离 HOME，避免读到真实配置 */
const work = mkdtempSync(path.join(tmpdir(), "repo-ai-e2e-"));
const home = path.join(work, "home");
mkdirSync(home, { recursive: true });

/** 干净的小项目（供 readme --dry-run / stats 用） */
const demo = path.join(work, "demo");
mkdirSync(path.join(demo, "src"), { recursive: true });
writeFileSync(path.join(demo, "package.json"), '{\n  "name": "demo",\n  "version": "1.0.0"\n}\n');
writeFileSync(path.join(demo, "README.md"), "# demo\n\nA tiny demo project.\n");
writeFileSync(path.join(demo, "src", "index.ts"), "export const add = (a: number, b: number) => a + b;\n");

/** 带提交的 git 仓库（供 changelog / hooks 用） */
const repo = path.join(work, "repo");
mkdirSync(repo, { recursive: true });
const gitId = ["-c", "user.name=E2E", "-c", "user.email=e2e@test.com"];
function git(args, cwd = repo) {
  const r = spawnSync("git", [...gitId, ...args], { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
}
git(["init", "-b", "main"]);
writeFileSync(path.join(repo, "a.ts"), "export const a = 1;\n");
git(["add", "."]);
git(["commit", "-m", "feat: initial commit"]);
writeFileSync(path.join(repo, "b.ts"), "export const b = 2;\n");
git(["add", "."]);
git(["commit", "-m", "fix: correct b"]);

/** 含明文密钥的目录（供 secrets 命中用例） */
const dirty = path.join(work, "dirty");
mkdirSync(dirty, { recursive: true });
writeFileSync(path.join(dirty, "key.txt"), `token = "AKIA${"C".repeat(16)}"\n`);

/**
 * 本地假 LLM 端点。
 *
 * 有了它，「AI 命令」这条链路也能进离线基线：无需真实 key、不出网，
 * 还能看到工具**实际发出去了什么**（temperature / max_tokens 是否采纳了配置）。
 * 没有它，配置里的 temperature / maxOutputTokens 只能靠人肉读代码确认。
 */
const CANNED_README = "# demo\n\nA tiny demo project.\n\n## Features\n\n- `add(a, b)`\n";
let lastRequest = null;
const server = createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    try {
      lastRequest = { url: req.url, body: JSON.parse(raw) };
    } catch {
      lastRequest = { url: req.url, body: null };
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        choices: [{ message: { content: CANNED_README } }],
        usage: { prompt_tokens: 111, completion_tokens: 22, total_tokens: 133 },
      }),
    );
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const llmPort = server.address().port;
const LLM_ENV = {
  LLM_BASE_URL: `http://127.0.0.1:${llmPort}/v1`,
  LLM_API_KEY: "sk-e2e",
};

function isolatedEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.endsWith("_API_KEY") || key.startsWith("LLM_")) delete env[key];
  }
  env.HOME = home;
  env.USERPROFILE = home; // Windows 下 os.homedir() 读这个
  delete env.REPO_AI_VERBOSE;
  return env;
}

const failures = [];
let passed = 0;

/**
 * 跑一条命令并断言。
 *
 * 用异步 execFile 而不是 spawnSync：假 LLM 端点跑在本进程里，spawnSync 会阻塞事件循环，
 * 子进程发来的 HTTP 请求永远等不到响应，直接死锁。（这个坑第一次跑就撞上了。）
 *
 * @param {string} name 用例名（失败时打印）
 * @param {string[]} argv 传给 CLI 的参数
 * @param {{cwd?: string, code?: number, out?: string[], err?: string[], env?: Record<string,string>, json?: (o:any)=>void}} expect
 */
async function step(name, argv, expect = {}) {
  const cwd = expect.cwd ?? demo;
  let stdout = "";
  let stderr = "";
  let status = 0;
  try {
    const res = await execFileAsync(process.execPath, [CLI, ...argv], {
      cwd,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      env: { ...isolatedEnv(), ...(expect.env ?? {}) },
    });
    stdout = res.stdout;
    stderr = res.stderr;
  } catch (err) {
    status = typeof err.code === "number" ? err.code : 1;
    stdout = err.stdout ?? "";
    stderr = err.stderr ?? "";
  }
  const problems = [];

  const wantCode = expect.code ?? 0;
  if (status !== wantCode) {
    problems.push(`退出码 ${status}，期望 ${wantCode}`);
  }
  for (const frag of expect.out ?? []) {
    if (!stdout.includes(frag)) problems.push(`stdout 缺少 ${JSON.stringify(frag)}`);
  }
  for (const frag of expect.err ?? []) {
    if (!stderr.includes(frag)) problems.push(`stderr 缺少 ${JSON.stringify(frag)}`);
  }
  if (expect.json) {
    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      problems.push(`stdout 不是合法 JSON: ${stdout.slice(0, 120)}`);
    }
    if (parsed !== undefined) {
      try {
        expect.json(parsed);
      } catch (err) {
        problems.push(`JSON 断言失败: ${err.message}`);
      }
    }
  }

  if (problems.length > 0) {
    failures.push(
      `${name}\n    $ repo-ai-cli ${argv.join(" ")}\n    - ${problems.join("\n    - ")}\n` +
        `    stdout: ${stdout.trim().slice(0, 200)}\n    stderr: ${stderr.trim().slice(0, 200)}`,
    );
  } else {
    passed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ── 顶层表面 ──────────────────────────────────────────────────────────────
await step("--version 输出版本号", ["--version"], { out: [pkg.version] });

await step("--help 列出全部 24 条命令", ["--help"], {
  out: [
    "24 commands",
    "readme",
    "review-pr",
    "config",
    "contributing",
  ],
});

// ── 离线命令 ──────────────────────────────────────────────────────────────
await step("stats --json 输出合法 JSON", ["stats", demo, "--json"], {
  json: (o) => {
    assert(o.ok === true, "ok 应为 true");
    assert(o.files > 0, "files 应大于 0");
  },
});

await step("secrets 在干净目录上通过", ["secrets", demo, "--json"], {
  json: (o) => assert(o.count === 0, `count 应为 0，实际 ${o.count}`),
});

await step("secrets 命中时退出码 1（CI 门禁依赖）", ["secrets", dirty, "--json"], {
  code: 1,
  json: (o) => {
    assert(o.ok === false, "ok 应为 false");
    assert(o.count > 0, "count 应大于 0");
  },
});

await step("gitignore 生成 .gitignore 内容", ["gitignore", "node", "--json"], {
  json: (o) => assert(o.content.includes("node_modules"), "content 应含 node_modules"),
});

await step("license 落盘到指定路径", ["license", "mit", "--name", "E2E", "--year", "2026", "-o", path.join(work, "LICENSE"), "--json"], {
  json: (o) => {
    assert(o.holder === "E2E", "holder 应为 E2E");
    const body = readFileSync(o.output, "utf8");
    assert(body.includes("E2E") && body.includes("2026"), "LICENSE 应含署名与年份");
  },
});

await step("contributing 落盘", ["contributing", "-o", path.join(work, "CONTRIBUTING.md"), "--json"], {
  json: (o) => assert(existsSync(o.output), "文件应已写入"),
});

await step("badges --json 产出徽章", ["badges", "--json"], {
  json: (o) => assert(o.badges > 0, "badges 应大于 0"),
});

await step("config list --json", ["config", "list", "--json"], {
  json: (o) => assert(o.active === "default", "active 应为 default"),
});

await step("hooks list 在 git 仓库内可读", ["hooks", "list", "--json"], {
  cwd: repo,
  json: (o) => assert(Array.isArray(o.hooks) && o.hooks.length > 0, "hooks 应为非空数组"),
});

await step("init 生成项目骨架", ["init", path.join(work, "newproj"), "--json"], {
  json: (o) => {
    assert(o.created.includes("package.json"), "created 应含 package.json");
    assert(existsSync(path.join(o.directory, "package.json")), "package.json 应已落盘");
  },
});

await step("changelog --format compact 本地渲染（不调 LLM）", ["changelog", "--format", "compact", "--print", "--max-commits", "2", "--json"], {
  cwd: repo,
  json: (o) => assert(o.ok === true, "ok 应为 true"),
});

// ── 参数改名（P0-2）：新名生效、旧名可用并告警 ────────────────────────────────
await step("--budget-tokens 生效", ["readme", demo, "--dry-run", "--budget-tokens", "6000", "--json"], {
  json: (o) => assert(o.budget === 6000, `budget 应为 6000，实际 ${o.budget}`),
});

await step("--max-tokens 旧名仍生效并打废弃警告", ["readme", demo, "--dry-run", "--max-tokens", "5000", "--json"], {
  err: ["--max-tokens 已废弃", "--budget-tokens"],
  json: (o) => assert(o.budget === 5000, `budget 应为 5000，实际 ${o.budget}`),
});

await step("--max-commits 旧名 --max 仍生效并打废弃警告", ["changelog", "--format", "compact", "--print", "--max", "1"], {
  cwd: repo,
  err: ["--max 已废弃", "--max-commits"],
});

// ── 配置默认值真正生效（v0.9 P0-1） ────────────────────────────────────────
// 五个数值键此前是只写键：保存成功、config list 显示，但没有命令读取。
// 这里从「写进隔离 HOME 的配置文件」到「命令实际采纳」走一遍完整链路，
// 其中 temperature / maxOutputTokens / maxDiffKb 靠假 LLM 端点与截断标志观测。
mkdirSync(path.join(home, ".repo-ai"), { recursive: true });
writeFileSync(
  path.join(home, ".repo-ai", "config.json"),
  JSON.stringify(
    { maxTokens: 6000, maxOutputTokens: 2222, temperature: 1.5, maxDiffKb: 12 },
    null,
    2,
  ),
);

// 造一个超过 12KB 的暂存改动，让 maxDiffKb 是否生效变成可观测的 truncated 标志
writeFileSync(path.join(repo, "big.ts"), `export const big = "${"x".repeat(20 * 1024)}";\n`);
git(["add", "big.ts"]);

await step("config list 能读回写入的配置", ["config", "list", "--json"], {
  json: (o) => {
    assert(o.profiles.default.maxTokens === 6000, "maxTokens 应为 6000");
    assert(o.profiles.default.maxDiffKb === 12, "maxDiffKb 应为 12");
  },
});

await step("配置里的 maxTokens 被 readme 采纳（此前是只写键）", ["readme", demo, "--dry-run", "--json"], {
  json: (o) => assert(o.budget === 6000, `budget 应为 6000，实际 ${o.budget}`),
});

await step("显式 --budget-tokens 盖过配置", ["readme", demo, "--dry-run", "--budget-tokens", "7000", "--json"], {
  json: (o) => assert(o.budget === 7000, `budget 应为 7000，实际 ${o.budget}`),
});

await step("显式值恰好等于内置默认时也不能被配置盖掉", ["readme", demo, "--dry-run", "--budget-tokens", "48000", "--json"], {
  json: (o) => assert(o.budget === 48000, `budget 应为 48000，实际 ${o.budget}`),
});

await step("废弃旧名 + 配置同时存在时，旧名的值不被配置静默盖掉", ["readme", demo, "--dry-run", "--max-tokens", "9000", "--json"], {
  err: ["--max-tokens 已废弃"],
  json: (o) => assert(o.budget === 9000, `budget 应为 9000，实际 ${o.budget}`),
});

await step("配置里的 maxDiffKb 被 review 采纳（20KB diff 被截到 12KB）", ["review", "--json"], {
  cwd: repo,
  env: LLM_ENV,
  json: (o) => {
    assert(o.ok === true, "ok 应为 true");
    assert(o.truncated === true, "20KB 的 diff 在 maxDiffKb=12 下应被截断");
  },
});

await step("显式 --max-diff-kb 盖过配置（不再截断）", ["review", "--json", "--max-diff-kb", "200"], {
  cwd: repo,
  env: LLM_ENV,
  json: (o) => assert(o.truncated === false, "预算放大后不应截断"),
});

// ── LLM 链路（假端点，离线） ───────────────────────────────────────────────
const generated = path.join(work, "generated-README.md");
await step("readme 走完整 LLM 链路并落盘", ["readme", demo, "-o", generated, "--json"], {
  env: LLM_ENV,
  json: (o) => {
    assert(o.ok === true, "ok 应为 true");
    assert(existsSync(generated), "README 应已落盘");
  },
});

await step("请求体采纳配置里的 temperature 与 maxOutputTokens", ["readme", demo, "-o", generated, "--json"], {
  env: LLM_ENV,
  json: () => {
    assert(lastRequest !== null, "假端点未收到请求");
    assert(
      lastRequest.body.temperature === 1.5,
      `temperature 应为配置里的 1.5，实际 ${lastRequest.body.temperature}`,
    );
    assert(
      lastRequest.body.max_tokens === 2222,
      `max_tokens 应为配置里的 2222，实际 ${lastRequest.body.max_tokens}`,
    );
  },
});

await step("显式 --temperature 盖过配置", ["readme", demo, "-o", generated, "--json", "--temperature", "0.1"], {
  env: LLM_ENV,
  json: () => assert(lastRequest.body.temperature === 0.1, `temperature 应为 0.1，实际 ${lastRequest.body.temperature}`),
});

await step("非 JSON 模式把 token 用量汇总打到 stderr", ["readme", demo, "-o", generated], {
  env: LLM_ENV,
  err: ["token 用量: 输入 111 / 输出 22 / 合计 133"],
});

await step("JSON 模式把用量并入 usage 字段且不打 stderr", ["readme", demo, "-o", generated, "--json"], {
  env: LLM_ENV,
  json: (o) => {
    assert(o.usage !== null && o.usage !== undefined, "usage 不应为 null");
    assert(o.usage.promptTokens === 111, `promptTokens 应为 111，实际 ${o.usage.promptTokens}`);
    assert(o.usage.totalTokens === 133, `totalTokens 应为 133，实际 ${o.usage.totalTokens}`);
  },
});

// ── AI 命令的失败路径（无 key，不触网） ─────────────────────────────────────
const noKeyReadme = path.join(work, "should-not-exist.md");
await step("无 key 时给出三条可行动作且退出码 1", ["readme", demo, "-o", noKeyReadme], {
  code: 1,
  err: ["未检测到任何 LLM API Key", "DEEPSEEK_API_KEY", "ollama", "LLM_BASE_URL", "doctor"],
});
assert(!existsSync(noKeyReadme), "无 key 时不应写出任何文件");

await step("非法 PR 引用在发请求前就失败", ["review-pr", "not-a-pr", "--json"], {
  code: 1,
  json: (o) => assert(o.ok === false, "ok 应为 false"),
});

await step("非法 --focus 报错且退出码 1", ["review", "--focus", "banana", "--json"], {
  cwd: repo,
  code: 1,
  json: (o) => assert(o.ok === false, "ok 应为 false"),
});

// ── 收尾 ──────────────────────────────────────────────────────────────────
server.close();
rmSync(work, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`\n✖ e2e 冒烟失败：${failures.length} 项\n`);
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}
console.log(`✓ e2e 冒烟通过：${passed} 项（dist 级，全程离线，含假 LLM 端点）`);
