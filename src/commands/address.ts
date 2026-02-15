import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { getApiClient, handleApiError } from "../api.js";
import { getConfig, getActiveAgent, updateAgent } from "../config.js";

export interface Address {
  id: string;
  label: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export function registerAddressCommands(program: Command): void {
  const address = program
    .command("address")
    .description("Manage shipping addresses (scoped to the active agent)");

  // ── LIST ───────────────────────────────────────────────────────────
  address
    .command("list")
    .alias("ls")
    .description("List all addresses for the active agent")
    .action(async () => {
      try {
        const agent = getActiveAgent();
        const spinner = ora("Fetching addresses...").start();
        const api = getApiClient();
        const res = await api.get("/addresses", {
          params: { agent: agent.name },
        });
        spinner.stop();

        const addresses: Address[] = res.data.addresses;
        if (addresses.length === 0) {
          console.log(chalk.yellow("\nNo addresses found. Add one with: clishop address add\n"));
          return;
        }

        console.log(chalk.bold(`\nAddresses for agent "${agent.name}":\n`));
        for (const addr of addresses) {
          const isDefault = addr.id === agent.defaultAddressId;
          const marker = isDefault ? chalk.green("● ") : "  ";
          console.log(`${marker}${chalk.bold(addr.label)} ${chalk.dim(`(${addr.id})`)}`);
          console.log(`    ${addr.line1}`);
          if (addr.line2) console.log(`    ${addr.line2}`);
          console.log(`    ${addr.city}, ${addr.state} ${addr.postalCode}`);
          console.log(`    ${addr.country}`);
          console.log();
        }
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── ADD ────────────────────────────────────────────────────────────
  address
    .command("add")
    .description("Add a new address")
    .action(async () => {
      try {
        const agent = getActiveAgent();
        const answers = await inquirer.prompt([
          { type: "input", name: "label", message: "Label (e.g. Home, Office):" },
          { type: "input", name: "line1", message: "Address line 1:" },
          { type: "input", name: "line2", message: "Address line 2 (optional):" },
          { type: "input", name: "city", message: "City:" },
          { type: "input", name: "state", message: "State/Province:" },
          { type: "input", name: "postalCode", message: "Postal code:" },
          { type: "input", name: "country", message: "Country:", default: "US" },
          {
            type: "confirm",
            name: "setDefault",
            message: "Set as default address for this agent?",
            default: true,
          },
        ]);

        const spinner = ora("Saving address...").start();
        const api = getApiClient();
        const res = await api.post("/addresses", {
          agent: agent.name,
          label: answers.label,
          line1: answers.line1,
          line2: answers.line2 || undefined,
          city: answers.city,
          state: answers.state,
          postalCode: answers.postalCode,
          country: answers.country,
        });

        if (answers.setDefault) {
          updateAgent(agent.name, { defaultAddressId: res.data.address.id });
        }

        spinner.succeed(chalk.green(`Address "${answers.label}" added.`));
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── REMOVE ─────────────────────────────────────────────────────────
  address
    .command("remove <id>")
    .alias("rm")
    .description("Remove an address by ID")
    .action(async (id: string) => {
      try {
        const { confirm } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirm",
            message: `Delete address ${id}?`,
            default: false,
          },
        ]);
        if (!confirm) return;

        const spinner = ora("Removing address...").start();
        const api = getApiClient();
        await api.delete(`/addresses/${id}`);
        spinner.succeed(chalk.green("Address removed."));

        // Clear default if it was this one
        const agent = getActiveAgent();
        if (agent.defaultAddressId === id) {
          updateAgent(agent.name, { defaultAddressId: undefined });
        }
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── SET-DEFAULT ────────────────────────────────────────────────────
  address
    .command("set-default <id>")
    .description("Set the default address for the active agent")
    .action((id: string) => {
      const agent = getActiveAgent();
      updateAgent(agent.name, { defaultAddressId: id });
      console.log(chalk.green(`\n✓ Default address for agent "${agent.name}" set to ${id}.`));
    });
}
