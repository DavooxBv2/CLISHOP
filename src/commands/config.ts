import { Command } from "commander";
import chalk from "chalk";
import { getConfig } from "../config.js";

export function registerConfigCommands(program: Command): void {
  const config = program
    .command("config")
    .description("View and manage CLI configuration");

  // ── SHOW ───────────────────────────────────────────────────────────
  config
    .command("show")
    .description("Show current configuration")
    .action(() => {
      const cfg = getConfig();
      console.log(chalk.bold("\nCLISHOP Configuration:\n"));
      console.log(`  API URL:        ${chalk.cyan(cfg.get("apiBaseUrl"))}`);
      console.log(`  Active agent:   ${chalk.cyan(cfg.get("activeAgent"))}`);
      console.log(`  Output format:  ${chalk.cyan(cfg.get("outputFormat"))}`);
      console.log(`  Config path:    ${chalk.dim(cfg.path)}`);
      console.log();
    });

  // ── SET API URL ────────────────────────────────────────────────────
  config
    .command("set-api-url <url>")
    .description("Set the backend API URL")
    .action((url: string) => {
      const cfg = getConfig();
      cfg.set("apiBaseUrl", url);
      console.log(chalk.green(`\n✓ API URL set to ${url}`));
    });

  // ── SET OUTPUT FORMAT ──────────────────────────────────────────────
  config
    .command("set-output <format>")
    .description("Set output format: human or json")
    .action((format: string) => {
      if (format !== "human" && format !== "json") {
        console.error(chalk.red('✗ Format must be "human" or "json".'));
        process.exitCode = 1;
        return;
      }
      const cfg = getConfig();
      cfg.set("outputFormat", format);
      console.log(chalk.green(`\n✓ Output format set to "${format}".`));
    });

  // ── RESET ──────────────────────────────────────────────────────────
  config
    .command("reset")
    .description("Reset all configuration to defaults")
    .action(() => {
      const cfg = getConfig();
      cfg.clear();
      console.log(chalk.green("\n✓ Configuration reset to defaults."));
    });

  // ── PATH ───────────────────────────────────────────────────────────
  config
    .command("path")
    .description("Show the config file path")
    .action(() => {
      const cfg = getConfig();
      console.log(cfg.path);
    });
}
