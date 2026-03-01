import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { openBrowser } from "./setup.js";
import { getApiClient, handleApiError, ensureAgentOnBackend } from "../api.js";
import { getActiveAgent, updateAgent } from "../config.js";

export interface PaymentMethod {
  id: string;
  type: "card" | "bank" | "paypal" | "other";
  label: string;
  last4?: string;
  expiresAt?: string;
}

export function registerPaymentCommands(program: Command): void {
  const payment = program
    .command("payment")
    .description("Manage payment methods (scoped to the active agent)");

  // ── LIST ───────────────────────────────────────────────────────────
  payment
    .command("list")
    .alias("ls")
    .description("List payment methods for the active agent")
    .action(async () => {
      try {
        const agent = getActiveAgent();
        await ensureAgentOnBackend(agent.name);
        const spinner = ora("Fetching payment methods...").start();
        const api = getApiClient();
        const res = await api.get("/payment-methods", {
          params: { agent: agent.name },
        });
        spinner.stop();

        const methods: PaymentMethod[] = res.data.paymentMethods;
        if (methods.length === 0) {
          console.log(chalk.yellow("\nNo payment methods found. Add one with: clishop payment add\n"));
          return;
        }

        console.log(chalk.bold(`\nPayment methods for agent "${agent.name}":\n`));
        for (const pm of methods) {
          const isDefault = pm.id === agent.defaultPaymentMethodId;
          const marker = isDefault ? chalk.green("● ") : "  ";
          // Label already contains "Brand •••• last4", don't duplicate
          console.log(`${marker}${chalk.bold(pm.label)} ${chalk.dim(`[${pm.type}]`)} ${chalk.dim(`(${pm.id})`)}`);
        }
        console.log();
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── ADD ────────────────────────────────────────────────────────────
  payment
    .command("add")
    .description("Add a payment method (opens browser for secure entry)")
    .action(async () => {
      try {
        const agent = getActiveAgent();
        await ensureAgentOnBackend(agent.name);
        const spinner = ora("Requesting secure payment setup link...").start();
        const api = getApiClient();
        const res = await api.post("/payment-methods/setup", {
          agent: agent.name,
        });
        spinner.stop();

        const { setupUrl } = res.data;
        console.log(chalk.bold("\nOpening secure payment setup in your browser...\n"));
        await openBrowser(setupUrl);
        console.log(chalk.cyan.underline(`  ${setupUrl}\n`));
        console.log(chalk.dim("The CLI never collects raw card details. Payment is set up via the secure web portal."));
        console.log(chalk.dim("Press Enter after completing the setup in your browser.\n"));

        // Wait for user to finish in browser
        const inquirer = (await import("inquirer")).default;
        await inquirer.prompt([
          { type: "input", name: "done", message: "Press Enter when done..." },
        ]);

        // Check for the new payment method and set as default if none set
        const checkSpinner = ora("Checking for your payment method...").start();
        const pmRes = await api.get("/payment-methods", { params: { agent: agent.name } });
        const methods = pmRes.data.paymentMethods || [];
        if (methods.length > 0) {
          const latest = methods[methods.length - 1];
          if (!agent.defaultPaymentMethodId) {
            updateAgent(agent.name, { defaultPaymentMethodId: latest.id });
            checkSpinner.succeed(chalk.green(`Payment method "${latest.label}" added and set as default.`));
          } else {
            checkSpinner.succeed(chalk.green(`Payment method "${latest.label}" added.`));
          }
        } else {
          checkSpinner.warn(chalk.yellow("No payment method found yet. Try again or run: clishop payment list"));
        }
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── REMOVE ─────────────────────────────────────────────────────────
  payment
    .command("remove <id>")
    .alias("rm")
    .description("Remove a payment method")
    .action(async (id: string) => {
      try {
        const spinner = ora("Removing payment method...").start();
        const api = getApiClient();
        await api.delete(`/payment-methods/${id}`);
        spinner.succeed(chalk.green("Payment method removed."));

        const agent = getActiveAgent();
        if (agent.defaultPaymentMethodId === id) {
          updateAgent(agent.name, { defaultPaymentMethodId: undefined });
        }
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── SET-DEFAULT ────────────────────────────────────────────────────
  payment
    .command("set-default <id>")
    .description("Set the default payment method for the active agent")
    .action((id: string) => {
      const agent = getActiveAgent();
      updateAgent(agent.name, { defaultPaymentMethodId: id });
      console.log(chalk.green(`\n✓ Default payment for agent "${agent.name}" set to ${id}.`));
    });
}
