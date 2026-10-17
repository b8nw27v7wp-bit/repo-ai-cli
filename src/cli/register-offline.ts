import type { Command } from "commander";
import { runInit } from "../commands/init.js";
import { runSecrets } from "../commands/secrets.js";
import { runDoctor } from "../commands/doctor.js";
import { runGitignore } from "../commands/gitignore.js";
import { runLicense } from "../commands/license.js";
import { runStats } from "../commands/stats.js";
import { runMap } from "../commands/map.js";
import { runImpact } from "../commands/impact.js";
import { runHealth } from "../commands/health.js";
import { runDeps } from "../commands/deps.js";
import {
  runHooksInstall,
  runHooksUninstall,
  runHooksList,
} from "../commands/hooks.js";
import { runRelease } from "../commands/release.js";
import { runBadges } from "../commands/badges.js";
import { runContributing } from "../commands/contributing.js";
import {
  runConfigGet,
  runConfigSet,
  runConfigUnset,
  runConfigReset,
  runConfigList,
  runConfigInit,
  runConfigUse,
  runConfigRemoveProfile,
} from "../commands/config.js";
import { intOption, dateOption } from "../lib/options.js";
import { loadConfig } from "../lib/config.js";
import { handleError, resolveNumber, type CommandRegistrar } from "./shared.js";

/**
 * 不调用 LLM 的 12 条命令。
 *
 * 其中 hooks 与 config 是子命令组（共 11 个叶子命令），docs:check 会逐个校验
 * 它们的 flag 是否已写进 README。
 *
 * 与 register-ai.ts 一样按「一命令一注册器」组织，顺序由 program.ts 的
 * COMMAND_ORDER 决定，不在这里隐式约定。
 */
