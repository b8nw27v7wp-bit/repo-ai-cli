import { Command } from "commander";
import { runReadme } from "./commands/readme.js";
import { runCommit } from "./commands/commit.js";
import { runChangelog } from "./commands/changelog.js";
import { runReview } from "./commands/review.js";
import { runExplain } from "./commands/explain.js";
import { runPr } from "./commands/pr.js";
import { runInit } from "./commands/init.js";
import {
  runConfigGet,
  runConfigSet,
  runConfigUnset,
  runConfigReset,
  runConfigList,
  runConfigInit,
} from "./commands/config.js";
import pkg from "../package.json" with { type: "json" };

const program = new Command();

program
  .name("repo-ai-cli")
  .description("AI-powered repo helper: README + commit + changelog + review + explain + pr + init")
  .version(pkg.version);

/** 给命令挂上 4 个共用的 LLM 选项（provider/base-url/model/api-key） */
function withLLMOptions(cmd: Command): Command {
  return cmd
    .option(
      "--provider <id>",
      "LLM provider: deepseek|openai|moonshot|zhipu|qwen|minimax|xai|siliconflow",
    )
    .option("--base-url <url>", "custom OpenAI-compatible endpoint (overrides provider)")
    .option("--model <name>", "model name (overrides provider default)")
    .option(
      "--api-key <key>",
      "API key (prefer env vars / config set; avoid in shell history)",
    );
}

const readmeCmd = withLLMOptions(
  program
    .command("readme")
    .description("Generate a README for a local directory or GitHub repo")
    .argument("[path-or-url]", "local directory path (default: current dir)", ".")
    .option("-o, --output <file>", "output file", "README.md")
    .option(
      "-l, --language <lang>",
      "bilingual | zh | en",
      "bilingual",
    )
    .option("--dry-run", "print stats only, do not call API")
    .option("--max-tokens <n>", "token budget", (v) => parseInt(v, 10), 48000)
    .option("--max-file-kb <n>", "max single-file size in KB", (v) => parseInt(v, 10), 100)
    .option("--max-output-tokens <n>", "max LLM output tokens", (v) => parseInt(v, 10), 8192)
    .option("--temperature <n>", "sampling temperature 0~2", (v) => parseFloat(v), 0.7)
    .option("--stream", "stream output token by token (TTY only)")
    .option("--json", "output machine-readable JSON"),
);

readmeCmd.action(async (target: string, opts: Record<string, unknown>) => {
  try {
    await runReadme({
      target,
      output: opts.output as string,
      language: opts.language as "bilingual" | "zh" | "en",
      dryRun: Boolean(opts.dryRun),
      maxTokens: opts.maxTokens as number,
      maxFileKb: opts.maxFileKb as number,
      maxOutputTokens: opts.maxOutputTokens as number,
      temperature: opts.temperature as number,
      json: Boolean(opts.json),
      stream: Boolean(opts.stream),
      provider: opts.provider as string | undefined,
      baseUrl: opts.baseUrl as string | undefined,
      model: opts.model as string | undefined,
      apiKey: opts.apiKey as string | undefined,
    });
  } catch (err) {
    handleError(err, Boolean(opts.json));
  }
});

const commitCmd = withLLMOptions(
  program
    .command("commit")
    .description("Generate a conventional commit message from git diff")
    .option("--staged", "use staged changes (default)", true)
    .option("--all", "include unstaged changes")
    .option("--print", "print message without interaction")
    .option("--json", "output machine-readable JSON")
    .option("--type <type>", "force commit type (feat/fix/docs/...)")
    .option("--max-diff-kb <n>", "max diff size in KB", (v) => parseInt(v, 10), 200)
    .option("--max-output-tokens <n>", "max LLM output tokens", (v) => parseInt(v, 10), 1024)
    .option("--temperature <n>", "sampling temperature 0~2", (v) => parseFloat(v), 0.3),
);

commitCmd.action(async (opts: Record<string, unknown>) => {
  try {
    await runCommit({
      staged: Boolean(opts.staged),
      all: Boolean(opts.all),
      print: Boolean(opts.print),
      json: Boolean(opts.json),
      type: opts.type as string | undefined,
      maxDiffKb: opts.maxDiffKb as number,
      maxOutputTokens: opts.maxOutputTokens as number,
      temperature: opts.temperature as number,
      provider: opts.provider as string | undefined,
      baseUrl: opts.baseUrl as string | undefined,
      model: opts.model as string | undefined,
      apiKey: opts.apiKey as string | undefined,
    });
  } catch (err) {
    handleError(err, Boolean(opts.json));
  }
});

