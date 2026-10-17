import { promises as fs } from "node:fs";
import path from "node:path";
import { intro } from "@clack/prompts";
import { buildRepoIndex } from "../lib/repo-index.js";
import { scanSecrets } from "../lib/scan-secrets.js";
import { readDeps } from "../lib/deps.js";
import { npmAudit, npmOutdated } from "../lib/npm-checks.js";
import type { CheckResult } from "../lib/doctor.js";
import {
  interactive,
  setJsonMode,
  isJsonMode,
  emitJson,
  done,
  fail,
  progress,
} from "../lib/ui.js";
import type { HealthOptions } from "../types.js";

/** 单文件分析上限（与 repo-index / secrets 的默认一致） */
const MAX_FILE_KB = 200;

async function existsAny(dir: string, names: string[]): Promise<string | null> {
  for (const name of names) {
    try {
      await fs.access(path.join(dir, name));
      return name;
    } catch {
      /* 继续找下一个候选 */
    }
  }
  return null;
}

/**
 * 三态读取 package.json。
 *
 * 不能用「null = 没有」一把梭：文件存在但 JSON 坏掉时，健康检查若当成
 * 「非 Node 项目」跳过，就会漏掉一个真正会让 npm publish 失败的问题。
 */
type PackageJsonResult =
  | { kind: "missing" }
  | { kind: "invalid"; error: string }
  | { kind: "ok"; pkg: Record<string, unknown> };

async function readPackageJson(dir: string): Promise<PackageJsonResult> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(dir, "package.json"), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { kind: "missing" };
    return { kind: "invalid", error: (err as Error).message };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { kind: "invalid", error: "顶层不是 JSON 对象" };
    }
    return { kind: "ok", pkg: parsed as Record<string, unknown> };
  } catch (err) {
    return { kind: "invalid", error: (err as Error).message };
  }
}

const COMMUNITY_FILES: Array<{
  id: string;
  name: string;
  candidates: string[];
  status: "fail" | "warn";
  fix: string;
}> = [
  {
    id: "readme",
    name: "README",
    candidates: ["README.md", "README.markdown", "README.txt", "README", "readme.md"],
    status: "fail",
    fix: "repo-ai-cli readme .",
  },
  {
    id: "license",
    name: "LICENSE",
    candidates: ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENSE-MIT", "LICENSE-APACHE"],
    status: "fail",
    fix: "repo-ai-cli license mit",
  },
  {
    id: "gitignore",
    name: ".gitignore",
    candidates: [".gitignore"],
    status: "warn",
    fix: "repo-ai-cli gitignore node",
  },
  {
    id: "contributing",
    name: "CONTRIBUTING",
    candidates: ["CONTRIBUTING.md", "CONTRIBUTING", "docs/CONTRIBUTING.md"],
    status: "warn",
    fix: "repo-ai-cli contributing",
  },
  {
    id: "changelog",
    name: "CHANGELOG",
    candidates: ["CHANGELOG.md", "CHANGELOG", "CHANGES.md", "HISTORY.md"],
    status: "warn",
    fix: "repo-ai-cli changelog",
  },
];

/**
 * repo-ai health — 仓库健康审计（离线；`--network` 才跑依赖检查）。
 *
 * 与 doctor 的分工：doctor 检查「本机与工具是否就绪」（Node/git/配置/key/代理），
 * health 检查「仓库本身是否健康」（社区文件/CI/测试/元数据/密钥/依赖）。
 * 刻意不合成 0–100 分：权重无法服众，只会制造假精度。
 */
