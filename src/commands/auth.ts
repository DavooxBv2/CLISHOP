import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { logout, isLoggedIn, getUserInfo } from "../auth.js";
import { getConfig } from "../config.js";

export function registerAuthCommands(program: Command): void {
  // ── LOGOUT ────────────────────────────────────────────────────────
  program
    .command("logout")
    .description("Log out of your CLISHOP account")
    .action(async () => {
      const spinner = ora("Logging out...").start();
      await logout();

      // Reset local config to defaults so stale agents/settings don't persist
      const config = getConfig();
      config.set("agents", {
        default: {
          name: "default",
          requireConfirmation: true,
          maxOrderAmount: 200,
          allowedCategories: [],
          blockedCategories: [],
        },
      });
      config.set("activeAgent", "default");
      config.set("setupCompleted", false);

      spinner.succeed(chalk.green("Logged out. Local config reset."));
    });

  // ── WHOAMI ────────────────────────────────────────────────────────
  program
    .command("whoami")
    .description("Show the currently logged-in user")
    .action(async () => {
      if (!(await isLoggedIn())) {
        console.log(chalk.yellow("Not set up yet. Run: clishop setup"));
        console.log(chalk.dim("For agent runners, use: clishop setup start --email <email> --json"));
        return;
      }
      const user = await getUserInfo();
      if (user) {
        console.log(chalk.cyan(`  Name:  ${user.name}`));
        console.log(chalk.cyan(`  Email: ${user.email}`));
        console.log(chalk.cyan(`  ID:    ${user.id}`));
      } else {
        console.log(chalk.yellow("Logged in but user info unavailable."));
      }
    });
}
