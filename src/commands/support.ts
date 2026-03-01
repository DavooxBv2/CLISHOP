import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { getApiClient, handleApiError } from "../api.js";

const CATEGORY_CHOICES = [
  { name: "General question", value: "general" },
  { name: "Damaged item", value: "damaged" },
  { name: "Missing item", value: "missing" },
  { name: "Wrong item received", value: "wrong_item" },
  { name: "Refund request", value: "refund" },
  { name: "Shipping issue", value: "shipping" },
  { name: "Other", value: "other" },
];

const PRIORITY_CHOICES = [
  { name: "Low", value: "low" },
  { name: "Normal", value: "normal" },
  { name: "High", value: "high" },
  { name: "Urgent", value: "urgent" },
];

const STATUS_COLORS: Record<string, (s: string) => string> = {
  open: chalk.green,
  in_progress: chalk.cyan,
  awaiting_customer: chalk.yellow,
  awaiting_store: chalk.blue,
  resolved: chalk.gray,
  closed: chalk.dim,
};

const PRIORITY_COLORS: Record<string, (s: string) => string> = {
  low: chalk.dim,
  normal: chalk.white,
  high: chalk.yellow,
  urgent: chalk.red,
};

export function registerSupportCommands(program: Command): void {
  const support = program
    .command("support")
    .description("Manage support tickets for orders");

  // ── CREATE TICKET ───────────────────────────────────────────────────
  support
    .command("create <orderId>")
    .alias("new")
    .description("Create a support ticket for an order")
    .action(async (orderId: string) => {
      try {
        const answers = await inquirer.prompt([
          {
            type: "select",
            name: "category",
            message: "What is this about?",
            choices: CATEGORY_CHOICES,
          },
          {
            type: "select",
            name: "priority",
            message: "Priority:",
            choices: PRIORITY_CHOICES,
            default: "normal",
          },
          {
            type: "input",
            name: "subject",
            message: "Subject (short description):",
            validate: (v: string) => v.trim().length > 0 || "Subject is required",
          },
          {
            type: "editor",
            name: "message",
            message: "Describe the issue in detail (opens editor):",
          },
        ]);

        if (!answers.message || !answers.message.trim()) {
          console.error(chalk.red("\n✗ Message is required.\n"));
          return;
        }

        const spinner = ora("Creating support ticket...").start();
        const api = getApiClient();
        const res = await api.post("/support", {
          orderId,
          subject: answers.subject.trim(),
          category: answers.category,
          priority: answers.priority,
          message: answers.message.trim(),
        });
        spinner.succeed(chalk.green("Support ticket created!"));

        const t = res.data.ticket;
        console.log();
        console.log(`  ${chalk.bold("Ticket ID:")}  ${chalk.cyan(t.id)}`);
        console.log(`  ${chalk.bold("Subject:")}    ${t.subject}`);
        console.log(`  ${chalk.bold("Store:")}      ${t.storeName}`);
        console.log(`  ${chalk.bold("Category:")}   ${t.category}`);
        console.log(`  ${chalk.bold("Status:")}     ${(STATUS_COLORS[t.status] || chalk.white)(t.status)}`);
        console.log();
        console.log(chalk.dim("  The store will be notified. You can follow up with:"));
        console.log(chalk.dim(`  clishop support show ${t.id}`));
        console.log();
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── LIST TICKETS ────────────────────────────────────────────────────
  support
    .command("list")
    .alias("ls")
    .description("List your support tickets")
    .option("--status <status>", "Filter by status")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const spinner = ora("Fetching tickets...").start();
        const api = getApiClient();
        const res = await api.get("/support", {
          params: { status: opts.status },
        });
        spinner.stop();

        const tickets = res.data.tickets;

        if (opts.json) {
          console.log(JSON.stringify(tickets, null, 2));
          return;
        }

        if (tickets.length === 0) {
          console.log(chalk.yellow("\nNo support tickets found.\n"));
          return;
        }

        console.log(chalk.bold("\nYour Support Tickets:\n"));
        for (const t of tickets) {
          const statusColor = STATUS_COLORS[t.status] || chalk.white;
          const priorityColor = PRIORITY_COLORS[t.priority] || chalk.white;
          const date = new Date(t.createdAt).toLocaleDateString();

          console.log(
            `  ${chalk.bold(t.id)}  ${statusColor(t.status.toUpperCase().padEnd(20))}  ${priorityColor(t.priority.padEnd(8))}  ${chalk.dim(date)}`
          );
          console.log(`  ${chalk.bold(t.subject)}`);
          console.log(`  ${chalk.dim(`Store: ${t.storeName}  ·  Order: ${t.orderId}  ·  ${t.category}`)}`);
          if (t.lastMessage) {
            const sender = t.lastMessage.senderType === "store" ? chalk.blue("Store") : t.lastMessage.senderType === "system" ? chalk.gray("System") : chalk.green("You");
            console.log(`  ${chalk.dim("Last:")} ${sender}: ${chalk.dim(t.lastMessage.body)}`);
          }
          console.log();
        }
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── SHOW TICKET ─────────────────────────────────────────────────────
  support
    .command("show <ticketId>")
    .description("View a support ticket and its messages")
    .option("--json", "Output raw JSON")
    .action(async (ticketId: string, opts) => {
      try {
        const spinner = ora("Fetching ticket...").start();
        const api = getApiClient();
        const res = await api.get(`/support/${ticketId}`);
        spinner.stop();

        const t = res.data.ticket;

        if (opts.json) {
          console.log(JSON.stringify(t, null, 2));
          return;
        }

        const statusColor = STATUS_COLORS[t.status] || chalk.white;
        console.log();
        console.log(chalk.bold(`  Ticket ${chalk.cyan(t.id)}`));
        console.log(`  Subject:   ${chalk.bold(t.subject)}`);
        console.log(`  Status:    ${statusColor(t.status.toUpperCase())}`);
        console.log(`  Category:  ${t.category}`);
        console.log(`  Priority:  ${(PRIORITY_COLORS[t.priority] || chalk.white)(t.priority)}`);
        console.log(`  Store:     ${t.storeName}`);
        console.log(`  Order:     ${t.orderId}`);
        console.log(`  Created:   ${new Date(t.createdAt).toLocaleString()}`);
        if (t.resolvedAt) console.log(`  Resolved:  ${new Date(t.resolvedAt).toLocaleString()}`);

        console.log(chalk.bold("\n  Messages:\n"));
        for (const m of t.messages) {
          const time = new Date(m.createdAt).toLocaleString();
          let sender: string;
          if (m.senderType === "customer") sender = chalk.green.bold("You");
          else if (m.senderType === "store") sender = chalk.blue.bold("Store");
          else sender = chalk.gray.bold("System");

          console.log(`  ${sender}  ${chalk.dim(time)}`);
          console.log(`  ${m.body}`);
          console.log();
        }
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── REPLY TO TICKET ─────────────────────────────────────────────────
  support
    .command("reply <ticketId>")
    .description("Reply to a support ticket")
    .action(async (ticketId: string) => {
      try {
        const { message } = await inquirer.prompt([
          {
            type: "editor",
            name: "message",
            message: "Your reply (opens editor):",
          },
        ]);

        if (!message || !message.trim()) {
          console.error(chalk.red("\n✗ Message is required.\n"));
          return;
        }

        const spinner = ora("Sending reply...").start();
        const api = getApiClient();
        const res = await api.post(`/support/${ticketId}/reply`, {
          message: message.trim(),
        });
        spinner.succeed(chalk.green("Reply sent!"));
        console.log(chalk.dim(`  Ticket status: ${res.data.ticketStatus}\n`));
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── CLOSE TICKET ────────────────────────────────────────────────────
  support
    .command("close <ticketId>")
    .description("Close a resolved ticket")
    .action(async (ticketId: string) => {
      try {
        const { confirm } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirm",
            message: "Close this ticket?",
            default: false,
          },
        ]);
        if (!confirm) return;

        const spinner = ora("Closing ticket...").start();
        const api = getApiClient();
        await api.patch(`/support/${ticketId}/status`, { status: "closed" });
        spinner.succeed(chalk.green("Ticket closed."));
      } catch (error) {
        handleApiError(error);
      }
    });
}
