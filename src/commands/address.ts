import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { getApiClient, handleApiError, ensureAgentOnBackend } from "../api.js";
import { getConfig, getActiveAgent, updateAgent } from "../config.js";
import { normalizeCountry, getCountryName } from "../countries.js";

export interface Address {
  id: string;
  label: string;
  firstName: string;
  lastName: string;
  phone?: string;
  companyName?: string;
  vatNumber?: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  region?: string;
  postalCode: string;
  country: string;
  instructions?: string;
}

/** Ask for a country by full name and confirm the resolved code before continuing */
async function askCountry(): Promise<{ code: string; name: string }> {
  while (true) {
    const { rawCountry } = await inquirer.prompt([
      {
        type: "input",
        name: "rawCountry",
        message: "Country (full name, e.g. Belgium, United States):",
        validate: (v: string) => (v.trim() ? true : "Country is required"),
      },
    ]);

    const result = normalizeCountry(rawCountry.trim());
    if (result.code && result.name) {
      console.log(chalk.green(`  ✓ Country: ${result.name} (${result.code})`));
      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: `Is "${result.name}" correct?`,
          default: true,
        },
      ]);
      if (confirm) {
        return { code: result.code, name: result.name };
      }
      // User said no — loop again
      continue;
    }

    // Could not resolve
    console.log(chalk.yellow(`  ⚠ Could not recognize "${rawCountry}" as a known country.`));
    console.log(chalk.dim("  Please try again with a full country name (e.g. Belgium, Germany, United States)."));
  }
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
        await ensureAgentOnBackend(agent.name);
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
          console.log(`    ${addr.firstName} ${addr.lastName}`);
          if (addr.companyName) console.log(`    ${chalk.cyan(addr.companyName)}`);
          console.log(`    ${addr.line1}`);
          if (addr.line2) console.log(`    ${addr.line2}`);
          console.log(`    ${addr.city}${addr.region ? `, ${addr.region}` : ""} ${addr.postalCode}`);
          const countryDisplay = getCountryName(addr.country) || addr.country;
          console.log(`    ${countryDisplay}`);
          if (addr.phone) console.log(`    ${chalk.dim("Phone:")} ${addr.phone}`);
          if (addr.vatNumber) console.log(`    ${chalk.dim("VAT:")} ${addr.vatNumber}`);
          if (addr.instructions) console.log(`    ${chalk.dim("Instructions:")} ${addr.instructions}`);
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
          {
            type: "input",
            name: "firstName",
            message: "First name:",
            validate: (v: string) => (v.trim() ? true : "First name is required"),
          },
          {
            type: "input",
            name: "lastName",
            message: "Last name:",
            validate: (v: string) => (v.trim() ? true : "Last name is required"),
          },
          { type: "input", name: "phone", message: "Phone number with country code (e.g. +32412345678, optional):" },
          {
            type: "input",
            name: "line1",
            message: "Street name and number:",
            validate: (v: string) => (v.trim() ? true : "Required"),
          },
          { type: "input", name: "line2", message: "Apartment, suite, floor, etc. (optional):" },
          {
            type: "input",
            name: "postalCode",
            message: "Postal / ZIP code:",
            validate: (v: string) => (v.trim() ? true : "Required"),
          },
          {
            type: "input",
            name: "city",
            message: "City:",
            validate: (v: string) => (v.trim() ? true : "Required"),
          },
          { type: "input", name: "region", message: "State / Province / Region (optional):" },
        ]);

        // Ask for country with confirmation
        const countryInfo = await askCountry();

        const { instructionsInput } = await inquirer.prompt([
          { type: "input", name: "instructionsInput", message: "Delivery instructions (optional):" },
        ]);

        const { isCompanyAddr } = await inquirer.prompt([
          {
            type: "confirm",
            name: "isCompanyAddr",
            message: "Is this a company/business address?",
            default: false,
          },
        ]);

        let companyAnswers = { companyName: "", vatNumber: "" };
        if (isCompanyAddr) {
          companyAnswers = await inquirer.prompt([
            {
              type: "input",
              name: "companyName",
              message: "Company name:",
              validate: (v: string) => (v.trim() ? true : "Required for company addresses"),
            },
            { type: "input", name: "vatNumber", message: "VAT number (optional):" },
          ]);
        }

        const { setDefault } = await inquirer.prompt([
          {
            type: "confirm",
            name: "setDefault",
            message: "Set as default address for this agent?",
            default: true,
          },
        ]);

        const spinner = ora("Saving address...").start();

        // Ensure agent exists on backend before saving
        await ensureAgentOnBackend(agent.name);

        const api = getApiClient();
        const res = await api.post("/addresses", {
          agent: agent.name,
          label: answers.label,
          firstName: answers.firstName.trim(),
          lastName: answers.lastName.trim(),
          phone: answers.phone || undefined,
          companyName: companyAnswers.companyName || undefined,
          vatNumber: companyAnswers.vatNumber || undefined,
          line1: answers.line1,
          line2: answers.line2 || undefined,
          city: answers.city,
          region: answers.region || undefined,
          postalCode: answers.postalCode,
          country: countryInfo.code,
          instructions: instructionsInput || undefined,
        });

        // Auto-set as default if it's the only/first address, or if explicitly requested
        if (setDefault || !agent.defaultAddressId) {
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

        // Clear default if it was this one, then auto-set if only one remains
        const agent = getActiveAgent();
        if (agent.defaultAddressId === id) {
          updateAgent(agent.name, { defaultAddressId: undefined });
        }

        // If only one address remains, auto-set it as default
        const remainingRes = await api.get("/addresses", { params: { agent: agent.name } });
        const remaining = remainingRes.data.addresses || [];
        if (remaining.length === 1) {
          updateAgent(agent.name, { defaultAddressId: remaining[0].id });
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
