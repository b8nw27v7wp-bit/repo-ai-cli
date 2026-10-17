import { describe, it, expect, vi, afterEach } from "vitest";
import { Command } from "commander";
import {
  DEPRECATED_ALIASES,
  applyDeprecatedAliases,
  deprecatedOption,
  intOption,
} from "../src/lib/options.js";

/**
 * 参数改名（v0.8）的契约：旧名仍可用、会打警告、不进 --help、且不能盖过显式给出的新名。
 * 这里用真实 Command 实例走一遍解析，而不是打桩 —— 迁移逻辑挂在 preAction 钩子上，
 * 钩子是否被调用、actionCommand 是不是叶子命令，只有真解析才测得出来。
 */

interface Parsed {
  opts: Record<string, unknown>;
  warnings: string[];
  /** 新名在 commander 里的取值来源（"cli" / "default" / undefined） */
  source: string | undefined;
}

/** 捕获到的 stderr 警告（captureWarn 每次重置） */
let warnings: string[] = [];

function captureWarn(): void {
  warnings = [];
  vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => {
    warnings.push(a.map(String).join(" "));
  });
}

function parseReadme(argv: string[]): Parsed {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} });

  let opts: Record<string, unknown> = {};
  let source: string | undefined;
  program
    .command("readme")
    .option("--budget-tokens <n>", "token budget", intOption(), 48000)
    .addOption(deprecatedOption("--max-tokens <n>", "budget-tokens", intOption()))
    .action((o: Record<string, unknown>, cmd: Command) => {
      opts = o;
      source = cmd.getOptionValueSource("budgetTokens");
    });

  program.hook("preAction", (_thisCommand, actionCommand) => {
    applyDeprecatedAliases(actionCommand);
  });

  program.parse(["node", "cli", "readme", ...argv]);
  return { opts, warnings: [...warnings], source };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("废弃参数别名", () => {
  it("只给旧名时：值生效，并打一行指向新名的警告", () => {
    captureWarn();

    const { opts, warnings } = parseReadme(["--max-tokens", "5000"]);

    expect(opts.budgetTokens).toBe(5000);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("--max-tokens 已废弃");
    expect(warnings[0]).toContain("--budget-tokens");
  });

  it("只给新名时：不产生任何警告", () => {
    captureWarn();

    const { opts, warnings } = parseReadme(["--budget-tokens", "5000"]);

    expect(opts.budgetTokens).toBe(5000);
    expect(warnings).toHaveLength(0);
  });

  it("两个都给时：以新名为准，但仍然警告（用户该知道旧名要没了）", () => {
    captureWarn();

    const { opts, warnings } = parseReadme([
      "--max-tokens",
      "5000",
      "--budget-tokens",
      "9000",
    ]);

    expect(opts.budgetTokens).toBe(9000);
    expect(warnings).toHaveLength(1);
  });

  it("都不给时：落到内置默认值，且不警告", () => {
    captureWarn();

    const { opts, warnings } = parseReadme([]);

    expect(opts.budgetTokens).toBe(48000);
    expect(warnings).toHaveLength(0);
  });

  it("旧名同样走 intOption 校验，非法值不会透传成 NaN", () => {
    captureWarn();

    expect(() => parseReadme(["--max-tokens", "abc"])).toThrow();
    expect(() => parseReadme(["--max-tokens", "-5"])).toThrow();
  });

  it("旧名不出现在 --help 里（否则新用户会学到已废弃的写法）", () => {
    const program = new Command();
    program.exitOverride();
    const cmd = program
      .command("readme")
      .option("--budget-tokens <n>", "token budget", intOption(), 48000)
      .addOption(deprecatedOption("--max-tokens <n>", "budget-tokens", intOption()));

    const help = cmd.helpInformation();
    expect(help).toContain("--budget-tokens");
    expect(help).not.toContain("--max-tokens");
  });

  it("别名表里的旧名与新名一一对应，避免改名时漏配", () => {
    expect(DEPRECATED_ALIASES).toEqual({
      maxTokens: "budgetTokens",
      max: "maxCommits",
    });
  });

  it("迁移后新名的来源是 cli：否则配置默认值会静默盖掉用户显式传的旧名", () => {
    // commander 的 setOptionValue 会把来源记成 undefined，而 resolveNumber
    // 只在来源为 "cli" 时才认 CLI 值。若这里退化成 undefined，
    // `--max-tokens 5000` 配上 `config set maxTokens 8000` 就会静默用 8000——
    // 用户的显式输入被丢掉且无任何提示。
    captureWarn();

    const { source } = parseReadme(["--max-tokens", "5000"]);

    expect(source).toBe("cli");
  });
});