export const OFFLINE_COMMANDS: Record<string, CommandRegistrar> = {
  init(program) {
    program
      .command("init")
      .description("Scaffold a new project (ts-cli / ts-lib templates, no LLM)")
      .argument("[name]", "project name (default: current directory)")
      .option("-t, --template <id>", "ts-cli | ts-lib", "ts-cli")
      .option("-f, --force", "overwrite existing files")
      .option("--json", "output machine-readable JSON")
      .action(async (name: string | undefined, opts: Record<string, unknown>) => {
        try {
          await runInit({
            name,
            template: opts.template as string | undefined,
            force: Boolean(opts.force),
            json: Boolean(opts.json),
          });
        } catch (err) {
          handleError(err, Boolean(opts.json));
        }
      });
  },

  secrets(program) {
    program
      .command("secrets")
      .description("Scan for hardcoded secrets/credentials in a directory (offline)")
      .argument("[path]", "directory to scan (default: current dir)", ".")
      .option("--severity <level>", "critical | high | medium", "medium")
      .option("--max-file-kb <n>", "max file size to scan in KB", intOption(), 200)
      .option("--json", "output machine-readable JSON")
      .action(async (target: string, opts: Record<string, unknown>, cmd: Command) => {
        try {
          // secrets 也认配置里的 maxFileKb：这个键的含义就是「单文件上限」，
          // 只让 readme 认、让 secrets 不认会让用户迷惑
          const cfg = await loadConfig(opts.profile as string | undefined);
          await runSecrets({
            target,
            severity: opts.severity as string | undefined,
            maxFileKb: resolveNumber(cmd, opts, "maxFileKb", cfg.maxFileKb),
            json: Boolean(opts.json),
          });
        } catch (err) {
          handleError(err, Boolean(opts.json));
        }
      });
  },

  doctor(program) {
    program
      .command("doctor")
      .description("Check the CLI environment: Node, git, config, keys, proxy (offline)")
      .option("--json", "output machine-readable JSON")
      .action(async (opts: Record<string, unknown>) => {
        try {
          await runDoctor({ json: Boolean(opts.json) });
        } catch (err) {
          handleError(err, Boolean(opts.json));
        }
      });
  },

  gitignore(program) {
    program
      .command("gitignore")
      .description("Generate a .gitignore from bundled templates (offline)")
      .argument("[templates...]", "template ids (node python go ...)")
      .option("--list", "list available templates")
      .option("-o, --output <file>", "write to file (default: stdout)")
      .option("--json", "output machine-readable JSON")
      .action(async (templates: string[], opts: Record<string, unknown>) => {
        try {
          await runGitignore({
            templates,
            list: Boolean(opts.list),
            output: opts.output as string | undefined,
            json: Boolean(opts.json),
          });
        } catch (err) {
          handleError(err, Boolean(opts.json));
        }
      });
  },

  license(program) {
    program
      .command("license")
      .description("Generate a LICENSE file from bundled open-source templates (offline)")
      .argument("[license]", "license id (mit/isc/bsd-2-clause/bsd-3-clause/unlicense/mit-0)", "mit")
      .option("--name <name>", "copyright holder (default: git user.name)")
      .option("--year <year>", "copyright year (default: current year)")
      .option("-o, --output <file>", "output file", "LICENSE")
      .option("--json", "output machine-readable JSON")
      .action(async (license: string, opts: Record<string, unknown>) => {
        try {
          await runLicense({
            license,
            name: opts.name as string | undefined,
            year: opts.year as string | undefined,
            output: opts.output as string | undefined,
            json: Boolean(opts.json),
          });
        } catch (err) {
          handleError(err, Boolean(opts.json));
        }
      });
  },

  stats(program) {
    program
      .command("stats")
      .description("Show repo stats: files, lines, languages, commits (offline)")
      .argument("[path]", "directory to analyze (default: current dir)", ".")
      .option("--since <date>", "only count commits since this date (YYYY-MM-DD, inclusive)", dateOption())
      .option("--json", "output machine-readable JSON")
      .action(async (target: string, opts: Record<string, unknown>) => {
        try {
          await runStats({
            target,
            since: opts.since as string | undefined,
            json: Boolean(opts.json),
          });
        } catch (err) {
          handleError(err, Boolean(opts.json));
        }
      });
  },

  map(program) {
    program
      .command("map")
      .description("Show a repository map: entry points, module groups, tree (offline)")
      .argument("[path]", "directory to analyze (default: current dir)", ".")
      .option("--depth <n>", "max tree depth (root = 0)", intOption(0), 3)
      .option("--focus <path>", "only map a subdirectory/module")
      .option("--json", "output machine-readable JSON")
      .action(async (target: string, opts: Record<string, unknown>) => {
        try {
          await runMap({
            target,
            depth: opts.depth as number,
            focus: opts.focus as string | undefined,
            json: Boolean(opts.json),
          });
        } catch (err) {
          handleError(err, Boolean(opts.json));
        }
      });
  },

  impact(program) {
    program
      .command("impact")
      .description("Find files and tests affected by changes via import graph (offline)")
      .argument("[files...]", "changed files (default: staged changes)")
      .option("--diff", "use staged changes (default when no files are given)")
      .option("--depth <n>", "reverse dependency depth", intOption(1), 2)
      .option("--json", "output machine-readable JSON")
      .action(async (files: string[], opts: Record<string, unknown>) => {
        try {
          await runImpact({
            targets: files,
            diff: Boolean(opts.diff),
            depth: opts.depth as number,
            json: Boolean(opts.json),
          });
        } catch (err) {
          handleError(err, Boolean(opts.json));
        }
      });
  },

  health(program) {
    program
      .command("health")
      .description("Audit repository health: community files, CI, tests, metadata, secrets (offline)")
      .argument("[path]", "directory to audit (default: current dir)", ".")
      .option("--strict", "exit 1 on warnings too (for CI)")
      .option("--network", "also run npm outdated / audit (requires network)")
      .option("--json", "output machine-readable JSON")
      .action(async (target: string, opts: Record<string, unknown>) => {
        try {
          await runHealth({
            target,
            strict: Boolean(opts.strict),
            network: Boolean(opts.network),
            json: Boolean(opts.json),
          });
        } catch (err) {
          handleError(err, Boolean(opts.json));
        }
      });
  },

  deps(program) {
    program
      .command("deps")
      .description("List dependencies; --outdated / --audit check upgrades & vulnerabilities")
      .option("--outdated", "check for newer versions (wraps npm outdated)")
      .option("--audit", "run a security audit (wraps npm audit)")
      .option("--json", "output machine-readable JSON")
      .action(async (opts: Record<string, unknown>) => {
        try {
          await runDeps({
            outdated: Boolean(opts.outdated),
            audit: Boolean(opts.audit),
            json: Boolean(opts.json),
          });
        } catch (err) {
          handleError(err, Boolean(opts.json));
        }
      });
  },

  // hooks 子命令组：repo-ai-cli hooks <install|uninstall|list>
  hooks(program) {
    const hooksCmd = program
      .command("hooks")
      .description("Install git hooks that call repo-ai commit (offline)");

    hooksCmd
      .command("install")
      .description("install a git hook (default: prepare-commit-msg)")
      .option("--hook <name>", "hook name", "prepare-commit-msg")
      .option("--json", "output machine-readable JSON")
      .action(async (opts: Record<string, unknown>) => {
        try {
          await runHooksInstall({ hook: opts.hook as string | undefined, json: Boolean(opts.json) });
        } catch (err) {
          handleError(err, Boolean(opts.json));
        }
      });

    hooksCmd
      .command("uninstall")
      .description("uninstall a git hook installed by repo-ai")
      .option("--hook <name>", "hook name", "prepare-commit-msg")
      .option("--json", "output machine-readable JSON")
      .action(async (opts: Record<string, unknown>) => {
        try {
          await runHooksUninstall({ hook: opts.hook as string | undefined, json: Boolean(opts.json) });
        } catch (err) {
          handleError(err, Boolean(opts.json));
        }
      });

    hooksCmd
      .command("list")
      .description("show installed hook status")
      .option("--json", "output machine-readable JSON")
      .action(async (opts: Record<string, unknown>) => {
        try {
          await runHooksList({ json: Boolean(opts.json) });
        } catch (err) {
          handleError(err, Boolean(opts.json));
        }
      });
  },

  release(program) {
    program
      .command("release")
      .description("Suggest the next semver version & release (default: suggest only)")
      .option("--bump <level>", "major | minor | patch | auto")
      .option("--tag", "create a git tag after bump")
      .option("--json", "output machine-readable JSON")
      .action(async (opts: Record<string, unknown>) => {
        try {
          await runRelease({
            bump: opts.bump as string | undefined,
            tag: Boolean(opts.tag),
            json: Boolean(opts.json),
          });
        } catch (err) {
          handleError(err, Boolean(opts.json));
        }
      });
  },

  badges(program) {
    program
      .command("badges")
      .description("Generate README badges from repo context (CI/npm/license/node, offline)")
      .option("-o, --output <file>", "write to file (default: stdout)")
      .option("--json", "output machine-readable JSON")
      .action(async (opts: Record<string, unknown>) => {
        try {
          await runBadges({
            output: opts.output as string | undefined,
            json: Boolean(opts.json),
          });
        } catch (err) {
          handleError(err, Boolean(opts.json));
        }
      });
  },

  contributing(program) {
    program
      .command("contributing")
      .description("Generate a CONTRIBUTING.md (offline, zh/en)")
      .option("-o, --output <file>", "output file", "CONTRIBUTING.md")
      .option("-l, --language <lang>", "zh | en", "zh")
      .option("-f, --force", "overwrite existing file")
      .option("--json", "output machine-readable JSON")
      .action(async (opts: Record<string, unknown>) => {
        try {
          await runContributing({
            output: opts.output as string | undefined,
            language: opts.language as "zh" | "en" | undefined,
            force: Boolean(opts.force),
            json: Boolean(opts.json),
          });
        } catch (err) {
          handleError(err, Boolean(opts.json));
        }
      });
  },

  // config 子命令组：repo-ai-cli config <get|set|unset|reset|list|use|rm-profile|init>
  config(program) {
    const configCmd = program
      .command("config")
      .description("Persist LLM config to ~/.repo-ai/config.json");

    configCmd
      .command("get <key>")
      .description("print a config value")
      .option("--profile <name>", "read from a named profile")
      .action(async (key: string, opts: Record<string, unknown>) => {
        try {
          await runConfigGet(key, { profile: opts.profile as string | undefined });
        } catch (err) {
          handleError(err, false);
        }
      });

    configCmd
      .command("set <key> <value>")
      .description("set a config value (provider/baseUrl/model/apiKey/maxTokens/...)")
      .option("--profile <name>", 'save into a named profile (created on first use)')
      .option("--json", "output machine-readable JSON")
      .action(async (key: string, value: string, opts: Record<string, unknown>) => {
        try {
          await runConfigSet(key, value, {
            json: Boolean(opts.json),
            profile: opts.profile as string | undefined,
          });
        } catch (err) {
          handleError(err, Boolean(opts.json));
        }
      });

    configCmd
      .command("unset <key>")
      .description("remove a config value")
      .option("--profile <name>", "remove from a named profile")
      .option("--json", "output machine-readable JSON")
      .action(async (key: string, opts: Record<string, unknown>) => {
        try {
          await runConfigUnset(key, {
            json: Boolean(opts.json),
            profile: opts.profile as string | undefined,
          });
        } catch (err) {
          handleError(err, Boolean(opts.json));
        }
      });

    configCmd
      .command("reset")
      .description("clear all persisted config (including all profiles)")
      .option("--json", "output machine-readable JSON")
      .action(async (opts: Record<string, unknown>) => {
        try {
          await runConfigReset({ json: Boolean(opts.json) });
        } catch (err) {
          handleError(err, Boolean(opts.json));
        }
      });

    configCmd
      .command("list")
      .alias("ls")
      .description("show all profiles & config (apiKey masked; * = active)")
      .option("--json", "output machine-readable JSON")
      .action(async (opts: Record<string, unknown>) => {
        try {
          await runConfigList({ json: Boolean(opts.json) });
        } catch (err) {
          handleError(err, Boolean(opts.json));
        }
      });

    configCmd
      .command("use <name>")
      .description('activate a profile ("default" to deactivate)')
      .option("--json", "output machine-readable JSON")
      .action(async (name: string, opts: Record<string, unknown>) => {
        try {
          await runConfigUse(name, { json: Boolean(opts.json) });
        } catch (err) {
          handleError(err, Boolean(opts.json));
        }
      });

    configCmd
      .command("rm-profile <name>")
      .description("delete a named profile")
      .option("--json", "output machine-readable JSON")
      .action(async (name: string, opts: Record<string, unknown>) => {
        try {
          await runConfigRemoveProfile(name, { json: Boolean(opts.json) });
        } catch (err) {
          handleError(err, Boolean(opts.json));
        }
      });

    configCmd
      .command("init")
      .description("interactive wizard: pick provider + enter apiKey")
      .option("--profile <name>", "save into a named profile")
      .action(async (opts: Record<string, unknown>) => {
        try {
          await runConfigInit(opts.profile as string | undefined);
        } catch (err) {
          handleError(err, false);
        }
      });
  },
};
