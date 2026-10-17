// 用法: npm run coverage:report（需先 npm run coverage 生成 coverage/coverage-summary.json）
//
// 覆盖率数字本身不告诉你要补什么，「哪几个文件最低」才告诉。
// 这个脚本按行覆盖率升序排出最低的 N 个文件，并标出零覆盖的文件——
// v0.8 起草时是靠 ls src/lib 与 ls test 人肉比对找测试缺口的，这份输出就是那个动作的自动化。
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUMMARY = path.join(ROOT, "coverage", "coverage-summary.json");

if (!existsSync(SUMMARY)) {
  console.error("coverage/coverage-summary.json 不存在，请先运行 npm run coverage");
  process.exit(1);
}

const LIMIT = Number(process.argv[2] ?? 15);
const summary = JSON.parse(readFileSync(SUMMARY, "utf8"));

const rows = Object.entries(summary)
  .filter(([key]) => key !== "total")
  .map(([file, v]) => ({
    file: path.relative(ROOT, file).replaceAll("\\", "/"),
    lines: v.lines.pct,
    branches: v.branches.pct,
    functions: v.functions.pct,
    uncovered: v.lines.total - v.lines.covered,
  }))
  .sort((a, b) => a.lines - b.lines || a.file.localeCompare(b.file));

const total = summary.total;
console.log(
  `总体：行 ${total.lines.pct}% / 分支 ${total.branches.pct}% / 函数 ${total.functions.pct}% / 语句 ${total.statements.pct}%`,
);
console.log(`\n行覆盖率最低的 ${LIMIT} 个文件：`);
console.log("    行%   分支%   函数%   未覆盖行  文件");
for (const r of rows.slice(0, LIMIT)) {
  console.log(
    `${String(r.lines).padStart(6)} ${String(r.branches).padStart(6)} ${String(r.functions).padStart(6)} ` +
      `${String(r.uncovered).padStart(10)}  ${r.file}`,
  );
}

const zero = rows.filter((r) => r.lines === 0);
if (zero.length > 0) {
  console.log(`\n零覆盖文件（${zero.length} 个）：`);
  for (const r of zero) console.log(`  ${r.file}`);
}
