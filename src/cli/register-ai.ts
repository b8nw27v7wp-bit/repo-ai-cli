import type { Command } from "commander";
import { runReadme } from "../commands/readme.js";
import { runOnboard } from "../commands/onboard.js";
import { runCommit } from "../commands/commit.js";
import { runChangelog } from "../commands/changelog.js";
import { runReview } from "../commands/review.js";
import { runReviewPr } from "../commands/review-pr.js";
import { runExplain } from "../commands/explain.js";
import { runPr } from "../commands/pr.js";
import { runTranslate } from "../commands/translate.js";
import { runTest } from "../commands/test.js";
import { runRefactor } from "../commands/refactor.js";
import { runAsk } from "../commands/ask.js";
import { runFix } from "../commands/fix.js";
import {
  intOption,
  temperatureOption,
  deprecatedOption,
} from "../lib/options.js";
import { loadConfig } from "../lib/config.js";
import {
  handleError,
  resolveNumber,
  withLLMOptions,
  type CommandRegistrar,
} from "./shared.js";

/**
 * 需要 LLM 的 12 条命令。
 *
 * 每条命令一个注册器而不是一个大函数，是为了让 program.ts 能按既定顺序登记
 * （`--help` 的展示顺序 = README「Command Options」的小节顺序，见 program.ts
 * 的 COMMAND_ORDER）——拆文件不该顺手把顺序也改了。
 *
 * 全部共享 withLLMOptions 的 --provider/--base-url/--model/--api-key/--profile，
 * 并统一用 handleError 收尾。
 *
 * **配置解析只在这里发生**：每个 action 先 loadConfig(profile)，再用 resolveNumber
 * 把「CLI 参数 > 配置 > 内置默认」解析成具体数值交给命令层。命令层因此不需要
 * 知道配置文件的存在——这是 v0.9 配置层收口的核心。
 */
