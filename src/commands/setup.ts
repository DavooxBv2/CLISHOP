declare const BUILD_TIMESTAMP: string;

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import open from "open";
import { execFileSync } from "child_process";
import { login, register, isLoggedIn, getUserInfo } from "../auth.js";
import {
  getConfig,
  getActiveAgent,
  createAgent,
  updateAgent,
  setActiveAgent,
} from "../config.js";
import { getApiClient, ensureAgentOnBackend } from "../api.js";
import { normalizeCountry } from "../countries.js";

// ── Helpers ────────────────────────────────────────────────────────────

/** Open a URL in the user's default browser — uses platform-native commands first (most reliable), then `open` package */
export async function openBrowser(url: string): Promise<boolean> {
  // On Windows, exec/execFile with `start` is the most reliable approach
  try {
    if (process.platform === "win32") {
      execFileSync("cmd", ["/c", "start", "", url], { stdio: "ignore" });
      return true;
    } else if (process.platform === "darwin") {
      execFileSync("open", [url], { stdio: "ignore" });
      return true;
    } else {
      execFileSync("xdg-open", [url], { stdio: "ignore" });
      return true;
    }
  } catch {
    // native command failed — try `open` package as fallback
  }
  try {
    await open(url);
    return true;
  } catch {
    return false;
  }
}

function divider(color: typeof chalk.cyan = chalk.cyan): void {
  console.log("  " + color("─".repeat(48)));
}

function stepHeader(step: number, total: number, title: string): void {
  console.log();
  divider();
  console.log();
  console.log(
    chalk.bold.white(`  STEP ${step} of ${total}`) +
      chalk.dim(" · ") +
      chalk.bold(title)
  );
  console.log();
}

// ── Command Registration ───────────────────────────────────────────────

export function registerSetupCommand(program: Command): void {
  program
    .command("setup")
    .description(
      "First-time setup wizard — account, agent, address, payment, first search"
    )
    .action(async () => {
      await runSetupWizard();
    });
}

// ── The Setup Wizard ───────────────────────────────────────────────────

