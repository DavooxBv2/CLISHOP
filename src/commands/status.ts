import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { getApiClient, handleApiError } from "../api.js";
import { isLoggedIn, getUserInfo } from "../auth.js";
import { getConfig, getActiveAgent } from "../config.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show full account overview — user, agents, addresses, payment methods")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        // Check login
        if (!(await isLoggedIn())) {
          console.log(chalk.yellow("\nNot set up yet. Run: clishop setup\n"));
          console.log(chalk.dim("For agent runners, use: clishop setup start --email <email> --json\n"));
          return;
        }

        const spinner = ora("Fetching account overview...").start();
        const api = getApiClient();
        const cfg = getConfig();
        const activeAgentName = cfg.get("activeAgent") || "default";

        // Fetch all data in parallel
        const [userInfo, agentsRes] = await Promise.all([
          getUserInfo(),
          api.get("/agents"),
        ]);

        const agents = agentsRes.data.agents || [];

        // Fetch addresses and payment methods for each agent
        const agentDetails = await Promise.all(
          agents.map(async (agent: any) => {
            const [addressesRes, paymentsRes] = await Promise.all([
              api.get("/addresses", { params: { agent: agent.name } }),
              api.get("/payment-methods", { params: { agent: agent.name } }),
            ]);
            return {
              ...agent,
              addresses: addressesRes.data.addresses || [],
              paymentMethods: paymentsRes.data.paymentMethods || [],
            };
          })
        );

        spinner.stop();

        if (opts.json) {
          console.log(JSON.stringify({
            user: userInfo,
            activeAgent: activeAgentName,
            agents: agentDetails,
          }, null, 2));
          return;
        }

        // ── User ──────────────────────────────────────────────────────────
        console.log(chalk.bold.cyan("\n═══════════════════════════════════════════════════════════"));
        console.log(chalk.bold.cyan("  CLISHOP Account Overview"));
        console.log(chalk.bold.cyan("═══════════════════════════════════════════════════════════\n"));

        console.log(chalk.bold("  👤 User"));
        console.log(`     Name:  ${chalk.white(userInfo?.name || "—")}`);
        console.log(`     Email: ${chalk.white(userInfo?.email || "—")}`);
        console.log(`     ID:    ${chalk.dim(userInfo?.id || "—")}`);
        console.log();

        // ── Agents ────────────────────────────────────────────────────────
        console.log(chalk.bold(`  🤖 Agents (${agents.length})`));
        if (agentDetails.length === 0) {
          console.log(chalk.yellow("     No agents found."));
        }

        for (const agent of agentDetails) {
          const isActive = agent.name === activeAgentName;
          const marker = isActive ? chalk.green("● ") : "  ";
          const activeLabel = isActive ? chalk.green(" (active)") : "";
          const limit = agent.maxOrderAmountInCents
            ? `$${(agent.maxOrderAmountInCents / 100).toFixed(2)}`
            : "No limit";
          const confirm = agent.requireConfirmation ? "Yes" : "No";

          console.log();
          console.log(`  ${marker}${chalk.bold.white(agent.name)}${activeLabel}`);
          console.log(`     ID:                  ${chalk.dim(agent.id)}`);
          console.log(`     Max order:           ${chalk.yellow(limit)}`);
          console.log(`     Require confirm:     ${confirm}`);

          // Addresses
          console.log();
          console.log(chalk.bold(`     📍 Addresses (${agent.addresses.length})`));
          if (agent.addresses.length === 0) {
            console.log(chalk.dim("        None"));
          } else {
            for (const addr of agent.addresses) {
              const isDefault = addr.id === agent.defaultAddressId;
              const defaultBadge = isDefault ? chalk.green(" ★ default") : "";
              console.log(`        • ${chalk.white(addr.label)}${defaultBadge}`);
              console.log(chalk.dim(`          ${addr.line1}, ${addr.city}, ${addr.postalCode} ${addr.country}`));
            }
          }

          // Payment methods
          console.log();
          console.log(chalk.bold(`     💳 Payment Methods (${agent.paymentMethods.length})`));
          if (agent.paymentMethods.length === 0) {
            console.log(chalk.dim("        None — run: clishop payment add"));
          } else {
            for (const pm of agent.paymentMethods) {
              const isDefault = pm.id === agent.defaultPaymentMethodId;
              const defaultBadge = isDefault ? chalk.green(" ★ default") : "";
              console.log(`        • ${chalk.white(pm.label)}${defaultBadge}`);
              console.log(chalk.dim(`          ${pm.type} via ${pm.provider || "unknown"} (${pm.id})`));
            }
          }
        }

        console.log();
        console.log(chalk.dim("───────────────────────────────────────────────────────────"));
        console.log(chalk.dim("  Tip: Use --agent <name> to run commands as a specific agent"));
        console.log(chalk.dim("  Tip: Use 'clishop agent switch <name>' to change active agent"));
        console.log();
      } catch (error) {
        handleApiError(error);
      }
    });
}
