import { Command } from "commander";
import { runReadme } from "./commands/readme.js";
import { runCommit } from "./commands/commit.js";
import { runChangelog } from "./commands/changelog.js";
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
  .description("AI-powered repo helper: bilingual README + conventional commits + CHANGELOG")
  .version(pkg.version);

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
  .option("--json", "output machine-readable JSON")
  .option("--provider <id>", "LLM provider: deepseek|openai|moonshot|zhipu|qwen|minimax|xai|siliconflow")
  .option("--base-url <url>", "custom OpenAI-compatible endpoint (overrides provider)")
  .option("--model <name>", "model name (overrides provider default)")
  .option("--api-key <key>", "API key (prefer env vars / config set; avoid in shell history)")
  .action(async (target: string, opts: Record<string, unknown>) => {
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
        provider: opts.provider as string | undefined,
        baseUrl: opts.baseUrl as string | undefined,
        model: opts.model as string | undefined,
        apiKey: opts.apiKey as string | undefined,
      });
    } catch (err) {
      handleError(err, Boolean(opts.json));
    }
  });

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
  .option("--temperature <n>", "sampling temperature 0~2", (v) => parseFloat(v), 0.3)
  .option("--provider <id>", "LLM provider: deepseek|openai|moonshot|zhipu|qwen|minimax|xai|siliconflow")
  .option("--base-url <url>", "custom OpenAI-compatible endpoint (overrides provider)")
  .option("--model <name>", "model name (overrides provider default)")
  .option("--api-key <key>", "API key (prefer env vars / config set; avoid in shell history)")
  .action(async (opts: Record<string, unknown>) => {
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
  .option("--provider <id>", "LLM provider: deepseek|openai|moonshot|zhipu|qwen|minimax|xai|siliconflow")
  .option("--base-url <url>", "custom OpenAI-compatible endpoint (overrides provider)")
  .option("--model <name>", "model name (overrides provider default)")
  .option("--api-key <key>", "API key (prefer env vars / config set; avoid in shell history)")
  .action(async (opts: Record<string, unknown>) => {
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
        provider: opts.provider as string | undefined,
        baseUrl: opts.baseUrl as string | undefined,
        model: opts.model as string | undefined,
        apiKey: opts.apiKey as string | undefined,
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
