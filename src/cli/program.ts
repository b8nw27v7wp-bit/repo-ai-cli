import { Command } from "commander";
import { setVerbose } from "../lib/log.js";
import { applyDeprecatedAliases } from "../lib/options.js";
import { AI_COMMANDS } from "./register-ai.js";
import { OFFLINE_COMMANDS } from "./register-offline.js";
import { type CommandRegistrar } from "./shared.js";
import pkg from "../../package.json" with { type: "json" };

/**
 * 命令的登记顺序 = `--help` 的展示顺序。
 *
 * 这份顺序刻意不是「按能力分组」也不是字母序，而是逐字照抄拆分前 index.ts 的注册顺序：
 * P1-1 的验收标准是「纯搬迁不改行为」，把 AI 命令整块提到前面虽然更好读，
 * 却会改掉 --help 的展示顺序——那就不再是可证明的无副作用重构了。
 * 顺序显式写在这里，而不是由两个注册文件的调用先后隐式决定。
 *
 * 注：README「Command Options」的小节顺序与此基本一致，唯 `config` 一节在 README 里
 * 排在最末、这里排在中段（拆分前就是这样）。属于既有的文档顺序小分歧，未在本次一并调整。
 */
export const COMMAND_ORDER = [
  // 生成类
  "readme",
  "commit",
  "changelog",
  "review",
  "review-pr",
  "explain",
  "pr",
  // 仓库维护类（离线）
  "init",
  "secrets",
  "doctor",
  "gitignore",
  "license",
  "stats",
  "deps",
  // 代码理解类
  "translate",
  "test",
  "refactor",
  // 工具与配置
  "hooks",
  "ask",
  "fix",
  "release",
  "config",
  "badges",
  "contributing",
] as const;

const REGISTRY: Record<string, CommandRegistrar> = {
  ...AI_COMMANDS,
  ...OFFLINE_COMMANDS,
};

/**
 * 组装 CLI：顶层 program、全局 option、preAction 钩子，以及 24 条命令的注册。
 *
 * description 里的命令总数会被 scripts/check-docs.mjs 与实际注册数比对——
 * 加命令时忘了改这里，docs:check 会直接红，不会静默漂移。
 */
export function buildProgram(): Command {
  const program = new Command();

  program
    .name("repo-ai-cli")
    .description("AI-powered repo helper: 24 commands — README, commit, changelog, review, review-pr, explain, pr, init, secrets, doctor, gitignore, license, stats, deps, translate, test, refactor, hooks, ask, fix, release, badges, contributing, config")
    .version(pkg.version)
    .option("--verbose", "debug output to stderr (network, config, provider resolution)");

  // 全局 --verbose（或 REPO_AI_VERBOSE=1）：在任何子命令执行前开启调试日志
  // 同时把已废弃的参数名迁移到现用名（见 lib/options.ts 的 DEPRECATED_ALIASES）
  program.hook("preAction", (_thisCommand, actionCommand) => {
    const opts = program.opts();
    if (opts.verbose || process.env.REPO_AI_VERBOSE === "1") {
      setVerbose(true);
    }
    applyDeprecatedAliases(actionCommand);
  });

  registerCommands(program);
  return program;
}

/**
 * 按 COMMAND_ORDER 登记命令。
 *
 * 两处不一致都直接抛错而不是静默跳过——「注册表里有、顺序表里没有」正是
 * 加命令时最容易犯的错，静默跳过会让新命令在 --help 里凭空消失。
 */
function registerCommands(program: Command): void {
  const registered = new Set<string>();
  for (const name of COMMAND_ORDER) {
    const register = REGISTRY[name];
    if (!register) {
      throw new Error(
        `COMMAND_ORDER 里的 "${name}" 没有对应注册器（见 cli/register-ai.ts / register-offline.ts）`,
      );
    }
    register(program);
    registered.add(name);
  }

  const orphans = Object.keys(REGISTRY).filter((n) => !registered.has(n));
  if (orphans.length > 0) {
    throw new Error(
      `注册器 ${orphans.join(", ")} 不在 COMMAND_ORDER 里，会被 --help 漏掉`,
    );
  }
}
