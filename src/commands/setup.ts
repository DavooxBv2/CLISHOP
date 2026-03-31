declare const BUILD_TIMESTAMP: string;

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import open from "open";
import { execFileSync } from "child_process";
import { isLoggedIn, getUserInfo, storeAuthFromSetup } from "../auth.js";
import {
  getConfig,
  getActiveAgent,
  updateAgent,
  getApiBaseUrl,
} from "../config.js";
import { getApiClient, ensureAgentOnBackend } from "../api.js";
import axios from "axios";

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

// ── Command Registration ───────────────────────────────────────────────

export function registerSetupCommand(program: Command): void {
  program
    .command("setup")
    .description(
      "Set up your CLISHOP account — links your payment method via a secure browser link"
    )
    .option("--email <email>", "Email address (skips prompt)")
    .option("--name <name>", "Full name (skips prompt)")
    .action(async (opts) => {
      await runSetupWizard(opts.email, opts.name);
    });
}

// ── Streamlined Setup ────────────────────────────────────────────────

export async function runSetupWizard(emailArg?: string, nameArg?: string): Promise<void> {
  const config = getConfig();

  // Already fully set up?
  const loggedIn = await isLoggedIn();
  if (loggedIn) {
    const user = await getUserInfo();
    try {
      const api = getApiClient();
      const agent = getActiveAgent();
      const pmRes = await api.get("/payment-methods", { params: { agent: agent.name } });
      const methods = pmRes.data.paymentMethods || [];
      if (methods.length > 0) {
        console.log();
        console.log(chalk.green(`  ✓ Already set up as ${chalk.bold(user?.name || user?.email || "unknown")} with a payment method linked.`));
        console.log(chalk.dim("  Nothing to do. Run ") + chalk.white("clishop search <query>") + chalk.dim(" to get started."));
        console.log();
        return;
      }
    } catch {
      // Can't check payment methods — fall through to payment link flow
    }

    // Logged in but no payment method — just do payment link flow
    console.log();
    console.log(chalk.green(`  ✓ Logged in as ${chalk.bold(user?.name || user?.email || "unknown")}`));
    console.log(chalk.dim("  No payment method linked yet. Let's fix that."));
    console.log();

    await runPaymentLinkFlow(config);
    return;
  }

  // ── Not logged in — new setup link flow ──────────────────────────

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
    chalk.dim("  Set up your account in one step. You'll get a link to")
  );
  console.log(
    chalk.dim("  securely link your payment method in the browser.")
  );
  console.log(
    chalk.dim("  Your AI agent can then add addresses and place orders for you.")
  );
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

  let email = emailArg;
  let name = nameArg;

  if (!email || !name) {
    const answers = await inquirer.prompt([
      ...(!email
        ? [{ type: "input" as const, name: "email", message: "Email:" }]
        : []),
      ...(!name
        ? [{ type: "input" as const, name: "name", message: "Your name:" }]
        : []),
    ]);
    email = email || answers.email;
    name = name || answers.name;
  }

  const spinner = ora("Creating your account and payment link...").start();
  let setupUrl: string;
  let deviceCode: string;
  try {
    const baseUrl = getApiBaseUrl();
    const res = await axios.post(`${baseUrl}/auth/setup-link`, { email, name });
    setupUrl = res.data.setupUrl;
    deviceCode = res.data.deviceCode;
    spinner.stop();
  } catch (error: any) {
    const msg = error?.response?.data?.message || error.message;
    spinner.fail(chalk.red(`Setup failed: ${msg}`));
    console.log();
    console.log(chalk.dim("  You can try again with: ") + chalk.white("clishop setup"));
    console.log();
    process.exitCode = 1;
    return;
  }

  // Open browser
  console.log();
  console.log(chalk.bold("  Open this link to link your payment method:"));
  console.log();
  console.log("  " + chalk.cyan.underline(setupUrl));
  console.log();

  const opened = await openBrowser(setupUrl);
  if (opened) {
    console.log(chalk.dim("  (Browser opened automatically)"));
  } else {
    console.log(chalk.yellow("  Could not open browser automatically. Please visit the link above."));
  }
  console.log();

  // Poll until complete
  const pollSpinner = ora("Waiting for you to complete payment setup...").start();
  const baseUrl = getApiBaseUrl();
  const maxAttempts = 120; // 10 minutes at 5s intervals
  let completed = false;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const res = await axios.post(`${baseUrl}/auth/device/poll`, { deviceCode });
      const data = res.data;

      if (data.status === "complete" && data.token && data.refreshToken && data.user) {
        await storeAuthFromSetup({
          token: data.token,
          refreshToken: data.refreshToken,
          user: data.user,
        });
        config.set("setupCompleted", true);
        pollSpinner.succeed(chalk.green("Payment linked and account activated!"));
        completed = true;
        break;
      }
      if (data.status === "expired") {
        pollSpinner.fail(chalk.red("Setup link expired. Run ") + chalk.white("clishop setup") + chalk.red(" to try again."));
        process.exitCode = 1;
        return;
      }
      // status === "pending" — keep polling
    } catch {
      // Network hiccup — keep trying
    }
  }

  if (!completed) {
    pollSpinner.fail(chalk.red("Timed out waiting for setup. Run ") + chalk.white("clishop setup") + chalk.red(" to try again."));
    process.exitCode = 1;
    return;
  }

  // ── Done ─────────────────────────────────────────────────────────

  console.log();
  divider(chalk.green);
  console.log();
  console.log(chalk.bold.green("  ✓ You're all set!"));
  console.log();
  console.log(chalk.dim("  Your agent can now add addresses and place orders."));
  console.log(chalk.dim("  To add a shipping address manually:"));
  console.log(chalk.white("    clishop address add"));
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
    chalk.white("    clishop --help          ") +
      chalk.dim("See all commands")
  );
  console.log();
  divider(chalk.green);
  console.log();
}

// ── Payment link flow (for logged-in users without a payment method) ─

async function runPaymentLinkFlow(config: ReturnType<typeof getConfig>): Promise<void> {
  const spinner = ora("Requesting secure payment setup link...").start();
  try {
    const api = getApiClient();
    const agent = getActiveAgent();
    await ensureAgentOnBackend(agent.name);
    const res = await api.post("/payment-methods/setup", { agent: agent.name });
    spinner.stop();

    const { setupUrl } = res.data;
    console.log();
    console.log(chalk.bold("  Open this link to link your payment method:"));
    console.log();
    console.log("  " + chalk.cyan.underline(setupUrl));
    console.log();

    const opened = await openBrowser(setupUrl);
    if (opened) {
      console.log(chalk.dim("  (Browser opened automatically)"));
    }
    console.log();

    await inquirer.prompt([
      { type: "input", name: "done", message: "Press Enter after completing payment setup in your browser..." },
    ]);

    const checkSpinner = ora("Checking for your payment method...").start();
    const pmRes = await api.get("/payment-methods", { params: { agent: agent.name } });
    const methods = pmRes.data.paymentMethods || [];
    if (methods.length > 0) {
      const latest = methods[methods.length - 1];
      updateAgent(agent.name, { defaultPaymentMethodId: latest.id });
      checkSpinner.succeed(chalk.green(`Payment method "${latest.label}" linked and set as default.`));
      config.set("setupCompleted", true);
    } else {
      checkSpinner.warn(chalk.yellow("No payment method found yet. Run ") + chalk.white("clishop setup") + chalk.yellow(" to try again."));
    }
  } catch (error: any) {
    spinner.fail(chalk.red(`Could not get setup link: ${error?.response?.data?.message || error.message}`));
  }
  console.log();
}
