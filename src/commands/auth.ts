import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { login, register, logout, isLoggedIn, getUserInfo } from "../auth.js";

async function readPasswordFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8").trim();
}

export function registerAuthCommands(program: Command): void {
  // ── LOGIN ─────────────────────────────────────────────────────────
  program
    .command("login")
    .description("Log in to your CLISHOP account")
    .option("-e, --email <email>", "Email address")
    .option("-p, --password <password>", "Password (less secure: exposed to shell history)")
    .option("--password-stdin", "Read password from stdin")
    .action(async (opts) => {
      try {
        if (opts.password && opts.passwordStdin) {
          console.error(chalk.red("\n✗ Use either --password or --password-stdin, not both."));
          process.exitCode = 1;
          return;
        }

        if (await isLoggedIn()) {
          const user = await getUserInfo();
          const { confirm } = await inquirer.prompt([
            {
              type: "confirm",
              name: "confirm",
              message: `You are already logged in as ${chalk.cyan(user?.email || "unknown")}. Log in as a different user?`,
              default: false,
            },
          ]);
          if (!confirm) return;
        }

        let email = opts.email;
        let password = opts.password;

        if (opts.passwordStdin) {
          password = await readPasswordFromStdin();
          if (!password) {
            console.error(chalk.red("\n✗ No password was provided on stdin."));
            process.exitCode = 1;
            return;
          }
        }

        if (opts.password) {
          console.log(chalk.yellow("⚠ Warning: --password can leak credentials via shell history/process list."));
          console.log(chalk.yellow("  Prefer --password-stdin or the interactive masked prompt.\n"));
        }

        if (!email || !password) {
          const answers = await inquirer.prompt([
            ...(!email
              ? [{ type: "input" as const, name: "email", message: "Email:" }]
              : []),
            ...(!password
              ? [{ type: "password" as const, name: "password", message: "Password:", mask: "*" }]
              : []),
          ]);
          email = email || answers.email;
          password = password || answers.password;
        }

        const spinner = ora("Logging in...").start();
        const user = await login(email, password);
        spinner.succeed(chalk.green(`Logged in as ${chalk.bold(user.name)} (${user.email})`));
      } catch (error: any) {
        const msg = error?.response?.data?.message || error.message;
        console.error(chalk.red(`\n✗ Login failed: ${msg}`));
        process.exitCode = 1;
      }
    });

  // ── REGISTER ──────────────────────────────────────────────────────
  program
    .command("register")
    .description("Create a new CLISHOP account")
    .action(async () => {
      try {
        const answers = await inquirer.prompt([
          { type: "input", name: "name", message: "Full name:" },
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
          console.error(chalk.red("✗ Passwords do not match."));
          process.exitCode = 1;
          return;
        }

        const spinner = ora("Creating account...").start();
        const user = await register(answers.email, answers.password, answers.name);
        spinner.succeed(chalk.green(`Account created! Welcome, ${chalk.bold(user.name)}.`));
      } catch (error: any) {
        const msg = error?.response?.data?.message || error.message;
        console.error(chalk.red(`\n✗ Registration failed: ${msg}`));
        process.exitCode = 1;
      }
    });

  // ── LOGOUT ────────────────────────────────────────────────────────
  program
    .command("logout")
    .description("Log out of your CLISHOP account")
    .action(async () => {
      const spinner = ora("Logging out...").start();
      await logout();
      spinner.succeed(chalk.green("Logged out."));
    });

  // ── WHOAMI ────────────────────────────────────────────────────────
  program
    .command("whoami")
    .description("Show the currently logged-in user")
    .action(async () => {
      if (!(await isLoggedIn())) {
        console.log(chalk.yellow("Not logged in. Run: clishop login"));
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
