import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { getApiClient, handleApiError } from "../api.js";

const STATUS_COLORS: Record<string, (s: string) => string> = {
  open: chalk.green,
  acknowledged: chalk.cyan,
  in_progress: chalk.yellow,
  fixed: chalk.blue,
  wont_fix: chalk.red,
  closed: chalk.dim,
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  in_progress: "In Progress",
  fixed: "Fixed",
  wont_fix: "Won't Fix",
  closed: "Closed",
};

const TYPE_COLORS: Record<string, (s: string) => string> = {
  bug: chalk.red,
  suggestion: chalk.magenta,
};

export function registerFeedbackCommands(program: Command): void {
  const feedback = program
    .command("feedback")
    .description("Report bugs and suggest improvements");

  // ── REPORT BUG ──────────────────────────────────────────────────────
  feedback
    .command("bug")
    .alias("report-bug")
    .description("Report a bug")
    .option("--title <title>", "Short summary of the bug")
    .option("--description <desc>", "General description")
    .option("--steps <steps>", "Steps to reproduce the bug")
    .option("--actual <behavior>", "What actually happens")
    .option("--expected <behavior>", "What you expected to happen")
    .action(async (opts) => {
      try {
        let title = opts.title;
        let description = opts.description;
        let stepsToReproduce = opts.steps;
        let actualBehavior = opts.actual;
        let expectedBehavior = opts.expected;

        // Interactive mode if flags missing
        if (!title || !description || !stepsToReproduce || !actualBehavior || !expectedBehavior) {
          console.log(chalk.bold("\n🐛 Report a Bug\n"));
          console.log(chalk.dim("Help us fix issues by describing what went wrong.\n"));

          const answers = await inquirer.prompt([
            ...(!title ? [{
              type: "input" as const,
              name: "title",
              message: "Bug title (short summary):",
              validate: (v: string) => v.trim().length > 0 || "Title is required",
            }] : []),
            ...(!description ? [{
              type: "input" as const,
              name: "description",
              message: "General description of the bug:",
              validate: (v: string) => v.trim().length > 0 || "Description is required",
            }] : []),
            ...(!stepsToReproduce ? [{
              type: "editor" as const,
              name: "stepsToReproduce",
              message: "Steps to reproduce (how do you trigger this bug?):",
            }] : []),
            ...(!actualBehavior ? [{
              type: "input" as const,
              name: "actualBehavior",
              message: "What happens (actual behavior)?",
              validate: (v: string) => v.trim().length > 0 || "Actual behavior is required",
            }] : []),
            ...(!expectedBehavior ? [{
              type: "input" as const,
              name: "expectedBehavior",
              message: "What did you expect to happen?",
              validate: (v: string) => v.trim().length > 0 || "Expected behavior is required",
            }] : []),
          ]);

          title = title || answers.title;
          description = description || answers.description;
          stepsToReproduce = stepsToReproduce || answers.stepsToReproduce;
          actualBehavior = actualBehavior || answers.actualBehavior;
          expectedBehavior = expectedBehavior || answers.expectedBehavior;
        }

        if (!stepsToReproduce?.trim()) {
          console.error(chalk.red("\n✗ Steps to reproduce are required.\n"));
          return;
        }

        const spinner = ora("Submitting bug report...").start();
        const api = getApiClient();
        const res = await api.post("/feedback", {
          type: "bug",
          title: title.trim(),
          description: description.trim(),
          stepsToReproduce: stepsToReproduce.trim(),
          actualBehavior: actualBehavior.trim(),
          expectedBehavior: expectedBehavior.trim(),
        });
        spinner.succeed(chalk.green("Bug report submitted!"));

        const f = res.data.feedback;
        console.log();
        console.log(`  ${chalk.bold("ID:")}      ${chalk.cyan(f.id)}`);
        console.log(`  ${chalk.bold("Title:")}   ${f.title}`);
        console.log(`  ${chalk.bold("Status:")}  ${(STATUS_COLORS[f.status] || chalk.white)(STATUS_LABELS[f.status] || f.status)}`);
        console.log();
        console.log(chalk.dim("  We'll investigate and update the status. Check back with:"));
        console.log(chalk.dim(`  clishop feedback show ${f.id}`));
        console.log();
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── SUGGEST ─────────────────────────────────────────────────────────
  feedback
    .command("suggest")
    .alias("suggestion")
    .description("Suggest an improvement or feature")
    .option("--title <title>", "Short summary")
    .option("--description <desc>", "Detailed suggestion")
    .action(async (opts) => {
      try {
        let title = opts.title;
        let description = opts.description;

        if (!title || !description) {
          console.log(chalk.bold("\n💡 Suggest an Improvement\n"));
          console.log(chalk.dim("Tell us how we can make CLISHOP better.\n"));

          const answers = await inquirer.prompt([
            ...(!title ? [{
              type: "input" as const,
              name: "title",
              message: "Suggestion title (short summary):",
              validate: (v: string) => v.trim().length > 0 || "Title is required",
            }] : []),
            ...(!description ? [{
              type: "editor" as const,
              name: "description",
              message: "Describe your suggestion (opens editor):",
            }] : []),
          ]);

          title = title || answers.title;
          description = description || answers.description;
        }

        if (!description?.trim()) {
          console.error(chalk.red("\n✗ Description is required.\n"));
          return;
        }

        const spinner = ora("Submitting suggestion...").start();
        const api = getApiClient();
        const res = await api.post("/feedback", {
          type: "suggestion",
          title: title.trim(),
          description: description.trim(),
        });
        spinner.succeed(chalk.green("Suggestion submitted!"));

        const f = res.data.feedback;
        console.log();
        console.log(`  ${chalk.bold("ID:")}      ${chalk.cyan(f.id)}`);
        console.log(`  ${chalk.bold("Title:")}   ${f.title}`);
        console.log(`  ${chalk.bold("Status:")}  ${(STATUS_COLORS[f.status] || chalk.white)(STATUS_LABELS[f.status] || f.status)}`);
        console.log();
        console.log(chalk.dim("  Thanks for the suggestion! Check status with:"));
        console.log(chalk.dim(`  clishop feedback show ${f.id}`));
        console.log();
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── LIST FEEDBACK ───────────────────────────────────────────────────
  feedback
    .command("list")
    .alias("ls")
    .description("List your bug reports and suggestions")
    .option("--type <type>", "Filter by type (bug or suggestion)")
    .option("--status <status>", "Filter by status")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const spinner = ora("Fetching feedback...").start();
        const api = getApiClient();
        const res = await api.get("/feedback", {
          params: {
            ...(opts.type ? { type: opts.type } : {}),
            ...(opts.status ? { status: opts.status } : {}),
          },
        });
        spinner.stop();

        const items = res.data.feedback;

        if (opts.json) {
          console.log(JSON.stringify(res.data, null, 2));
          return;
        }

        if (items.length === 0) {
          console.log(chalk.yellow("\nNo feedback found.\n"));
          return;
        }

        console.log(chalk.bold("\nYour Feedback:\n"));
        for (const f of items) {
          const typeColor = TYPE_COLORS[f.type] || chalk.white;
          const statusColor = STATUS_COLORS[f.status] || chalk.white;
          const date = new Date(f.createdAt).toLocaleDateString();
          const typeLabel = f.type === "bug" ? "🐛 BUG" : "💡 SUGGESTION";

          console.log(
            `  ${chalk.bold(f.id)}  ${typeColor(typeLabel.padEnd(14))}  ${statusColor((STATUS_LABELS[f.status] || f.status).padEnd(14))}  ${chalk.dim(date)}`
          );
          console.log(`  ${chalk.bold(f.title)}`);
          if (f.adminNote) {
            console.log(`  ${chalk.cyan("Admin:")} ${f.adminNote}`);
          }
          console.log();
        }
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── SHOW FEEDBACK ───────────────────────────────────────────────────
  feedback
    .command("show <id>")
    .description("View a bug report or suggestion")
    .option("--json", "Output raw JSON")
    .action(async (id: string, opts) => {
      try {
        const spinner = ora("Fetching feedback...").start();
        const api = getApiClient();
        const res = await api.get(`/feedback/${id}`);
        spinner.stop();

        const f = res.data.feedback;

        if (opts.json) {
          console.log(JSON.stringify(f, null, 2));
          return;
        }

        const statusColor = STATUS_COLORS[f.status] || chalk.white;
        const typeLabel = f.type === "bug" ? "🐛 Bug Report" : "💡 Suggestion";

        console.log();
        console.log(chalk.bold(`  ${typeLabel} — ${chalk.cyan(f.id)}`));
        console.log(`  ${chalk.bold("Title:")}    ${f.title}`);
        console.log(`  ${chalk.bold("Status:")}   ${statusColor(STATUS_LABELS[f.status] || f.status)}`);
        console.log(`  ${chalk.bold("Created:")}  ${new Date(f.createdAt).toLocaleString()}`);
        console.log(`  ${chalk.bold("Updated:")}  ${new Date(f.updatedAt).toLocaleString()}`);

        console.log(chalk.bold("\n  Description:"));
        console.log(`  ${f.description}`);

        if (f.type === "bug") {
          console.log(chalk.bold("\n  Steps to Reproduce:"));
          console.log(`  ${f.stepsToReproduce}`);

          console.log(chalk.bold("\n  Actual Behavior:"));
          console.log(`  ${chalk.red(f.actualBehavior)}`);

          console.log(chalk.bold("\n  Expected Behavior:"));
          console.log(`  ${chalk.green(f.expectedBehavior)}`);
        }

        if (f.adminNote) {
          console.log(chalk.bold("\n  Admin Response:"));
          console.log(`  ${chalk.cyan(f.adminNote)}`);
        }

        console.log();
      } catch (error) {
        handleApiError(error);
      }
    });
}
