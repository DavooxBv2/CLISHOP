#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { registerAuthCommands } from "./commands/auth.js";
import { registerAgentCommands } from "./commands/agent.js";
import { registerAddressCommands } from "./commands/address.js";
import { registerPaymentCommands } from "./commands/payment.js";
import { registerSearchCommands } from "./commands/search.js";
import { registerOrderCommands } from "./commands/order.js";
import { registerReviewCommands } from "./commands/review.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerStoreCommands } from "./commands/store.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerSetupCommand, runSetupWizard } from "./commands/setup.js";
import { getConfig } from "./config.js";

const program = new Command();

program
  .name("clishop")
  .version("0.1.0")
  .description(
    chalk.bold("CLISHOP") +
      " — Order anything from your terminal.\n\n" +
      "  Use agents to set safety limits, addresses, and payment methods.\n" +
      '  The "default" agent is used when no agent is specified.'
  )
  .option("--agent <name>", "Use a specific agent for this command")
  .hook("preAction", (thisCommand) => {
    const agentOpt = thisCommand.opts().agent;
    if (agentOpt) {
      const config = getConfig();
      if (!config.store.agents[agentOpt]) {
        console.error(chalk.red(`✗ Agent "${agentOpt}" does not exist.`));
        process.exit(1);
      }
      // Override the active agent for this run
      process.env.__CLISHOP_AGENT_OVERRIDE = agentOpt;
    }
  });

// Register all command groups
registerAuthCommands(program);
registerAgentCommands(program);
registerAddressCommands(program);
registerPaymentCommands(program);
registerSearchCommands(program);
registerOrderCommands(program);
registerReviewCommands(program);
registerConfigCommands(program);
registerStoreCommands(program);
registerStatusCommand(program);
registerSetupCommand(program);

// Main entry with first-run detection
async function main() {
  const hasSubcommand = process.argv.length > 2;

  // If the user just types "clishop" with no arguments and hasn't
  // completed setup yet, start the onboarding wizard automatically.
  if (!hasSubcommand) {
    const config = getConfig();
    if (!config.get("setupCompleted")) {
      await runSetupWizard();
      return;
    }
  }

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(chalk.red(err.message));
  process.exit(1);
});
