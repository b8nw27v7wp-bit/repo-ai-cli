import { Command } from "commander";
import { runReadme } from "./commands/readme.js";
import { runCommit } from "./commands/commit.js";
import pkg from "../package.json" with { type: "json" };

const program = new Command();

program
  .name("repo-ai-cli")
  .description("AI-powered repo helper: bilingual README + conventional commits")
  .version(pkg.version);

program
  .command("readme")
  .description("Generate a README for a local directory (GitHub URL in v0.2)")
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
  .option("--provider <id>", "LLM provider: deepseek|openai|moonshot|zhipu|qwen|minimax|xai|siliconflow")
  .option("--base-url <url>", "custom OpenAI-compatible endpoint (overrides provider)")
  .option("--model <name>", "model name (overrides provider default)")
  .option("--api-key <key>", "API key (prefer env vars; avoid in shell history)")
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
        provider: opts.provider as string | undefined,
        baseUrl: opts.baseUrl as string | undefined,
        model: opts.model as string | undefined,
        apiKey: opts.apiKey as string | undefined,
      });
    } catch (err) {
      handleError(err);
    }
  });

program
  .command("commit")
  .description("Generate a conventional commit message from git diff (M3)")
  .option("--staged", "use staged changes (default)", true)
  .option("--all", "include unstaged changes")
  .option("--print", "print message without interaction")
  .option("--type <type>", "force commit type (feat/fix/docs/...)")
  .option("--max-diff-kb <n>", "max diff size in KB", (v) => parseInt(v, 10), 200)
  .option("--max-output-tokens <n>", "max LLM output tokens", (v) => parseInt(v, 10), 1024)
  .option("--temperature <n>", "sampling temperature 0~2", (v) => parseFloat(v), 0.3)
  .option("--provider <id>", "LLM provider: deepseek|openai|moonshot|zhipu|qwen|minimax|xai|siliconflow")
  .option("--base-url <url>", "custom OpenAI-compatible endpoint (overrides provider)")
  .option("--model <name>", "model name (overrides provider default)")
  .option("--api-key <key>", "API key (prefer env vars; avoid in shell history)")
  .action(async (opts: Record<string, unknown>) => {
    try {
      await runCommit({
        staged: Boolean(opts.staged),
        all: Boolean(opts.all),
        print: Boolean(opts.print),
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
      handleError(err);
    }
  });

function handleError(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`✖ ${msg}`);
  process.exitCode = 1;
}

program.parse();