export const AI_COMMANDS: Record<string, CommandRegistrar> = {
  readme(program) {
    withLLMOptions(
      program
        .command("readme")
        .description("Generate a README for a local directory or GitHub repo")
        .argument("[path-or-url]", "local directory path (default: current dir)", ".")
        .option("-o, --output <file>", "output file", "README.md")
        .option("-l, --language <lang>", "bilingual | zh | en", "bilingual")
        .option("--dry-run", "print stats only, do not call API")
        .option("--budget-tokens <n>", "token budget for collected files", intOption(), 48000)
        .addOption(deprecatedOption("--max-tokens <n>", "budget-tokens", intOption()))
        .option("--max-file-kb <n>", "max single-file size in KB", intOption(), 100)
        .option("--max-output-tokens <n>", "max LLM output tokens", intOption(), 8192)
        .option("--temperature <n>", "sampling temperature 0~2", temperatureOption(), 0.7)
        .option("--stream", "stream output token by token (TTY only)")
        .option("--json", "output machine-readable JSON"),
    ).action(async (target: string, opts: Record<string, unknown>, cmd: Command) => {
      try {
        const cfg = await loadConfig(opts.profile as string | undefined);
        await runReadme({
          target,
          output: opts.output as string,
          language: opts.language as "bilingual" | "zh" | "en",
          dryRun: Boolean(opts.dryRun),
          maxTokens: resolveNumber(cmd, opts, "budgetTokens", cfg.maxTokens),
          maxFileKb: resolveNumber(cmd, opts, "maxFileKb", cfg.maxFileKb),
          maxOutputTokens: resolveNumber(cmd, opts, "maxOutputTokens", cfg.maxOutputTokens),
          temperature: resolveNumber(cmd, opts, "temperature", cfg.temperature),
          json: Boolean(opts.json),
          stream: Boolean(opts.stream),
          provider: opts.provider as string | undefined,
          baseUrl: opts.baseUrl as string | undefined,
          model: opts.model as string | undefined,
          apiKey: opts.apiKey as string | undefined,
          profile: opts.profile as string | undefined,
          resolvedConfig: cfg,
        });
      } catch (err) {
        handleError(err, Boolean(opts.json));
      }
    });
  },

  onboard(program) {
    withLLMOptions(
      program
        .command("onboard")
        .description("Generate an ONBOARDING.md guide for new maintainers (AI)")
        .argument("[path]", "local directory path (default: current dir)", ".")
        .option("-o, --output <file>", "output file", "ONBOARDING.md")
        .option("--dry-run", "print stats only, do not call API")
        .option("--budget-tokens <n>", "token budget for collected files", intOption(), 48000)
        .addOption(deprecatedOption("--max-tokens <n>", "budget-tokens", intOption()))
        .option("--max-file-kb <n>", "max single-file size in KB", intOption(), 100)
        .option("--max-output-tokens <n>", "max LLM output tokens", intOption(), 8192)
        .option("--temperature <n>", "sampling temperature 0~2", temperatureOption(), 0.5)
        .option("--stream", "stream output token by token (TTY only)")
        .option("--json", "output machine-readable JSON"),
    ).action(async (target: string, opts: Record<string, unknown>, cmd: Command) => {
      try {
        const cfg = await loadConfig(opts.profile as string | undefined);
        await runOnboard({
          target,
          output: opts.output as string,
          dryRun: Boolean(opts.dryRun),
          maxTokens: resolveNumber(cmd, opts, "budgetTokens", cfg.maxTokens),
          maxFileKb: resolveNumber(cmd, opts, "maxFileKb", cfg.maxFileKb),
          maxOutputTokens: resolveNumber(cmd, opts, "maxOutputTokens", cfg.maxOutputTokens),
          temperature: resolveNumber(cmd, opts, "temperature", cfg.temperature),
          json: Boolean(opts.json),
          stream: Boolean(opts.stream),
          provider: opts.provider as string | undefined,
          baseUrl: opts.baseUrl as string | undefined,
          model: opts.model as string | undefined,
          apiKey: opts.apiKey as string | undefined,
          profile: opts.profile as string | undefined,
          resolvedConfig: cfg,
        });
      } catch (err) {
        handleError(err, Boolean(opts.json));
      }
    });
  },

  commit(program) {
    withLLMOptions(
      program
        .command("commit")
        .description("Generate a conventional commit message from git diff")
        .option("--staged", "use staged changes (default)", true)
        .option("--all", "include unstaged changes")
        .option("--print", "print message without interaction")
        .option("--json", "output machine-readable JSON")
        .option("--type <type>", "force commit type (feat/fix/docs/...)")
        .option("--max-diff-kb <n>", "max diff size in KB", intOption(), 200)
        .option("--max-output-tokens <n>", "max LLM output tokens", intOption(), 1024)
        .option("--temperature <n>", "sampling temperature 0~2", temperatureOption(), 0.3),
    ).action(async (opts: Record<string, unknown>, cmd: Command) => {
      try {
        const cfg = await loadConfig(opts.profile as string | undefined);
        await runCommit({
          staged: Boolean(opts.staged),
          all: Boolean(opts.all),
          print: Boolean(opts.print),
          json: Boolean(opts.json),
          type: opts.type as string | undefined,
          maxDiffKb: resolveNumber(cmd, opts, "maxDiffKb", cfg.maxDiffKb),
          maxOutputTokens: resolveNumber(cmd, opts, "maxOutputTokens", cfg.maxOutputTokens),
          temperature: resolveNumber(cmd, opts, "temperature", cfg.temperature),
          provider: opts.provider as string | undefined,
          baseUrl: opts.baseUrl as string | undefined,
          model: opts.model as string | undefined,
          apiKey: opts.apiKey as string | undefined,
          profile: opts.profile as string | undefined,
          resolvedConfig: cfg,
        });
      } catch (err) {
        handleError(err, Boolean(opts.json));
      }
    });
  },

  changelog(program) {
    withLLMOptions(
      program
        .command("changelog")
        .description("Generate a CHANGELOG.md from git log (since last tag by default)")
        .option("-o, --output <file>", "output file", "CHANGELOG.md")
        .option("-r, --range <range>", "git range (v1.0.0.. / ..HEAD / 1.0.0..2.0.0); default: last tag..HEAD")
        .option("-n, --max-commits <n>", "max commits to consider", intOption(), 50)
        .addOption(deprecatedOption("--max <n>", "max-commits", intOption()))
        .option("-l, --language <lang>", "zh | en", "zh")
        .option("--format <fmt>", "output format: keep-a-changelog | compact (compact is local, no LLM)", "keep-a-changelog")
        .option("--dry-run", "print stats only, do not call API")
        .option("--print", "print changelog without writing file")
        .option("--json", "output machine-readable JSON")
        .option("--max-output-tokens <n>", "max LLM output tokens", intOption(), 4096)
        .option("--temperature <n>", "sampling temperature 0~2", temperatureOption(), 0.5)
        .option("--stream", "stream output token by token (TTY only)"),
    ).action(async (opts: Record<string, unknown>, cmd: Command) => {
      try {
        const cfg = await loadConfig(opts.profile as string | undefined);
        await runChangelog({
          range: opts.range as string | undefined,
          max: opts.maxCommits as number,
          output: opts.output as string,
          language: opts.language as "zh" | "en",
          format: opts.format as string | undefined,
          dryRun: Boolean(opts.dryRun),
          print: Boolean(opts.print),
          json: Boolean(opts.json),
          maxOutputTokens: resolveNumber(cmd, opts, "maxOutputTokens", cfg.maxOutputTokens),
          temperature: resolveNumber(cmd, opts, "temperature", cfg.temperature),
          stream: Boolean(opts.stream),
          provider: opts.provider as string | undefined,
          baseUrl: opts.baseUrl as string | undefined,
          model: opts.model as string | undefined,
          apiKey: opts.apiKey as string | undefined,
          profile: opts.profile as string | undefined,
          resolvedConfig: cfg,
        });
      } catch (err) {
        handleError(err, Boolean(opts.json));
      }
    });
  },

  review(program) {
    withLLMOptions(
      program
        .command("review")
        .description("AI code review of your git diff (staged changes by default)")
        .option("--staged", "use staged changes (default)", true)
        .option("--all", "include unstaged changes")
        .option("-o, --output <file>", "write review to file (default: stdout)")
        .option("--focus <area>", "bugs|security|style|perf|all", "all")
        .option("--json", "output machine-readable JSON")
        .option("--max-diff-kb <n>", "max diff size in KB", intOption(), 200)
        .option("--max-output-tokens <n>", "max LLM output tokens", intOption(), 4096)
        .option("--temperature <n>", "sampling temperature 0~2", temperatureOption(), 0.3),
    ).action(async (opts: Record<string, unknown>, cmd: Command) => {
      try {
        const cfg = await loadConfig(opts.profile as string | undefined);
        await runReview({
          staged: Boolean(opts.staged),
          all: Boolean(opts.all),
          output: opts.output as string | undefined,
          focus: opts.focus as string | undefined,
          json: Boolean(opts.json),
          maxDiffKb: resolveNumber(cmd, opts, "maxDiffKb", cfg.maxDiffKb),
          maxOutputTokens: resolveNumber(cmd, opts, "maxOutputTokens", cfg.maxOutputTokens),
          temperature: resolveNumber(cmd, opts, "temperature", cfg.temperature),
          provider: opts.provider as string | undefined,
          baseUrl: opts.baseUrl as string | undefined,
          model: opts.model as string | undefined,
          apiKey: opts.apiKey as string | undefined,
          profile: opts.profile as string | undefined,
          resolvedConfig: cfg,
        });
      } catch (err) {
        handleError(err, Boolean(opts.json));
      }
    });
  },

  "review-pr"(program) {
    withLLMOptions(
      program
        .command("review-pr")
        .description("AI code review of a GitHub pull request (no gh CLI required)")
        .argument("<pr>", "PR url (github.com/owner/repo/pull/123), owner/repo#123 or owner/repo/pull/123")
        .option("--focus <area>", "bugs|security|style|perf|all", "all")
        .option("-o, --output <file>", "write review to file (default: stdout)")
        .option("--max-diff-kb <n>", "max diff size in KB", intOption(), 200)
        .option("--max-output-tokens <n>", "max LLM output tokens", intOption(), 4096)
        .option("--temperature <n>", "sampling temperature 0~2", temperatureOption(), 0.3)
        .option("--comment", "post the review as PR comments (needs GITHUB_TOKEN; dry-run unless --yes)")
        .option("--yes", "actually post the comments (required in non-interactive mode)")
        .option("--json", "output machine-readable JSON"),
    ).action(async (pr: string, opts: Record<string, unknown>, cmd: Command) => {
      try {
        const cfg = await loadConfig(opts.profile as string | undefined);
        await runReviewPr({
          target: pr,
          focus: opts.focus as string | undefined,
          output: opts.output as string | undefined,
          maxDiffKb: resolveNumber(cmd, opts, "maxDiffKb", cfg.maxDiffKb),
          maxOutputTokens: resolveNumber(cmd, opts, "maxOutputTokens", cfg.maxOutputTokens),
          temperature: resolveNumber(cmd, opts, "temperature", cfg.temperature),
          comment: Boolean(opts.comment),
          yes: Boolean(opts.yes),
          json: Boolean(opts.json),
          provider: opts.provider as string | undefined,
          baseUrl: opts.baseUrl as string | undefined,
          model: opts.model as string | undefined,
          apiKey: opts.apiKey as string | undefined,
          profile: opts.profile as string | undefined,
          resolvedConfig: cfg,
        });
      } catch (err) {
        handleError(err, Boolean(opts.json));
      }
    });
  },

  explain(program) {
    withLLMOptions(
      program
        .command("explain")
        .description("Explain a file or code region (file[:line] / file#symbol)")
        .argument("<file-or-region>", "file path, optionally with :line / :start-end / #symbol")
        .option("-l, --language <lang>", "zh | en | bilingual", "zh")
        .option("--max-file-kb <n>", "max file size in KB", intOption(), 200)
        .option("--json", "output machine-readable JSON")
        .option("--max-output-tokens <n>", "max LLM output tokens", intOption(), 2048)
        .option("--temperature <n>", "sampling temperature 0~2", temperatureOption(), 0.3),
    ).action(async (target: string, opts: Record<string, unknown>, cmd: Command) => {
      try {
        const cfg = await loadConfig(opts.profile as string | undefined);
        await runExplain({
          target,
          language: opts.language as "zh" | "en" | "bilingual",
          maxFileKb: resolveNumber(cmd, opts, "maxFileKb", cfg.maxFileKb),
          json: Boolean(opts.json),
          maxOutputTokens: resolveNumber(cmd, opts, "maxOutputTokens", cfg.maxOutputTokens),
          temperature: resolveNumber(cmd, opts, "temperature", cfg.temperature),
          provider: opts.provider as string | undefined,
          baseUrl: opts.baseUrl as string | undefined,
          model: opts.model as string | undefined,
          apiKey: opts.apiKey as string | undefined,
          profile: opts.profile as string | undefined,
          resolvedConfig: cfg,
        });
      } catch (err) {
        handleError(err, Boolean(opts.json));
      }
    });
  },

  pr(program) {
    withLLMOptions(
      program
        .command("pr")
        .description("Generate a PR title + description from the current branch diff")
        .option("--base <branch>", "base branch (default: auto-detect origin/HEAD)", undefined)
        .option("--create", "create the PR via gh pr create after generating")
        .option("--json", "output machine-readable JSON")
        .option("--max-diff-kb <n>", "max diff size in KB", intOption(), 200)
        .option("--max-output-tokens <n>", "max LLM output tokens", intOption(), 4096)
        .option("--temperature <n>", "sampling temperature 0~2", temperatureOption(), 0.5),
    ).action(async (opts: Record<string, unknown>, cmd: Command) => {
      try {
        const cfg = await loadConfig(opts.profile as string | undefined);
        await runPr({
          base: opts.base as string | undefined,
          create: Boolean(opts.create),
          json: Boolean(opts.json),
          maxDiffKb: resolveNumber(cmd, opts, "maxDiffKb", cfg.maxDiffKb),
          maxOutputTokens: resolveNumber(cmd, opts, "maxOutputTokens", cfg.maxOutputTokens),
          temperature: resolveNumber(cmd, opts, "temperature", cfg.temperature),
          provider: opts.provider as string | undefined,
          baseUrl: opts.baseUrl as string | undefined,
          model: opts.model as string | undefined,
          apiKey: opts.apiKey as string | undefined,
          profile: opts.profile as string | undefined,
          resolvedConfig: cfg,
        });
      } catch (err) {
        handleError(err, Boolean(opts.json));
      }
    });
  },

  translate(program) {
    withLLMOptions(
      program
        .command("translate")
        .description("Translate a document between zh / en / bilingual (AI)")
        .argument("<file>", "markdown/doc file to translate")
        .option("--to <lang>", "zh | en | bilingual", "en")
        .option("-o, --output <file>", "write to file (default: stdout)")
        .option("--max-file-kb <n>", "max file size in KB", intOption(), 200)
        .option("--json", "output machine-readable JSON")
        .option("--max-output-tokens <n>", "max LLM output tokens", intOption(), 8192)
        .option("--temperature <n>", "sampling temperature 0~2", temperatureOption(), 0.3),
    ).action(async (file: string, opts: Record<string, unknown>, cmd: Command) => {
      try {
        const cfg = await loadConfig(opts.profile as string | undefined);
        await runTranslate({
          file,
          to: opts.to as string | undefined,
          output: opts.output as string | undefined,
          maxFileKb: resolveNumber(cmd, opts, "maxFileKb", cfg.maxFileKb),
          json: Boolean(opts.json),
          maxOutputTokens: resolveNumber(cmd, opts, "maxOutputTokens", cfg.maxOutputTokens),
          temperature: resolveNumber(cmd, opts, "temperature", cfg.temperature),
          provider: opts.provider as string | undefined,
          baseUrl: opts.baseUrl as string | undefined,
          model: opts.model as string | undefined,
          apiKey: opts.apiKey as string | undefined,
          profile: opts.profile as string | undefined,
          resolvedConfig: cfg,
        });
      } catch (err) {
        handleError(err, Boolean(opts.json));
      }
    });
  },

  test(program) {
    withLLMOptions(
      program
        .command("test")
        .description("Generate unit tests for a file (AI)")
        .argument("<file>", "source file to generate tests for")
        .option("--framework <name>", "vitest | jest | node-test", "vitest")
        .option("-o, --output <file>", "write tests to file (default: stdout)")
        .option("--max-file-kb <n>", "max file size in KB", intOption(), 200)
        .option("--json", "output machine-readable JSON")
        .option("--max-output-tokens <n>", "max LLM output tokens", intOption(), 4096)
        .option("--temperature <n>", "sampling temperature 0~2", temperatureOption(), 0.3),
    ).action(async (file: string, opts: Record<string, unknown>, cmd: Command) => {
      try {
        const cfg = await loadConfig(opts.profile as string | undefined);
        await runTest({
          file,
          framework: opts.framework as string | undefined,
          output: opts.output as string | undefined,
          maxFileKb: resolveNumber(cmd, opts, "maxFileKb", cfg.maxFileKb),
          json: Boolean(opts.json),
          maxOutputTokens: resolveNumber(cmd, opts, "maxOutputTokens", cfg.maxOutputTokens),
          temperature: resolveNumber(cmd, opts, "temperature", cfg.temperature),
          provider: opts.provider as string | undefined,
          baseUrl: opts.baseUrl as string | undefined,
          model: opts.model as string | undefined,
          apiKey: opts.apiKey as string | undefined,
          profile: opts.profile as string | undefined,
          resolvedConfig: cfg,
        });
      } catch (err) {
        handleError(err, Boolean(opts.json));
      }
    });
  },

  refactor(program) {
    withLLMOptions(
      program
        .command("refactor")
        .description("Suggest refactoring for a file (AI, read-only)")
        .argument("<file>", "file to analyze")
        .option("--focus <dim>", "all | readability | perf | complexity | types", "all")
        .option("-o, --output <file>", "write suggestions to file (default: stdout)")
        .option("--max-file-kb <n>", "max file size in KB", intOption(), 200)
        .option("--json", "output machine-readable JSON")
        .option("--max-output-tokens <n>", "max LLM output tokens", intOption(), 4096)
        .option("--temperature <n>", "sampling temperature 0~2", temperatureOption(), 0.3),
    ).action(async (file: string, opts: Record<string, unknown>, cmd: Command) => {
      try {
        const cfg = await loadConfig(opts.profile as string | undefined);
        await runRefactor({
          file,
          focus: opts.focus as string | undefined,
          output: opts.output as string | undefined,
          maxFileKb: resolveNumber(cmd, opts, "maxFileKb", cfg.maxFileKb),
          json: Boolean(opts.json),
          maxOutputTokens: resolveNumber(cmd, opts, "maxOutputTokens", cfg.maxOutputTokens),
          temperature: resolveNumber(cmd, opts, "temperature", cfg.temperature),
          provider: opts.provider as string | undefined,
          baseUrl: opts.baseUrl as string | undefined,
          model: opts.model as string | undefined,
          apiKey: opts.apiKey as string | undefined,
          profile: opts.profile as string | undefined,
          resolvedConfig: cfg,
        });
      } catch (err) {
        handleError(err, Boolean(opts.json));
      }
    });
  },

  ask(program) {
    withLLMOptions(
      program
        .command("ask")
        .description("Ask a question about the current codebase (RAG)")
        .argument("<question...>", "your question about this repository")
        .option("--budget-tokens <n>", "token budget for collected files", intOption(), 48000)
        .addOption(deprecatedOption("--max-tokens <n>", "budget-tokens", intOption()))
        .option("--max-file-kb <n>", "max single-file size in KB", intOption(), 100)
        .option("--stream", "stream answer token by token (TTY only)")
        .option("--json", "output machine-readable JSON")
        .option("--max-output-tokens <n>", "max LLM output tokens", intOption(), 2048)
        .option("--temperature <n>", "sampling temperature 0~2", temperatureOption(), 0.3),
    ).action(async (question: string[], opts: Record<string, unknown>, cmd: Command) => {
      try {
        const cfg = await loadConfig(opts.profile as string | undefined);
        await runAsk({
          question: question.join(" "),
          maxTokens: resolveNumber(cmd, opts, "budgetTokens", cfg.maxTokens),
          maxFileKb: resolveNumber(cmd, opts, "maxFileKb", cfg.maxFileKb),
          stream: Boolean(opts.stream),
          json: Boolean(opts.json),
          maxOutputTokens: resolveNumber(cmd, opts, "maxOutputTokens", cfg.maxOutputTokens),
          temperature: resolveNumber(cmd, opts, "temperature", cfg.temperature),
          provider: opts.provider as string | undefined,
          baseUrl: opts.baseUrl as string | undefined,
          model: opts.model as string | undefined,
          apiKey: opts.apiKey as string | undefined,
          profile: opts.profile as string | undefined,
          resolvedConfig: cfg,
        });
      } catch (err) {
        handleError(err, Boolean(opts.json));
      }
    });
  },

  fix(program) {
    withLLMOptions(
      program
        .command("fix")
        .description("Locate the root cause of a bug and suggest a fix (AI)")
        .argument("<description...>", "bug description / error message")
        .option("--budget-tokens <n>", "token budget for collected files", intOption(), 48000)
        .addOption(deprecatedOption("--max-tokens <n>", "budget-tokens", intOption()))
        .option("--max-file-kb <n>", "max single-file size in KB", intOption(), 100)
        .option("--json", "output machine-readable JSON")
        .option("--max-output-tokens <n>", "max LLM output tokens", intOption(), 4096)
        .option("--temperature <n>", "sampling temperature 0~2", temperatureOption(), 0.3),
    ).action(async (description: string[], opts: Record<string, unknown>, cmd: Command) => {
      try {
        const cfg = await loadConfig(opts.profile as string | undefined);
        await runFix({
          description: description.join(" "),
          maxTokens: resolveNumber(cmd, opts, "budgetTokens", cfg.maxTokens),
          maxFileKb: resolveNumber(cmd, opts, "maxFileKb", cfg.maxFileKb),
          json: Boolean(opts.json),
          maxOutputTokens: resolveNumber(cmd, opts, "maxOutputTokens", cfg.maxOutputTokens),
          temperature: resolveNumber(cmd, opts, "temperature", cfg.temperature),
          provider: opts.provider as string | undefined,
          baseUrl: opts.baseUrl as string | undefined,
          model: opts.model as string | undefined,
          apiKey: opts.apiKey as string | undefined,
          profile: opts.profile as string | undefined,
          resolvedConfig: cfg,
        });
      } catch (err) {
        handleError(err, Boolean(opts.json));
      }
    });
  },
};