export async function runSetupWizard(): Promise<void> {
  const config = getConfig();

  // ── Welcome Banner ─────────────────────────────────────────────────

  console.log();
  divider(chalk.cyan);
  console.log();
  console.log(chalk.bold.cyan("      W E L C O M E   T O   C L I S H O P"));
  console.log(chalk.dim("      Order anything from your terminal."));
  console.log(chalk.dim(`      Build: ${BUILD_TIMESTAMP}`));
  console.log();
  divider(chalk.cyan);
  console.log();
  console.log(
    chalk.dim("  This wizard will guide you through the initial setup.")
  );
  console.log(
    chalk.dim("  It only takes a minute. You can re-run it anytime with:")
  );
  console.log(chalk.dim("  ") + chalk.white("clishop setup"));
  console.log();

  // ── PATH instruction ──────────────────────────────────────────────
  console.log(
    chalk.bold.yellow("  📋 PATH Setup")
  );
  console.log(
    chalk.dim("  Make sure clishop is in your PATH so your AI agents can use it.")
  );
  console.log(
    chalk.dim("  If you installed via npm globally (") +
      chalk.white("npm i -g clishop") +
      chalk.dim("), it should already be available.")
  );
  console.log(
    chalk.dim("  Verify with: ") + chalk.white("clishop --version")
  );
  console.log(
    chalk.dim("  If not, add the npm global bin to your PATH:")
  );
  console.log(
    chalk.dim("    macOS/Linux: ") + chalk.white('export PATH="$(npm config get prefix)/bin:$PATH"')
  );
  console.log(
    chalk.dim("    Windows:     ") + chalk.white("npm config get prefix") + chalk.dim(" → add that path to your system PATH")
  );
  console.log();

  // ── Choose CLI or Web setup ──────────────────────────────────────

  const { setupMethod } = await inquirer.prompt([
    {
      type: "select",
      name: "setupMethod",
      message: "How would you like to configure CLISHOP?",
      choices: [
        { name: "Here in the CLI", value: "cli" },
        { name: "On the website (opens browser)", value: "web" },
      ],
    },
  ]);

  if (setupMethod === "web") {
    const webSetupUrl = "https://clishop.ai/setup";
    console.log();
    console.log(chalk.bold("  Opening the setup wizard on the website..."));
    console.log();
    console.log("  " + chalk.cyan.underline(webSetupUrl));
    console.log();
    console.log(
      chalk.dim("  Complete the setup there, then return here and run:")
    );
    console.log(chalk.dim("  ") + chalk.white("clishop login"));
    console.log();

    const opened = await openBrowser(webSetupUrl);
    if (!opened) {
      console.log(
        chalk.yellow("  Could not open browser automatically. Please visit the link above.")
      );
    }

    config.set("setupCompleted", true);
    return;
  }

  // ════════════════════════════════════════════════════════════════════
  // STEP 1 — Account
  // ════════════════════════════════════════════════════════════════════

  stepHeader(1, 5, "Account");

  let loggedIn = await isLoggedIn();

  if (loggedIn) {
    const user = await getUserInfo();
    console.log(
      chalk.green(
        `  ✓ Already logged in as ${chalk.bold(user?.name || user?.email || "unknown")}`
      )
    );
    console.log();

    const { continueAs } = await inquirer.prompt([
      {
        type: "confirm",
        name: "continueAs",
        message: `Continue as ${user?.email}?`,
        default: true,
      },
    ]);

    if (!continueAs) {
      loggedIn = false;
    }
  }

  if (!loggedIn) {
    const { authChoice } = await inquirer.prompt([
      {
        type: "select",
        name: "authChoice",
        message: "Do you have a CLISHOP account?",
        choices: [
          { name: "No  — create a new account", value: "register" },
          { name: "Yes — log in to existing account", value: "login" },
        ],
      },
    ]);

    if (authChoice === "register") {
      // ── Registration ───────────────────────────────────────────────
      console.log();
      console.log(
        chalk.dim("  By creating an account you agree to the CLISHOP")
      );
      console.log(
        chalk.dim("  Terms & Conditions: ") +
          chalk.cyan.underline("https://clishop.ai/terms")
      );
      console.log(
        chalk.dim("  Privacy Policy:     ") +
          chalk.cyan.underline("https://clishop.ai/privacy")
      );
      console.log();

      const answers = await inquirer.prompt([
        { type: "input", name: "name", message: "Your name:" },
        { type: "input", name: "email", message: "Email:" },
        {
          type: "password",
          name: "password",
          message: "Password:",
          mask: "*",
        },
        {
          type: "password",
          name: "confirmPassword",
          message: "Confirm password:",
          mask: "*",
        },
      ]);

      if (answers.password !== answers.confirmPassword) {
        console.error(chalk.red("\n  ✗ Passwords do not match."));
        console.log(
          chalk.dim("  Run ") +
            chalk.white("clishop setup") +
            chalk.dim(" to try again.\n")
        );
        process.exitCode = 1;
        return;
      }

      const spinner = ora("Creating your account...").start();
      try {
        const user = await register(
          answers.email,
          answers.password,
          answers.name
        );
        spinner.succeed(
          chalk.green(
            `Account created! Welcome, ${chalk.bold(user.name)}.`
          )
        );
      } catch (error: any) {
        spinner.fail(
          chalk.red(
            `Registration failed: ${error?.response?.data?.message || error.message}`
          )
        );
        console.log();
        console.log(
          chalk.dim(
            "  Make sure the backend is running at: " +
              chalk.white(config.get("apiBaseUrl"))
          )
        );
        console.log(
          chalk.dim("  Then run ") +
            chalk.white("clishop setup") +
            chalk.dim(" again.\n")
        );
        process.exitCode = 1;
        return;
      }
    } else {
      // ── Login ──────────────────────────────────────────────────────
      const answers = await inquirer.prompt([
        { type: "input", name: "email", message: "Email:" },
        {
          type: "password",
          name: "password",
          message: "Password:",
          mask: "*",
        },
      ]);

      const spinner = ora("Logging in...").start();
      try {
        const user = await login(answers.email, answers.password);
        spinner.succeed(
          chalk.green(`Logged in as ${chalk.bold(user.name)}.`)
        );
      } catch (error: any) {
        spinner.fail(
          chalk.red(
            `Login failed: ${error?.response?.data?.message || error.message}`
          )
        );
        console.log();
        console.log(
          chalk.dim(
            "  Make sure the backend is running at: " +
              chalk.white(config.get("apiBaseUrl"))
          )
        );
        console.log(
          chalk.dim("  Then run ") +
            chalk.white("clishop setup") +
            chalk.dim(" again.\n")
        );
        process.exitCode = 1;
        return;
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // STEP 2 — Agent
  // ════════════════════════════════════════════════════════════════════

  stepHeader(2, 5, "Agent");

  console.log(
    chalk.dim(
      "  Agents are safety profiles that control per-order limits and categories."
    )
  );
  console.log(
    chalk.dim("  A default agent is ready. You can customize it or create a new one.")
  );
  console.log(
    chalk.dim("  Default settings: ") +
    chalk.white("$200 max per order") +
    chalk.dim(", ") +
    chalk.white("confirmation required") +
    chalk.dim(" for every order.")
  );
  console.log(
    chalk.dim("  When an order is placed, you'll receive an ") +
    chalk.white("email") +
    chalk.dim(" and can also confirm on the ") +
    chalk.white("website") +
    chalk.dim(".")
  );
  console.log();

  const { agentChoice } = await inquirer.prompt([
    {
      type: "confirm",
      name: "agentChoice",
      message: "Configure a custom agent instead?",
      default: false,
    },
  ]);

  if (agentChoice) {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "Agent name:",
        validate: (v: string) => (v.trim() ? true : "Name is required"),
      },
      {
        type: "number",
        name: "maxOrderAmount",
        message: "Max order amount per order ($) (optional, default $200):",
        default: 200,
      },
      {
        type: "confirm",
        name: "requireConfirmation",
        message: "Require confirmation before ordering?",
        default: true,
      },
    ]);

    const maxAmount = answers.maxOrderAmount || 200;

    if (answers.requireConfirmation) {
      console.log();
      console.log(
        chalk.dim("  🔒 When an order is placed you can confirm it via ") +
          chalk.white("email") +
          chalk.dim(" or on the ") +
          chalk.white("website dashboard") +
          chalk.dim(" — both are always available.")
      );
    }

    try {
      const agent = createAgent(answers.name.trim(), {
        maxOrderAmount: maxAmount,
        requireConfirmation: answers.requireConfirmation,
      });
      setActiveAgent(agent.name);

      // Sync this agent to the backend
      const syncSpinner = ora("Syncing agent to backend...").start();
      await ensureAgentOnBackend(
        agent.name,
        maxAmount * 100,
        answers.requireConfirmation
      );
      syncSpinner.succeed(
        chalk.green(
          `Agent "${chalk.bold(agent.name)}" created and set as active.`
        )
      );
    } catch (error: any) {
      console.error(chalk.red(`\n  ✗ ${error.message}`));
      console.log(chalk.dim("  Continuing with the default agent."));
    }
  } else {
    console.log(chalk.green("  ✓ Using default agent (max $200/order, confirmation required)."));
  }

  // ════════════════════════════════════════════════════════════════════
  // STEP 3 — Shipping Address
  // ════════════════════════════════════════════════════════════════════

  stepHeader(3, 5, "Shipping Address");

  console.log(
    chalk.dim(
      "  Add an address so products can be delivered to you."
    )
  );
  console.log(
    chalk.dim(
      "  A shipping country is required for product searches to work correctly."
    )
  );
  console.log();

  let addressCity = "";
  let addressCountry = "";

  {
    const addr = await inquirer.prompt([
      {
        type: "input",
        name: "label",
        message: "Label (e.g. Home, Office):",
        default: "Home",
      },
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
      {
        type: "input",
        name: "phone",
        message: "Phone number with country code (e.g. +32412345678, optional):",
      },
      {
        type: "input",
        name: "line1",
        message: "Street name and number:",
        validate: (v: string) => (v.trim() ? true : "Required"),
      },
      {
        type: "input",
        name: "line2",
        message: "Apartment, suite, floor, etc. (optional):",
      },
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
      {
        type: "input",
        name: "region",
        message: "State / Province / Region (optional):",
      },
    ]);

    // Ask for country with confirmation loop
    let resolvedCountryCode = "";
    let resolvedCountryName = "";
    while (true) {
      const { rawCountry } = await inquirer.prompt([
        {
          type: "input",
          name: "rawCountry",
          message: "Country (full name, e.g. Belgium, United States):",
          validate: (v: string) => (v.trim() ? true : "Country is required"),
        },
      ]);
      const countryResult = normalizeCountry(rawCountry.trim());
      if (countryResult.code && countryResult.name) {
        console.log(chalk.green(`  ✓ Country: ${countryResult.name} (${countryResult.code})`));
        const { confirmCountry } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirmCountry",
            message: `Is "${countryResult.name}" correct?`,
            default: true,
          },
        ]);
        if (confirmCountry) {
          resolvedCountryCode = countryResult.code;
          resolvedCountryName = countryResult.name;
          break;
        }
        continue;
      }
      console.log(chalk.yellow(`  ⚠ Could not recognize "${rawCountry}" as a known country.`));
      console.log(chalk.dim("  Please try again with a full country name (e.g. Belgium, Germany, United States)."));
    }
    addressCountry = resolvedCountryCode;

    const { instructionsInput } = await inquirer.prompt([
      {
        type: "input",
        name: "instructionsInput",
        message: "Delivery instructions (optional):",
      },
    ]);

    const { isCompanySetup } = await inquirer.prompt([
      {
        type: "confirm",
        name: "isCompanySetup",
        message: "Is this a company/business address?",
        default: false,
      },
    ]);

    let companyInfo = { companyName: "", vatNumber: "" };
    if (isCompanySetup) {
      companyInfo = await inquirer.prompt([
        {
          type: "input",
          name: "companyName",
          message: "Company name:",
          validate: (v: string) => (v.trim() ? true : "Required for company addresses"),
        },
        {
          type: "input",
          name: "vatNumber",
          message: "VAT number (optional):",
        },
      ]);
    }

    addressCity = addr.city;

    const spinner = ora("Saving address...").start();
    try {
      const api = getApiClient();
      const agent = getActiveAgent();

      // Ensure both the active agent and "default" agent exist on the backend
      await ensureAgentOnBackend(agent.name);
      if (agent.name !== "default") {
        await ensureAgentOnBackend("default");
      }

      // Save the address to the active agent
      const res = await api.post("/addresses", {
        agent: agent.name,
        label: addr.label,
        firstName: addr.firstName.trim(),
        lastName: addr.lastName.trim(),
        phone: addr.phone || undefined,
        companyName: companyInfo.companyName || undefined,
        vatNumber: companyInfo.vatNumber || undefined,
        line1: addr.line1,
        line2: addr.line2 || undefined,
        city: addr.city,
        region: addr.region || undefined,
        postalCode: addr.postalCode,
        country: resolvedCountryCode,
        instructions: instructionsInput || undefined,
      });

      const addressId = res.data.address.id;

      // Set as default address for the active agent
      updateAgent(agent.name, { defaultAddressId: addressId });

      // Also link the same address to the "default" agent if active agent is different
      if (agent.name !== "default") {
        try {
          await api.post("/addresses", {
            agent: "default",
            label: addr.label,
            firstName: addr.firstName.trim(),
            lastName: addr.lastName.trim(),
            phone: addr.phone || undefined,
            companyName: companyInfo.companyName || undefined,
            vatNumber: companyInfo.vatNumber || undefined,
            line1: addr.line1,
            line2: addr.line2 || undefined,
            city: addr.city,
            region: addr.region || undefined,
            postalCode: addr.postalCode,
            country: resolvedCountryCode,
            instructions: instructionsInput || undefined,
          });
          updateAgent("default", { defaultAddressId: addressId });
        } catch {
          // Non-critical — address is already saved for the custom agent
        }
      }

      spinner.succeed(
        chalk.green(
          `Address "${addr.label}" saved and set as default${agent.name !== "default" ? ` for both "${agent.name}" and "default" agents` : ""}.`
        )
      );
    } catch (error: any) {
      spinner.fail(
        chalk.red(
          `Failed to save address: ${error?.response?.data?.message || error.message}`
        )
      );
      console.log(
        chalk.dim(
          "  You can add an address later with: " +
            chalk.white("clishop address add")
        )
      );
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // STEP 5 — Payment Method
  // ════════════════════════════════════════════════════════════════════

  stepHeader(4, 5, "Payment Method");

  console.log(
    chalk.dim(
      "  For security, payment details are entered through a secure web"
    )
  );
  console.log(
    chalk.dim("  page. The CLI never sees your card number.")
  );
  console.log();

  const { addPayment } = await inquirer.prompt([
    {
      type: "confirm",
      name: "addPayment",
      message: "Set up a payment method now?",
      default: true,
    },
  ]);

  if (addPayment) {
    const spinner = ora("Requesting secure payment setup link...").start();
    try {
      const api = getApiClient();
      const agent = getActiveAgent();

      // Ensure agent exists on backend before requesting payment setup
      await ensureAgentOnBackend(agent.name);

      const res = await api.post("/payment-methods/setup", {
        agent: agent.name,
      });
      spinner.stop();
      const { setupUrl } = res.data;

      console.log();
      console.log(
        chalk.bold(
          "  Open this link in your browser to add a payment method:"
        )
      );
      console.log();
      console.log("  " + chalk.cyan.underline(setupUrl));
      console.log();
      console.log(
        chalk.dim(
          '  Once done, verify with: ' + chalk.white("clishop payment list")
        )
      );

      // Try to open the browser automatically
      const paymentOpened = await openBrowser(setupUrl);
      if (paymentOpened) {
        console.log(chalk.dim("  (Browser opened automatically)"));
      }

      console.log();
      await inquirer.prompt([
        {
          type: "input",
          name: "done",
          message: "Press Enter after completing the payment setup in your browser...",
        },
      ]);

      // Poll for the new payment method and set it as default
      const pollSpinner = ora("Checking for your payment method...").start();
      try {
        const agent = getActiveAgent();
        await ensureAgentOnBackend(agent.name);
        const pmRes = await api.get("/payment-methods", {
          params: { agent: agent.name },
        });
        const methods = pmRes.data.paymentMethods || [];
        if (methods.length > 0) {
          // Use the most recently added one
          const latest = methods[methods.length - 1];
          updateAgent(agent.name, { defaultPaymentMethodId: latest.id });
          pollSpinner.succeed(
            chalk.green(`Payment method "${latest.label}" found and set as default.`)
          );
        } else {
          pollSpinner.warn(
            chalk.yellow("No payment method found yet. You can add one later with: clishop payment add")
          );
        }
      } catch {
        pollSpinner.warn(
          chalk.yellow("Could not verify payment method. You can check with: clishop payment list")
        );
      }
    } catch (error: any) {
      spinner.fail(
        chalk.red(
          `Could not get setup link: ${error?.response?.data?.message || error.message}`
        )
      );
      console.log(
        chalk.dim(
          "  You can set up payment later with: " +
            chalk.white("clishop payment add")
        )
      );
    }
  } else {
    console.log(
      chalk.dim(
        "\n  You can set one up later with: " +
          chalk.white("clishop payment add")
      )
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // STEP 6 — First Search
  // ════════════════════════════════════════════════════════════════════

  stepHeader(5, 5, "Your First Search");

  if (addressCity) {
    console.log(
      chalk.dim(
        `  Let's find something! Products can be shipped to ${chalk.white(addressCity)}.`
      )
    );
  } else if (addressCountry) {
    console.log(
      chalk.dim(
        `  Let's find something! Searching products available in ${chalk.white(addressCountry)}.`
      )
    );
  } else {
    console.log(chalk.dim("  Let's find something to order!"));
  }
  console.log();

  const { searchQuery } = await inquirer.prompt([
    {
      type: "input",
      name: "searchQuery",
      message: "Search for a product (or press Enter to skip):",
      default: "headphones",
    },
  ]);

  if (searchQuery.trim()) {
    // Run the real `clishop search` command so the output is identical
    // to what the user will see after setup
    try {
      const args = ["search", searchQuery.trim(), "--per-page", "5"];
      if (addressCountry) {
        args.push("--country", addressCountry);
      }
      if (addressCity) {
        args.push("--city", addressCity);
      }

      // Use process.argv[0] (node) and process.argv[1] (script path) to
      // invoke ourselves, or fall back to npx tsx for dev mode
      const nodeBin = process.argv[0];
      const scriptPath = process.argv[1];

      execFileSync(nodeBin, [scriptPath, ...args], {
        stdio: "inherit",
        timeout: 45000,
        env: process.env,
      });
    } catch (error: any) {
      // execFileSync throws on non-zero exit or timeout — that's OK,
      // the search command already printed its own output/errors
      if (error.status == null && error.signal === "SIGTERM") {
        console.log(chalk.yellow("\n  Search timed out. Try again later with: clishop search <query>"));
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // DONE
  // ════════════════════════════════════════════════════════════════════

  config.set("setupCompleted", true);

  console.log();
  divider(chalk.green);
  console.log();
  console.log(chalk.bold.green("  ✓ You're all set!"));
  console.log();
  console.log(chalk.dim("  Here are some commands to get you started:"));
  console.log();
  console.log(
    chalk.white("    clishop search <query>  ") +
      chalk.dim("Search for products")
  );
  console.log(
    chalk.white("    clishop buy <id>        ") +
      chalk.dim("Quick-buy a product")
  );
  console.log(
    chalk.white("    clishop order list      ") +
      chalk.dim("View your orders")
  );
  console.log(
    chalk.white("    clishop agent list      ") +
      chalk.dim("Manage your agents")
  );
  console.log(
    chalk.white("    clishop --help          ") +
      chalk.dim("See all commands")
  );
  console.log();
  console.log(
    chalk.dim("  💬 Join our Discord community: ") +
      chalk.cyan.underline("https://discord.gg/vwXMbzD4bx")
  );
  console.log();
  divider(chalk.green);
  console.log();
}
