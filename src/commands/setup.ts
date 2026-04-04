declare const BUILD_TIMESTAMP: string;
declare const BUILD_VERSION: string;

import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import open from "open";
import { execFileSync } from "child_process";
import {
  cancelSetupSession,
  claimSetupSession,
  getSetupStatus,
  getUserInfo,
  isLoggedIn,
  SetupClaimResult,
  SetupStartResult,
  SetupStatusResult,
  startSetupSession,
  waitForSetupSession,
} from "../auth.js";
import {
  getActiveAgent,
  getConfig,
  updateAgent,
} from "../config.js";
import { ensureAgentOnBackend, getApiClient } from "../api.js";

const DEFAULT_SETUP_TIMEOUT_MS = 30 * 60 * 1000;

type SetupPayload = SetupStartResult | SetupStatusResult | SetupClaimResult;

/** Open a URL in the user's default browser — uses platform-native commands first (most reliable), then `open` package */
export async function openBrowser(url: string): Promise<boolean> {
  try {
    if (process.platform === "win32") {
      execFileSync("cmd", ["/c", "start", "", url], { stdio: "ignore" });
      return true;
    }
    if (process.platform === "darwin") {
      execFileSync("open", [url], { stdio: "ignore" });
      return true;
    }

    execFileSync("xdg-open", [url], { stdio: "ignore" });
    return true;
  } catch {
    // Native command failed — try the package fallback.
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

function writeJson(payload: unknown): void {
  process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function buildCliError(code: string, message: string, extra: Record<string, unknown> = {}) {
  return {
    ok: false,
    error: {
      code,
      message,
      ...extra,
    },
  };
}

function sanitizeSetupPayload(payload: SetupPayload | ReturnType<typeof buildCliError>) {
  const { token, refreshToken, user, ...rest } = payload as any;
  return rest;
}

function printSetupLink(message: string, setupUrl: string): void {
  console.log();
  console.log(chalk.bold(`  ${message}`));
  console.log();
  console.log("  " + chalk.cyan.underline(setupUrl));
  console.log();
  console.log(chalk.dim("  Setup URL (plain text):"));
  console.log("  " + setupUrl);
  console.log();
}

function printSetupEmailInstructions(): void {
  console.log(chalk.yellow("  Email is required to start setup."));
  console.log();
  console.log(chalk.dim("  Human-friendly:"));
  console.log(chalk.white("    clishop setup user@example.com"));
  console.log();
  console.log(chalk.dim("  Agent-safe JSON:"));
  console.log(chalk.white("    clishop setup start --email user@example.com --json"));
  console.log();
}

function printSetupStartResult(result: SetupStartResult): void {
  console.log();
  console.log(chalk.bold("  Setup session created."));
  console.log(chalk.dim(`  Setup ID: ${result.setup_id}`));
  console.log(chalk.dim(`  Expires:  ${new Date(result.expires_at).toLocaleString()}`));
  printSetupLink("Give this link to your human to configure the payment method:", result.setup_url);
  console.log(chalk.dim("  Check progress later with:"));
  console.log(chalk.white(`    clishop setup status --setup-id ${result.setup_id}`));
  console.log(chalk.white(`    clishop setup wait --setup-id ${result.setup_id}`));
  console.log();
}

function printSetupStatusResult(result: SetupStatusResult): void {
  console.log();

  if (!result.ok) {
    console.log(chalk.red(`  ✗ ${result.error?.message || "Setup failed."}`));
    if (result.setup_id) {
      console.log(chalk.dim(`  Setup ID: ${result.setup_id}`));
    }
    console.log();
    return;
  }

  switch (result.status) {
    case "pending_user_action":
      console.log(chalk.yellow("  Waiting for the human to complete payment setup."));
      console.log(chalk.dim(`  Setup ID: ${result.setup_id}`));
      if (result.expires_at) {
        console.log(chalk.dim(`  Expires:  ${new Date(result.expires_at).toLocaleString()}`));
      }
      console.log();
      break;
    case "completed":
      console.log(chalk.green("  ✓ Payment linked and account activated!"));
      console.log(chalk.dim(`  Setup ID: ${result.setup_id}`));
      if (result.account_id) {
        console.log(chalk.dim(`  Account:  ${result.account_id}`));
      }
      console.log();
      break;
    case "cancelled":
      console.log(chalk.yellow("  Setup session cancelled."));
      console.log(chalk.dim(`  Setup ID: ${result.setup_id}`));
      console.log();
      break;
    case "expired":
      console.log(chalk.red("  Setup session expired."));
      console.log(chalk.dim(`  Setup ID: ${result.setup_id}`));
      console.log();
      break;
    case "processing":
      console.log(chalk.dim("  Setup is being processed."));
      console.log(chalk.dim(`  Setup ID: ${result.setup_id}`));
      console.log();
      break;
    default:
      console.log(chalk.red("  Setup failed."));
      if (result.setup_id) {
        console.log(chalk.dim(`  Setup ID: ${result.setup_id}`));
      }
      console.log();
      break;
  }
}

async function activateCompletedSetup(result: SetupStatusResult): Promise<SetupStatusResult | SetupClaimResult> {
  if (!result.ok || result.status !== "completed" || !result.setup_id) {
    return result;
  }

  const config = getConfig();
  const currentUser = await getUserInfo();

  if (currentUser && (!result.account_id || currentUser.id === result.account_id)) {
    config.set("setupCompleted", true);
    return result;
  }

  const claimed = await claimSetupSession(result.setup_id);
  if (claimed.ok) {
    config.set("setupCompleted", true);
  }
  return claimed;
}

async function runSetupStartCommand(email: string, json = false): Promise<void> {
  const normalizedEmail = email.trim();

  if (!isLikelyEmail(normalizedEmail)) {
    const payload = buildCliError("invalid_email", "A valid email address is required.");
    if (json) {
      writeJson(payload);
    } else {
      console.error(chalk.red(`\n✗ ${payload.error.message}\n`));
    }
    process.exitCode = 1;
    return;
  }

  try {
    const result = await startSetupSession(normalizedEmail);
    if (json) {
      writeJson(sanitizeSetupPayload(result));
      return;
    }

    printSetupStartResult(result);
  } catch (error: any) {
    const payload = buildCliError("internal_error", error?.message || "Failed to create setup session.");
    if (json) {
      writeJson(payload);
    } else {
      console.error(chalk.red(`\n✗ ${payload.error.message}\n`));
    }
    process.exitCode = 1;
  }
}

async function runSetupStatusCommand(setupId: string, json = false): Promise<void> {
  try {
    let result = await getSetupStatus(setupId);
    result = await activateCompletedSetup(result);

    if (json) {
      writeJson(sanitizeSetupPayload(result));
    } else {
      printSetupStatusResult(result);
    }

    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch (error: any) {
    const payload = buildCliError("internal_error", error?.message || "Failed to fetch setup status.");
    if (json) {
      writeJson(payload);
    } else {
      console.error(chalk.red(`\n✗ ${payload.error.message}\n`));
    }
    process.exitCode = 1;
  }
}

async function runSetupCancelCommand(setupId: string, json = false): Promise<void> {
  try {
    const result = await cancelSetupSession(setupId);

    if (json) {
      writeJson(sanitizeSetupPayload(result));
    } else {
      printSetupStatusResult(result);
    }

    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch (error: any) {
    const payload = buildCliError("internal_error", error?.message || "Failed to cancel setup session.");
    if (json) {
      writeJson(payload);
    } else {
      console.error(chalk.red(`\n✗ ${payload.error.message}\n`));
    }
    process.exitCode = 1;
  }
}

async function runSetupWaitCommand(setupId: string, timeoutSeconds: number, json = false): Promise<void> {
  try {
    if (!json) {
      console.log();
      console.log(chalk.dim(`  Waiting up to ${timeoutSeconds}s for payment setup to complete...`));
      console.log(chalk.dim(`  Setup ID: ${setupId}`));
      console.log();
    }

    const result = await waitForSetupSession(setupId, {
      timeout: timeoutSeconds * 1000,
    });

    if (result.ok && result.status === "completed") {
      getConfig().set("setupCompleted", true);
    }

    if (json) {
      writeJson(sanitizeSetupPayload(result));
    } else {
      printSetupStatusResult(result);
    }

    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch (error: any) {
    const payload = buildCliError("internal_error", error?.message || "Failed while waiting for setup.");
    if (json) {
      writeJson(payload);
    } else {
      console.error(chalk.red(`\n✗ ${payload.error.message}\n`));
    }
    process.exitCode = 1;
  }
}

export function registerSetupCommand(program: Command): void {
  const setup = program
    .command("setup")
    .description("Set up your CLISHOP account or manage setup sessions")
    .argument("[email]", "Email address for the human-friendly wrapper")
    .action(async (email) => {
      await runSetupWizard(email);
    });

  setup
    .command("start")
    .description("Create a setup session and return immediately")
    .requiredOption("--email <email>", "Email address")
    .option("--json", "Output machine-readable JSON")
    .action(async (opts) => {
      await runSetupStartCommand(opts.email, opts.json);
    });

  setup
    .command("status")
    .description("Check the status of a setup session")
    .requiredOption("--setup-id <setupId>", "Setup session ID")
    .option("--json", "Output machine-readable JSON")
    .action(async (opts) => {
      await runSetupStatusCommand(opts.setupId, opts.json);
    });

  setup
    .command("cancel")
    .description("Cancel a setup session")
    .requiredOption("--setup-id <setupId>", "Setup session ID")
    .option("--json", "Output machine-readable JSON")
    .action(async (opts) => {
      await runSetupCancelCommand(opts.setupId, opts.json);
    });

  setup
    .command("wait")
    .description("Wait for setup completion until timeout")
    .requiredOption("--setup-id <setupId>", "Setup session ID")
    .option("--timeout <seconds>", "Timeout in seconds", (value) => parseInt(value, 10), 300)
    .option("--json", "Output machine-readable JSON")
    .action(async (opts) => {
      await runSetupWaitCommand(opts.setupId, opts.timeout, opts.json);
    });
}

export async function runSetupWizard(
  emailArg?: string,
  { json = false }: { json?: boolean } = {},
): Promise<void> {
  if (json) {
    if (!emailArg) {
      writeJson(buildCliError("invalid_email", "Use --email when running setup in JSON mode."));
      process.exitCode = 1;
      return;
    }

    await runSetupStartCommand(emailArg, true);
    return;
  }

  const config = getConfig();
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
      // Fall through to the logged-in payment-link flow.
    }

    console.log();
    console.log(chalk.green(`  ✓ Logged in as ${chalk.bold(user?.name || user?.email || "unknown")}`));
    console.log(chalk.dim("  No payment method linked yet. Let's fix that."));
    console.log();

    await runPaymentLinkFlow(config);
    return;
  }

  console.log();
  divider(chalk.cyan);
  console.log();
  console.log(chalk.bold.cyan("      W E L C O M E   T O   C L I S H O P"));
  console.log(chalk.dim("      Order anything from your terminal."));
  console.log(chalk.dim(`      npm:   v${BUILD_VERSION}`));
  console.log(chalk.dim(`      Build: ${BUILD_TIMESTAMP}`));
  console.log();
  divider(chalk.cyan);
  console.log();
  console.log(chalk.dim("  Set up your account in one step. You'll get a link to"));
  console.log(chalk.dim("  securely link your payment method in the browser."));
  console.log(chalk.dim("  Your AI agent can then add addresses and place orders for you."));
  console.log();
  console.log(chalk.dim("  By creating an account you agree to the CLISHOP"));
  console.log(chalk.dim("  Terms & Conditions: ") + chalk.cyan.underline("https://clishop.ai/terms"));
  console.log(chalk.dim("  Privacy Policy:     ") + chalk.cyan.underline("https://clishop.ai/privacy"));
  console.log();

  let email = emailArg?.trim();
  if (!email) {
    printSetupEmailInstructions();
    process.exitCode = 1;
    return;
  }

  if (!email || !isLikelyEmail(email)) {
    console.error(chalk.red("\n✗ A valid email address is required.\n"));
    process.exitCode = 1;
    return;
  }

  let startResult: SetupStartResult;
  try {
    console.log(chalk.dim("  Creating your account and payment link..."));
    startResult = await startSetupSession(email);
  } catch (error: any) {
    console.log(chalk.red(`  ✗ Setup failed: ${error?.message || "Unknown error"}`));
    console.log();
    console.log(chalk.dim("  You can try again with: ") + chalk.white("clishop setup"));
    console.log();
    process.exitCode = 1;
    return;
  }

  printSetupStartResult(startResult);

  console.log(chalk.dim("  Waiting for you to complete payment setup..."));
  console.log(chalk.dim("  You can resume later with the setup ID shown above."));
  console.log();

  const result = await waitForSetupSession(startResult.setup_id, {
    timeout: DEFAULT_SETUP_TIMEOUT_MS,
  });

  if (!result.ok || result.status !== "completed") {
    printSetupStatusResult(result);
    process.exitCode = 1;
    return;
  }

  config.set("setupCompleted", true);

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
  console.log(chalk.white("    clishop search <query>  ") + chalk.dim("Search for products"));
  console.log(chalk.white("    clishop buy <id>        ") + chalk.dim("Quick-buy a product"));
  console.log(chalk.white("    clishop order list      ") + chalk.dim("View your orders"));
  console.log(chalk.white("    clishop --help          ") + chalk.dim("See all commands"));
  console.log();
  divider(chalk.green);
  console.log();
}

async function runPaymentLinkFlow(config: ReturnType<typeof getConfig>): Promise<void> {
  console.log(chalk.dim("  Requesting secure payment setup link..."));
  try {
    const api = getApiClient();
    const agent = getActiveAgent();
    await ensureAgentOnBackend(agent.name);
    const res = await api.post("/payment-methods/setup", { agent: agent.name });

    const { setupUrl } = res.data;
    printSetupLink("Open this link to link your payment method:", setupUrl);

    const opened = await openBrowser(setupUrl);
    if (opened) {
      console.log(chalk.dim("  (Browser opened automatically)"));
    }
    console.log();

    await inquirer.prompt([
      { type: "input", name: "done", message: "Press Enter after completing payment setup in your browser..." },
    ]);

    console.log(chalk.dim("  Checking for your payment method..."));
    const pmRes = await api.get("/payment-methods", { params: { agent: agent.name } });
    const methods = pmRes.data.paymentMethods || [];
    if (methods.length > 0) {
      const latest = methods[methods.length - 1];
      updateAgent(agent.name, { defaultPaymentMethodId: latest.id });
      console.log(chalk.green(`  ✓ Payment method "${latest.label}" linked and set as default.`));
      config.set("setupCompleted", true);
    } else {
      console.log(chalk.yellow("  ⚠ No payment method found yet. Run ") + chalk.white("clishop setup") + chalk.yellow(" to try again."));
    }
  } catch (error: any) {
    console.log(chalk.red(`  ✗ Could not get setup link: ${error?.response?.data?.message || error.message}`));
  }
  console.log();
}