const changelogCmd = withLLMOptions(
  program
    .command("changelog")
    .description("Generate a CHANGELOG.md from git log (since last tag by default)")
    .option("-o, --output <file>", "output file", "CHANGELOG.md")
    .option("-r, --range <range>", "git range (v1.0.0.. / ..HEAD / 1.0.0..2.0.0); default: last tag..HEAD")
    .option("-n, --max <n>", "max commits to consider", (v) => parseInt(v, 10), 50)
    .option("-l, --language <lang>", "zh | en", "zh")
    .option("--dry-run", "print stats only, do not call API")
    .option("--print", "print changelog without writing file")
    .option("--json", "output machine-readable JSON")
    .option("--max-output-tokens <n>", "max LLM output tokens", (v) => parseInt(v, 10), 4096)
    .option("--temperature <n>", "sampling temperature 0~2", (v) => parseFloat(v), 0.5)
    .option("--stream", "stream output token by token (TTY only)"),
);

changelogCmd.action(async (opts: Record<string, unknown>) => {
  try {
    await runChangelog({
      range: opts.range as string | undefined,
      max: opts.max as number,
      output: opts.output as string,
      language: opts.language as "zh" | "en",
      dryRun: Boolean(opts.dryRun),
      print: Boolean(opts.print),
      json: Boolean(opts.json),
      maxOutputTokens: opts.maxOutputTokens as number,
      temperature: opts.temperature as number,
      stream: Boolean(opts.stream),
      provider: opts.provider as string | undefined,
      baseUrl: opts.baseUrl as string | undefined,
      model: opts.model as string | undefined,
      apiKey: opts.apiKey as string | undefined,
    });
  } catch (err) {
    handleError(err, Boolean(opts.json));
  }
});

const reviewCmd = withLLMOptions(
  program
    .command("review")
    .description("AI code review of your git diff (staged changes by default)")
    .option("--staged", "use staged changes (default)", true)
    .option("--all", "include unstaged changes")
    .option("-o, --output <file>", "write review to file (default: stdout)")
    .option("--focus <area>", "bug|security|style|perf|all", "all")
    .option("--json", "output machine-readable JSON")
    .option("--max-diff-kb <n>", "max diff size in KB", (v) => parseInt(v, 10), 200)
    .option("--max-output-tokens <n>", "max LLM output tokens", (v) => parseInt(v, 10), 4096)
    .option("--temperature <n>", "sampling temperature 0~2", (v) => parseFloat(v), 0.3),
);

reviewCmd.action(async (opts: Record<string, unknown>) => {
  try {
    await runReview({
      staged: Boolean(opts.staged),
      all: Boolean(opts.all),
      output: opts.output as string | undefined,
      focus: opts.focus as string | undefined,
      json: Boolean(opts.json),
      maxDiffKb: opts.maxDiffKb as number,
      maxOutputTokens: opts.maxOutputTokens as number,
      temperature: opts.temperature as number,
      provider: opts.provider as string | undefined,
      baseUrl: opts.baseUrl as string | undefined,
      model: opts.model as string | undefined,
      apiKey: opts.apiKey as string | undefined,
    });
  } catch (err) {
    handleError(err, Boolean(opts.json));
  }
});

const explainCmd = withLLMOptions(
  program
    .command("explain")
    .description("Explain a file or code region (file[:line] / file#symbol)")
    .argument("<file-or-region>", "file path, optionally with :line / :start-end / #symbol")
    .option("-l, --language <lang>", "zh | en | bilingual", "zh")
    .option("--max-file-kb <n>", "max file size in KB", (v) => parseInt(v, 10), 200)
    .option("--json", "output machine-readable JSON")
    .option("--max-output-tokens <n>", "max LLM output tokens", (v) => parseInt(v, 10), 2048)
    .option("--temperature <n>", "sampling temperature 0~2", (v) => parseFloat(v), 0.3),
);

