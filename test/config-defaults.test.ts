import { describe, it, expect, vi, afterEach } from "vitest";
import { Command } from "commander";
import { resolveNumber } from "../src/cli/shared.js";
import { intOption } from "../src/lib/options.js";

/**
 * 「CLI 参数 > 配置文件 > 内置默认」三层规则（v0.9 P0-1）。
 *
 * 这条规则此前只覆盖了 provider 四件套，`config set maxTokens | maxFileKb |
 * maxDiffKb | maxOutputTokens | temperature` 是只写键——保存成功、`config list`
 * 显示、但没有任何命令读取。这里把语义固定下来。
 *
 * 关键点：commander 会给带默认值的 option 填上值，所以 `opts[key]` 永远有值，
 * 必须靠 getOptionValueSource 区分「用户传了 48000」与「默认就是 48000」。
 * 下面的用例全部走真实 Command 解析，而不是直接调函数传参——这个区分只有真解析才测得出来。
 */

/** 造一条带 --budget-tokens（默认 48000）的命令，返回解析出的最终值 */
function resolve(argv: string[], cfgValue?: number): number {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} });

  let resolved = -1;
  program
    .command("readme")
    .option("--budget-tokens <n>", "token budget", intOption(), 48000)
    .action((opts: Record<string, unknown>, cmd: Command) => {
      resolved = resolveNumber(cmd, opts, "budgetTokens", cfgValue);
    });

  program.parse(["node", "cli", "readme", ...argv]);
  return resolved;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveNumber: 三层取值", () => {
  it("用户显式给出时用 CLI 值", () => {
    expect(resolve(["--budget-tokens", "9000"], 8000)).toBe(9000);
  });

  it("用户没给、配置有值时用配置值（这正是此前失效的场景）", () => {
    expect(resolve([], 8000)).toBe(8000);
  });

  it("用户没给、配置也没有时用内置默认", () => {
    expect(resolve([])).toBe(48000);
  });

  it("配置值与内置默认相同时仍以配置为准（不是巧合）", () => {
    expect(resolve([], 48000)).toBe(48000);
  });

  it("用户显式传的值恰好等于内置默认时，不被配置覆盖", () => {
    // 这条是 getOptionValueSource 存在的意义：48000 到底是用户传的还是默认的，
    // 只看 opts 是分不出来的
    expect(resolve(["--budget-tokens", "48000"], 8000)).toBe(48000);
  });

  it("配置值为 0 时不被 ?? 当假值跳过", () => {
    // ?? 只对 null/undefined 回退，0 是有效值——temperature 0 是合法输入
    expect(resolve([], 0)).toBe(0);
  });
});
