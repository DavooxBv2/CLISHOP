import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { login, register, isLoggedIn, getUserInfo } from "../auth.js";
import {
  getConfig,
  getActiveAgent,
  createAgent,
  updateAgent,
  setActiveAgent,
} from "../config.js";
import { getApiClient } from "../api.js";

// ── Helpers ────────────────────────────────────────────────────────────

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

function formatPrice(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
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

  stepHeader(2, 5, "Agent (optional)");

  const activeAgent = getActiveAgent();

  console.log(
    chalk.dim(
      `  A default agent is ready ($${activeAgent.maxOrderAmount} limit, confirmation on).`
    )
  );
  console.log(
    chalk.dim("  Agents control spending limits and category restrictions.")
  );
  console.log();

  const { agentChoice } = await inquirer.prompt([
    {
      type: "confirm",
      name: "agentChoice",
      message: "Configure a custom agent?",
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
        message: "Max order amount ($):",
        default: 500,
      },
      {
        type: "confirm",
        name: "requireConfirmation",
        message: "Require confirmation before ordering?",
        default: true,
      },
    ]);

    try {
      const agent = createAgent(answers.name.trim(), {
        maxOrderAmount: answers.maxOrderAmount,
        requireConfirmation: answers.requireConfirmation,
      });
      setActiveAgent(agent.name);
      console.log(
        chalk.green(
          `\n  ✓ Agent "${chalk.bold(agent.name)}" created and set as active.`
        )
      );
    } catch (error: any) {
      console.error(chalk.red(`\n  ✗ ${error.message}`));
      console.log(chalk.dim("  Continuing with the default agent."));
    }
  } else {
    console.log(chalk.green("  ✓ Using default agent."));
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
  console.log();

  const { addAddress } = await inquirer.prompt([
    {
      type: "confirm",
      name: "addAddress",
      message: "Add a shipping address now?",
      default: true,
    },
  ]);

  let addressCity = "";

  if (addAddress) {
    const addr = await inquirer.prompt([
      {
        type: "input",
        name: "label",
        message: "Label (e.g. Home, Office):",
        default: "Home",
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
      {
        type: "input",
        name: "country",
        message: "Country:",
        validate: (v: string) => (v.trim() ? true : "Required"),
      },
    ]);

    addressCity = addr.city;

    const spinner = ora("Saving address...").start();
    try {
      const api = getApiClient();
      const agent = getActiveAgent();
      const res = await api.post("/addresses", {
        agent: agent.name,
        label: addr.label,
        line1: addr.line1,
        line2: addr.line2 || undefined,
        city: addr.city,
        region: addr.region || undefined,
        postalCode: addr.postalCode,
        country: addr.country,
      });
      // Set as default address for this agent
      updateAgent(agent.name, { defaultAddressId: res.data.address.id });
      spinner.succeed(
        chalk.green(
          `Address "${addr.label}" saved and set as default.`
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
  } else {
    console.log(
      chalk.dim(
        "\n  You can add one later with: " + chalk.white("clishop address add")
      )
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // STEP 4 — Payment Method
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
  // STEP 5 — First Search
  // ════════════════════════════════════════════════════════════════════

  stepHeader(5, 5, "Your First Search");

  if (addressCity) {
    console.log(
      chalk.dim(
        `  Let's find something! Products can be shipped to ${chalk.white(addressCity)}.`
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
    const spinner = ora(`Searching for "${searchQuery}"...`).start();
    try {
      const api = getApiClient();
      const res = await api.get("/products/search", {
        params: { q: searchQuery, page: 1, pageSize: 5 },
      });
      spinner.stop();

      const result = res.data;

      if (result.products.length === 0) {
        console.log(
          chalk.yellow(
            `\n  No results for "${searchQuery}". Try other terms later!`
          )
        );
      } else {
        console.log(
          chalk.bold(
            `\n  Found ${result.total} result${result.total !== 1 ? "s" : ""} for "${searchQuery}":\n`
          )
        );

        for (const p of result.products) {
          const price = formatPrice(p.priceInCents, p.currency || "USD");
          const stock = p.inStock
            ? chalk.green("In Stock")
            : chalk.red("Out of Stock");

          console.log(
            `  ${chalk.bold.cyan(p.name)}  ${chalk.bold.white(price)}  ${stock}`
          );
          console.log(chalk.dim(`  ID: ${p.id}`));
          console.log(
            chalk.dim(
              `  ${p.description.length > 100 ? p.description.slice(0, 100) + "..." : p.description}`
            )
          );
          console.log();
        }

        console.log(
          chalk.dim("  Buy a product with: ") +
            chalk.white("clishop buy <product-id>")
        );
      }
    } catch (error: any) {
      spinner.fail(
        chalk.red(
          `Search failed: ${error?.response?.data?.message || error.message}`
        )
      );
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
  divider(chalk.green);
  console.log();
}
