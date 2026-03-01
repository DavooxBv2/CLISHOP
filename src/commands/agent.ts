import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import {
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  getAgent,
  setActiveAgent,
  getActiveAgent,
  getConfig,
  AgentConfig,
} from "../config.js";
import { getApiClient } from "../api.js";

function printAgent(agent: AgentConfig, isActive: boolean): void {
  const marker = isActive ? chalk.green("● ") : "  ";
  console.log(`${marker}${chalk.bold(agent.name)}`);
  console.log(`    Max order amount:      ${agent.maxOrderAmount != null ? `$${agent.maxOrderAmount}` : chalk.dim("none")}`);
  console.log(`    Require confirmation:  ${agent.requireConfirmation ? chalk.green("yes") : chalk.yellow("no")}`);
  console.log(`    Allowed categories:    ${agent.allowedCategories?.length ? agent.allowedCategories.join(", ") : chalk.dim("all")}`);
  console.log(`    Blocked categories:    ${agent.blockedCategories?.length ? agent.blockedCategories.join(", ") : chalk.dim("none")}`);
  console.log(`    Default address:       ${agent.defaultAddressId || chalk.dim("not set")}`);
  console.log(`    Default payment:       ${agent.defaultPaymentMethodId || chalk.dim("not set")}`);
  console.log();
}

async function printMonthlyLimit(): Promise<void> {
  try {
    const api = getApiClient();
    const res = await api.get("/spending-limit");
    const limit = res.data.monthlySpendingLimitInCents;
    console.log(
      chalk.dim("  Monthly spending limit: ") +
        chalk.bold.white(`$${(limit / 100).toFixed(0)}/month`) +
        chalk.dim("  (change at https://clishop.ai/agents)")
    );
    console.log();
  } catch {
    // silently skip if not available
  }
}