explainCmd.action(async (target: string, opts: Record<string, unknown>) => {
  try {
    await runExplain({
      target,
      language: opts.language as "zh" | "en" | "bilingual",
      maxFileKb: opts.maxFileKb as number,
      json: Boolean(opts.json),
      maxOutputTokens: opts.maxOutputTokens as number,
      temperature: opts.temperature as number,
      provider: opts.provider as string | undefined,
      baseUrl: opts.baseUrl as string | undefined,
      model: opts.model as string | undefined,
      apiKey: opts.apiKey as string | undefined,
    });
  } catch (err) {
    handleError(err, Boolean(opts.json));
  }
});

const prCmd = withLLMOptions(
  program
    .command("pr")
    .description("Generate a PR title + description from the current branch diff")
    .option("--base <branch>", "base branch (default: auto-detect origin/HEAD)", undefined)
    .option("--create", "create the PR via gh pr create after generating")
    .option("--json", "output machine-readable JSON")
    .option("--max-diff-kb <n>", "max diff size in KB", (v) => parseInt(v, 10), 200)
    .option("--max-output-tokens <n>", "max LLM output tokens", (v) => parseInt(v, 10), 4096)
    .option("--temperature <n>", "sampling temperature 0~2", (v) => parseFloat(v), 0.5),
);

prCmd.action(async (opts: Record<string, unknown>) => {
  try {
    await runPr({
      base: opts.base as string | undefined,
      create: Boolean(opts.create),
      json: Boolean(opts.json),
      maxDiffKb: opts.maxDiffKb as number,
      maxOutputTokens: opts.maxOutputTokens as number,
      temperature: opts.temperature as number,
      provider: opts.provider as string | undefined,
      baseUrl: opts.baseUrl as string | undefined,
      model: opts.model as string | undefined,
      apiKey: opts.apiKey as string | undefined,
    });
  } catch (err) {
    handleError(err, Boolean(opts.json));
  }
});

const initCmd = program
  .command("init")
  .description("Scaffold a new project (ts-cli / ts-lib templates, no LLM)")
  .argument("[name]", "project name (default: current directory)")
  .option("-t, --template <id>", "ts-cli | ts-lib", "ts-cli")
  .option("-f, --force", "overwrite existing files")
  .option("--json", "output machine-readable JSON");

initCmd.action(async (name: string | undefined, opts: Record<string, unknown>) => {
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

// config 子命令组：repo-ai-cli config <get|set|unset|reset|list|init>
const configCmd = program
  .command("config")
  .description("Persist LLM config to ~/.repo-ai/config.json");

configCmd
  .command("get <key>")
  .description("print a config value")
  .action(async (key: string) => {
    try {
      await runConfigGet(key);
    } catch (err) {
      handleError(err, false);
    }
  });

configCmd
  .command("set <key> <value>")
  .description("set a config value (provider/baseUrl/model/apiKey/maxTokens/...)")
  .option("--json", "output machine-readable JSON")
  .action(async (key: string, value: string, opts: Record<string, unknown>) => {
    try {
      await runConfigSet(key, value, { json: Boolean(opts.json) });
    } catch (err) {
      handleError(err, Boolean(opts.json));
    }
  });

configCmd
  .command("unset <key>")
  .description("remove a config value")
  .option("--json", "output machine-readable JSON")
  .action(async (key: string, opts: Record<string, unknown>) => {
    try {
      await runConfigUnset(key, { json: Boolean(opts.json) });
    } catch (err) {
      handleError(err, Boolean(opts.json));
    }
  });

configCmd
  .command("reset")
  .description("clear all persisted config")
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
  .description("show all persisted config (apiKey masked)")
  .option("--json", "output machine-readable JSON")
  .action(async (opts: Record<string, unknown>) => {
    try {
      await runConfigList({ json: Boolean(opts.json) });
    } catch (err) {
      handleError(err, Boolean(opts.json));
    }
  });

configCmd
  .command("init")
  .description("interactive wizard: pick provider + enter apiKey")
  .action(async () => {
    try {
      await runConfigInit();
    } catch (err) {
      handleError(err, false);
    }
  });

function handleError(err: unknown, json: boolean): void {
  const msg = err instanceof Error ? err.message : String(err);
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
  process.exitCode = 1;
}

program.parse();
