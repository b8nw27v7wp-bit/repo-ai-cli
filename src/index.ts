import { Command } from "commander";
import { runReadme } from "./commands/readme.js";
import { runCommit } from "./commands/commit.js";
import { LLMError } from "./lib/llm.js";
import pkg from "../package.json" with { type: "json" };

const program = new Command();

program
  .name("repo-ai")
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
  .option("--max-tokens <n>", "token budget", (v) => parseInt(v, 10), 8000)
  .option("--max-file-kb <n>", "max single-file size in KB", (v) => parseInt(v, 10), 100)
  .action(async (target: string, opts: Record<string, unknown>) => {
    try {
      await runReadme({
        target,
        output: opts.output as string,
        language: opts.language as "bilingual" | "zh" | "en",
        dryRun: Boolean(opts.dryRun),
        maxTokens: opts.maxTokens as number,
        maxFileKb: opts.maxFileKb as number,
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
  .action(async (opts: Record<string, unknown>) => {
    try {
      await runCommit({
        staged: Boolean(opts.staged),
        all: Boolean(opts.all),
        print: Boolean(opts.print),
        type: opts.type as string | undefined,
        maxDiffKb: opts.maxDiffKb as number,
      });
    } catch (err) {
      handleError(err);
    }
  });

function handleError(err: unknown): void {
  if (err instanceof LLMError) {
    console.error(`✖ ${err.message}`);
  } else if (err instanceof Error) {
    console.error(`✖ ${err.message}`);
  } else {
    console.error(`✖ ${String(err)}`);
  }
  process.exitCode = 1;
}

program.parse();