export async function runHealth(options: HealthOptions): Promise<void> {
  setJsonMode(options.json === true);
  if (interactive && !isJsonMode()) intro("repo-ai health");

  const target = options.target || ".";
  const dir = path.resolve(target);
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) {
      fail(`请传目录: ${target}`);
      return;
    }
  } catch {
    fail(`路径不存在: ${target}`);
    return;
  }

  const p = progress("检查仓库...");
  const checks: CheckResult[] = [];

  // 1. 社区文件
  for (const spec of COMMUNITY_FILES) {
    const found = await existsAny(dir, spec.candidates);
    checks.push(
      found
        ? {
            id: spec.id,
            name: spec.name,
            status: "ok",
            detail: found,
          }
        : {
            id: spec.id,
            name: spec.name,
            status: spec.status,
            detail: "缺失",
            fix: spec.fix,
          },
    );
  }

  // 2. CI
  let workflows: string[] = [];
  try {
    workflows = (await fs.readdir(path.join(dir, ".github", "workflows"))).filter(
      (f) => /\.ya?ml$/i.test(f),
    );
  } catch {
    /* 目录不存在 */
  }
  checks.push(
    workflows.length > 0
      ? {
          id: "ci",
          name: "CI workflow",
          status: "ok",
          detail: `.github/workflows（${workflows.length} 个）`,
        }
      : {
          id: "ci",
          name: "CI workflow",
          status: "warn",
          detail: "未找到 .github/workflows/*.yml",
          fix: "添加 GitHub Actions workflow，或把现有 CI 配置接入仓库",
        },
  );

  // 3. 索引派生项：测试文件 / 大文件 / TODO
  p.update("扫描文件与依赖...");
  const index = await buildRepoIndex(dir, { maxFileBytes: MAX_FILE_KB * 1024 });
  const testFiles = index.files.filter((f) => f.isTest);
  checks.push(
    testFiles.length > 0
      ? {
          id: "tests",
          name: "测试",
          status: "ok",
          detail: `${testFiles.length} 个测试文件`,
        }
      : {
          id: "tests",
          name: "测试",
          status: "warn",
          detail: "未发现测试文件",
          fix: "repo-ai-cli test <file> 生成单元测试，或先补测试目录",
        },
  );

  checks.push(
    index.sizeSkipped.length > 0
      ? {
          id: "large-files",
          name: "大文件",
          status: "warn",
          detail:
            `${index.sizeSkipped.length} 个文件超过 ${MAX_FILE_KB}KB，不会被 AI 分析` +
            `（前 3: ${index.sizeSkipped.slice(0, 3).map((s) => s.relPath).join(", ")}）`,
          fix: "拆分大文件，或在使用 AI 命令时调大 --max-file-kb",
        }
      : {
          id: "large-files",
          name: "大文件",
          status: "ok",
          detail: `没有超过 ${MAX_FILE_KB}KB 的分析文件`,
        },
  );

  const todoCount = index.files.reduce((n, f) => n + f.todos, 0);
  checks.push({
    id: "todos",
    name: "TODO / FIXME",
    status: "ok",
    detail: `${todoCount} 处`,
  });

  // 4. package.json 元数据
  const pkg = await readPackageJson(dir);
  if (pkg.kind === "missing") {
    checks.push({
      id: "package-meta",
      name: "包元数据",
      status: "ok",
      detail: "未检测到 package.json（非 Node 项目，跳过）",
    });
  } else if (pkg.kind === "invalid") {
    checks.push({
      id: "package-meta",
      name: "包元数据",
      status: "fail",
      detail: `package.json 无法解析: ${pkg.error}`,
      fix: "修复 package.json 的 JSON 语法（npm publish / install 都会失败）",
    });
  } else {
    const fields: Array<[string, unknown]> = [
      ["name", pkg.pkg.name],
      ["description", pkg.pkg.description],
      ["keywords", pkg.pkg.keywords],
      ["repository", pkg.pkg.repository],
      ["engines", pkg.pkg.engines],
      ["license", pkg.pkg.license],
    ];
    const missing = fields
      .filter(([, v]) => v === undefined || v === "" || (Array.isArray(v) && v.length === 0))
      .map(([k]) => k);
    checks.push(
      missing.length === 0
        ? {
            id: "package-meta",
            name: "包元数据",
            status: "ok",
            detail: "name / description / keywords / repository / engines / license 齐全",
          }
        : {
            id: "package-meta",
            name: "包元数据",
            status: "warn",
            detail: `package.json 缺少: ${missing.join(", ")}`,
            fix: "补齐 package.json 字段（npm 页面与依赖解析都依赖它们）",
          },
    );
  }

  // 5. 依赖清单（离线解析，不发请求）
  try {
    const deps = await readDeps(dir);
    const prod = Object.keys(deps.dependencies).length;
    const dev = Object.keys(deps.devDependencies).length;
    checks.push({
      id: "deps",
      name: "依赖清单",
      status: "ok",
      detail: `${deps.manifest}（dependencies ${prod} / devDependencies ${dev}）`,
    });
  } catch {
    checks.push(
      pkg.kind === "invalid"
        ? {
            id: "deps",
            name: "依赖清单",
            status: "warn",
            detail: "package.json 无法解析，跳过依赖清单",
            fix: "先修复 package.json",
          }
        : {
            id: "deps",
            name: "依赖清单",
            status: "ok",
            detail: "未检测到受支持的清单（package.json / requirements.txt）",
          },
    );
  }

  // 6. 密钥扫描（只报数量，绝不打印命中值）
  p.update("扫描疑似密钥...");
  const findings = await scanSecrets(dir, { maxFileBytes: MAX_FILE_KB * 1024 });
  const critical = findings.filter((f) => f.severity === "critical").length;
  const high = findings.filter((f) => f.severity === "high").length;
  const medium = findings.filter((f) => f.severity === "medium").length;
  checks.push(
    critical + high > 0
      ? {
          id: "secrets",
          name: "疑似密钥",
          status: "fail",
          detail: `critical ${critical} / high ${high} / medium ${medium}`,
          fix: "repo-ai-cli secrets . --severity high，然后移除密钥并改用环境变量",
        }
      : medium > 0
        ? {
            id: "secrets",
            name: "疑似密钥",
            status: "warn",
            detail: `critical 0 / high 0 / medium ${medium}（可能是测试 fixture）`,
            fix: "repo-ai-cli secrets . --severity medium 查看详情",
          }
        : {
            id: "secrets",
            name: "疑似密钥",
            status: "ok",
            detail: "未发现",
          },
  );

  // 7. 可选网络检查
  if (options.network) {
    p.update("检查依赖更新与漏洞（联网）...");
    if (pkg.kind !== "ok") {
      checks.push({
        id: "deps-network",
        name: "依赖安全",
        status: "warn",
        detail:
          pkg.kind === "missing"
            ? "没有 package.json，跳过 npm outdated / audit"
            : "package.json 无法解析，跳过 npm outdated / audit",
        fix: pkg.kind === "missing" ? "非 Node 项目可忽略此项" : "先修复 package.json",
      });
    } else {
      const outdated = await npmOutdated(dir);
      checks.push(
        outdated.error
          ? {
              id: "deps-outdated",
              name: "依赖更新",
              status: "warn",
              detail: outdated.error,
              fix: "确认 node_modules 已安装后重试（npm install）",
            }
          : outdated.entries.length > 0
            ? {
                id: "deps-outdated",
                name: "依赖更新",
                status: "warn",
                detail: `${outdated.entries.length} 个依赖有新版本`,
                fix: "repo-ai-cli deps --outdated",
              }
            : {
                id: "deps-outdated",
                name: "依赖更新",
                status: "ok",
                detail: "全部依赖均为最新",
              },
      );

      const audit = await npmAudit(dir);
      const s = audit.summary;
      checks.push(
        audit.error
          ? {
              id: "deps-audit",
              name: "依赖漏洞",
              status: "warn",
              detail: audit.error,
              fix: "确认 node_modules 已安装后重试（npm install）",
            }
          : s.critical + s.high > 0
            ? {
                id: "deps-audit",
                name: "依赖漏洞",
                status: "fail",
                detail: `critical ${s.critical} / high ${s.high} / moderate ${s.moderate} / low ${s.low}`,
                fix: "npm audit fix，或参考 repo-ai-cli deps --audit",
              }
            : s.total > 0
              ? {
                  id: "deps-audit",
                  name: "依赖漏洞",
                  status: "warn",
                  detail: `moderate ${s.moderate} / low ${s.low}`,
                  fix: "repo-ai-cli deps --audit 查看详情",
                }
              : {
                  id: "deps-audit",
                  name: "依赖漏洞",
                  status: "ok",
                  detail: "未发现已知漏洞",
                },
      );
    }
  }

  p.stop();

  const summary = {
    ok: checks.filter((c) => c.status === "ok").length,
    warn: checks.filter((c) => c.status === "warn").length,
    fail: checks.filter((c) => c.status === "fail").length,
  };
  const failed =
    summary.fail > 0 || (options.strict === true && summary.warn > 0);
  if (failed) process.exitCode = 1;

  if (isJsonMode()) {
    emitJson({
      ok: !failed,
      strict: options.strict === true,
      network: options.network === true,
      checks,
      summary,
    });
    return;
  }

  const icon: Record<CheckResult["status"], string> = {
    ok: "✓",
    warn: "!",
    fail: "✗",
  };
  for (const c of checks) {
    console.log(`[${icon[c.status]}] ${c.name}: ${c.detail}`);
  }
  const fixes = checks.filter((c) => c.fix);
  if (fixes.length > 0) {
    console.log("\n建议:");
    for (const c of fixes) console.log(`  - ${c.name}: ${c.fix}`);
  }
  console.log(
    `\n汇总: ${summary.ok} 通过 / ${summary.warn} 警告 / ${summary.fail} 失败` +
      (options.strict ? "（--strict：警告也算失败）" : ""),
  );

  // 失败时不再打 ✓ 结尾，避免「勾 + 未通过」的语义冲突；退出码已经说明结果
  if (!failed) done("健康检查完成");
}
