// 用法: npm run docs:check（需先 npm run build）
// 校验 CLI 真实 surface 与 README 文档一致：
// 1) 每个顶层命令在 README 里都有 `#### `repo-ai-cli <name>`` 小节；
// 2) 每个叶子命令 `<cmd> --help`（含 config/hooks 子命令）里的每个 --flag 都出现在 README 里。
// 单向检查：README 多写 prose 不报错，少写则失败。
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist", "index.js");
const README_PATH = path.join(ROOT, "README.md");

if (!existsSync(DIST)) {
  console.error("dist/index.js 不存在，请先运行 npm run build");
  process.exit(1);
}
const readme = readFileSync(README_PATH, "utf8");

function help(...args) {
  return execFileSync(process.execPath, [DIST, ...args, "--help"], {
    encoding: "utf8",
  });
}

/** 从 --help 文本的 Commands: 段解析命令名 */
function parseCommands(text) {
  const seg = text.split("Commands:")[1] ?? "";
  return [...seg.matchAll(/^ {2}(\S+)/gm)]
    .map((m) => m[1])
    .filter((n) => n && n !== "help");
}

/** 从 --help 文本的 Options: 段解析 --flag */
function parseFlags(text) {
  const seg = text.split("Options:")[1] ?? text;
  return [...seg.matchAll(/^\s+(?:-\S,\s+)?(--[\w-]+)/gm)].map((m) => m[1]);
}

const SKIP_FLAGS = new Set(["--help", "--version"]);
const GROUP_CMDS = new Set(["config", "hooks"]);

const errors = [];
const top = parseCommands(help());
for (const name of top) {
  if (!readme.includes(`#### \`repo-ai-cli ${name}\``)) {
    errors.push(`缺少小节: #### \`repo-ai-cli ${name}\``);
  }
}

const leaves = [];
for (const name of top) {
  if (GROUP_CMDS.has(name)) {
    for (const sub of parseCommands(help(name))) {
      leaves.push([name, `${name} ${sub}`]);
    }
  } else {
    leaves.push([name, name]);
  }
}

for (const [, leaf] of leaves) {
  const flags = parseFlags(help(...leaf.split(" ")));
  for (const flag of flags) {
    if (SKIP_FLAGS.has(flag)) continue;
    if (!readme.includes(flag)) {
      errors.push(`README 缺少 flag 文档: ${flag}（命令 ${leaf}）`);
    }
  }
}

if (errors.length > 0) {
  console.error(`docs:check 失败（${errors.length} 项）:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`docs:check 通过：${leaves.length} 个命令，全部小节与 flag 已文档化`);