export function registerAgentCommands(program: Command): void {
  const agent = program
    .command("agent")
    .description("Manage agents (safety profiles for ordering)");

  // ── LIST ───────────────────────────────────────────────────────────
  agent
    .command("list")
    .alias("ls")
    .description("List all agents")
    .action(async () => {
      const agents = listAgents();
      const active = getConfig().get("activeAgent");
      console.log(chalk.bold("\nAgents:\n"));
      await printMonthlyLimit();
      for (const a of agents) {
        printAgent(a, a.name === active);
      }
      console.log(chalk.dim(`Active agent marked with ${chalk.green("●")}`));
    });

  // ── CREATE ─────────────────────────────────────────────────────────
  agent
    .command("create <name>")
    .description("Create a new agent")
    .option("--max-amount <amount>", "Max order amount", parseFloat)
    .option("--no-confirm", "Don't require confirmation before ordering")
    .action(async (name: string, opts) => {
      try {
        const newAgent = createAgent(name, {
          maxOrderAmount: opts.maxAmount,
          requireConfirmation: opts.confirm !== false,
        });
        console.log(chalk.green(`\n✓ Agent "${newAgent.name}" created.\n`));
        printAgent(newAgent, false);
      } catch (error: any) {
        console.error(chalk.red(`\n✗ ${error.message}`));
        process.exitCode = 1;
      }
    });

  // ── USE (switch active) ────────────────────────────────────────────
  agent
    .command("use <name>")
    .description("Switch the active agent")
    .action((name: string) => {
      try {
        setActiveAgent(name);
        console.log(chalk.green(`\n✓ Active agent set to "${name}".`));
      } catch (error: any) {
        console.error(chalk.red(`\n✗ ${error.message}`));
        process.exitCode = 1;
      }
    });

  // ── SHOW ───────────────────────────────────────────────────────────
  agent
    .command("show [name]")
    .description("Show details of an agent (defaults to active)")
    .action((name?: string) => {
      const agentName = name || getConfig().get("activeAgent");
      const a = getAgent(agentName);
      if (!a) {
        console.error(chalk.red(`\n✗ Agent "${agentName}" not found.`));
        process.exitCode = 1;
        return;
      }
      console.log();
      printAgent(a, agentName === getConfig().get("activeAgent"));
    });

  // ── UPDATE ─────────────────────────────────────────────────────────
  agent
    .command("update [name]")
    .description("Update an agent's settings (interactive)")
    .action(async (name?: string) => {
      const agentName = name || getConfig().get("activeAgent");
      const existing = getAgent(agentName);
      if (!existing) {
        console.error(chalk.red(`\n✗ Agent "${agentName}" not found.`));
        process.exitCode = 1;
        return;
      }

      console.log();
      console.log(
        chalk.dim(
          "  Note: To change the monthly spending limit, run:"
        )
      );
      console.log(
        chalk.dim("  ") + chalk.white("clishop agent spending-limit <amount>")
      );
      console.log();

      const answers = await inquirer.prompt([
        {
          type: "number",
          name: "maxOrderAmount",
          message: "Max order amount ($):",
          default: existing.maxOrderAmount,
        },
        {
          type: "confirm",
          name: "requireConfirmation",
          message: "Require confirmation before ordering?",
          default: existing.requireConfirmation,
        },
        {
          type: "input",
          name: "allowedCategories",
          message: "Allowed categories (comma-separated, empty = all):",
          default: existing.allowedCategories?.join(", ") || "",
        },
        {
          type: "input",
          name: "blockedCategories",
          message: "Blocked categories (comma-separated, empty = none):",
          default: existing.blockedCategories?.join(", ") || "",
        },
      ]);

      const updated = updateAgent(agentName, {
        maxOrderAmount: answers.maxOrderAmount,
        requireConfirmation: answers.requireConfirmation,
        allowedCategories: answers.allowedCategories
          ? answers.allowedCategories.split(",").map((s: string) => s.trim()).filter(Boolean)
          : [],
        blockedCategories: answers.blockedCategories
          ? answers.blockedCategories.split(",").map((s: string) => s.trim()).filter(Boolean)
          : [],
      });

      console.log(chalk.green(`\n✓ Agent "${agentName}" updated.\n`));
      printAgent(updated, agentName === getConfig().get("activeAgent"));
    });

  // ── SPENDING-LIMIT ────────────────────────────────────────────────
  agent
    .command("spending-limit [amount]")
    .alias("limit")
    .description("View or change your monthly spending limit")
    .action(async (amount?: string) => {
      const api = getApiClient();

      // ── Show current limit ──
      let current: { monthlySpendingLimitInCents: number; configured: boolean };
      try {
        const res = await api.get("/spending-limit");
        current = res.data;
      } catch (error: any) {
        console.error(chalk.red(`\n✗ ${error?.response?.data?.message || error.message}`));
        process.exitCode = 1;
        return;
      }

      const currentDollars = (current.monthlySpendingLimitInCents / 100).toFixed(0);
      console.log(
        chalk.bold(`\n  Monthly spending limit: `) +
          chalk.bold.cyan(`$${currentDollars}/month`)
      );

      // ── If no amount given, just display and exit ──
      if (!amount) {
        if (current.configured) {
          console.log(
            chalk.dim("  To change it, run: ") +
              chalk.white("clishop agent spending-limit <amount>")
          );
          console.log(
            chalk.dim("  A confirmation email will be sent to verify the change.\n")
          );
        } else {
          console.log(
            chalk.dim("  Not yet configured. Run: ") +
              chalk.white("clishop agent spending-limit <amount>") +
              chalk.dim(" to set it.\n")
          );
        }
        return;
      }

      // ── Change limit ──
      const newAmount = parseFloat(amount);
      if (isNaN(newAmount) || newAmount < 1) {
        console.error(chalk.red("\n✗ Please provide a valid amount (minimum $1).\n"));
        process.exitCode = 1;
        return;
      }

      const limitInCents = Math.round(newAmount * 100);

      if (limitInCents === current.monthlySpendingLimitInCents) {
        console.log(chalk.yellow(`\n  Already set to $${newAmount}. No change needed.\n`));
        return;
      }

      try {
        const res = await api.patch("/spending-limit", { limitInCents });

        if (res.status === 202 || res.data.pendingLimitInCents) {
          // Email confirmation required
          console.log();
          console.log(chalk.yellow("  📧 Confirmation email sent!"));
          console.log(
            chalk.dim("  Check your inbox and click the link to confirm the change:")
          );
          console.log(
            chalk.dim(`  $${currentDollars}/month → $${newAmount}/month`)
          );
          console.log(
            chalk.dim("  The link expires in 72 hours.\n")
          );
        } else {
          // Direct set (first time)
          console.log(
            chalk.green(`\n  ✓ Monthly spending limit set to $${newAmount}/month.\n`)
          );
        }
      } catch (error: any) {
        console.error(chalk.red(`\n✗ ${error?.response?.data?.message || error.message}\n`));
        process.exitCode = 1;
      }
    });

  // ── DELETE ─────────────────────────────────────────────────────────
  agent
    .command("delete <name>")
    .alias("rm")
    .description("Delete an agent")
    .action(async (name: string) => {
      try {
        const { confirm } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirm",
            message: `Delete agent "${name}"? This cannot be undone.`,
            default: false,
          },
        ]);
        if (!confirm) return;

        deleteAgent(name);
        console.log(chalk.green(`\n✓ Agent "${name}" deleted.`));
      } catch (error: any) {
        console.error(chalk.red(`\n✗ ${error.message}`));
        process.exitCode = 1;
      }
    });
}
