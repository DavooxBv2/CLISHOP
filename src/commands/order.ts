import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { getApiClient, handleApiError } from "../api.js";
import { getActiveAgent } from "../config.js";

export interface Order {
  id: string;
  status: "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled";
  items: OrderItem[];
  totalAmount: number;
  currency: string;
  shippingAddressId: string;
  paymentMethodId: string;
  agent: string;
  createdAt: string;
  updatedAt: string;
  trackingNumber?: string;
  trackingUrl?: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(price);
}

const STATUS_COLORS: Record<string, (s: string) => string> = {
  pending: chalk.yellow,
  confirmed: chalk.blue,
  processing: chalk.cyan,
  shipped: chalk.magenta,
  delivered: chalk.green,
  cancelled: chalk.red,
};

export function registerOrderCommands(program: Command): void {
  const order = program
    .command("order")
    .description("Place and manage orders");

  // ── BUY (quick order) ──────────────────────────────────────────────
  program
    .command("buy <productId>")
    .description("Quick-buy a product")
    .option("-q, --quantity <qty>", "Quantity", parseInt, 1)
    .option("--address <id>", "Shipping address ID (uses agent default if omitted)")
    .option("--payment <id>", "Payment method ID (uses agent default if omitted)")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (productId: string, opts) => {
      try {
        const agent = getActiveAgent();
        const addressId = opts.address || agent.defaultAddressId;
        const paymentId = opts.payment || agent.defaultPaymentMethodId;

        if (!addressId) {
          console.error(chalk.red("\n✗ No address set. Add one with: clishop address add"));
          process.exitCode = 1;
          return;
        }
        if (!paymentId) {
          console.error(chalk.red("\n✗ No payment method set. Add one with: clishop payment add"));
          process.exitCode = 1;
          return;
        }

        // Fetch product info for confirmation
        const api = getApiClient();
        const prodSpinner = ora("Fetching product info...").start();
        const prodRes = await api.get(`/products/${productId}`);
        prodSpinner.stop();
        const product = prodRes.data.product;

        const totalPrice = product.price * opts.quantity;

        // Safety check: max order amount
        if (agent.maxOrderAmount && totalPrice > agent.maxOrderAmount) {
          console.error(
            chalk.red(
              `\n✗ Order total (${formatPrice(totalPrice, product.currency)}) exceeds agent "${agent.name}" limit of $${agent.maxOrderAmount}.`
            )
          );
          process.exitCode = 1;
          return;
        }

        // Category check
        if (agent.blockedCategories?.includes(product.category)) {
          console.error(chalk.red(`\n✗ Category "${product.category}" is blocked for agent "${agent.name}".`));
          process.exitCode = 1;
          return;
        }
        if (agent.allowedCategories?.length && !agent.allowedCategories.includes(product.category)) {
          console.error(chalk.red(`\n✗ Category "${product.category}" is not in the allowed list for agent "${agent.name}".`));
          process.exitCode = 1;
          return;
        }

        // Confirmation
        if (agent.requireConfirmation && !opts.yes) {
          console.log(chalk.bold("\n  Order Summary:"));
          console.log(`    Product:  ${product.name}`);
          console.log(`    Quantity: ${opts.quantity}`);
          console.log(`    Total:    ${chalk.bold(formatPrice(totalPrice, product.currency))}`);
          console.log(`    Agent:    ${agent.name}`);
          console.log();

          const { confirm } = await inquirer.prompt([
            {
              type: "confirm",
              name: "confirm",
              message: "Place this order?",
              default: false,
            },
          ]);
          if (!confirm) {
            console.log(chalk.yellow("Order cancelled."));
            return;
          }
        }

        const spinner = ora("Placing order...").start();
        const res = await api.post("/orders", {
          agent: agent.name,
          items: [{ productId, quantity: opts.quantity }],
          shippingAddressId: addressId,
          paymentMethodId: paymentId,
        });
        spinner.succeed(chalk.green(`Order placed! Order ID: ${chalk.bold(res.data.order.id)}`));
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── LIST ORDERS ────────────────────────────────────────────────────
  order
    .command("list")
    .alias("ls")
    .description("List your orders")
    .option("--status <status>", "Filter by status")
    .option("-p, --page <page>", "Page number", parseInt, 1)
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const spinner = ora("Fetching orders...").start();
        const api = getApiClient();
        const res = await api.get("/orders", {
          params: {
            status: opts.status,
            page: opts.page,
          },
        });
        spinner.stop();

        const orders: Order[] = res.data.orders;

        if (opts.json) {
          console.log(JSON.stringify(orders, null, 2));
          return;
        }

        if (orders.length === 0) {
          console.log(chalk.yellow("\nNo orders found.\n"));
          return;
        }

        console.log(chalk.bold("\nYour Orders:\n"));
        for (const o of orders) {
          const statusColor = STATUS_COLORS[o.status] || chalk.white;
          const date = new Date(o.createdAt).toLocaleDateString();
          console.log(
            `  ${chalk.bold(o.id)}  ${statusColor(o.status.toUpperCase().padEnd(12))}  ${formatPrice(o.totalAmount, o.currency)}  ${chalk.dim(date)}  ${chalk.dim(`agent: ${o.agent}`)}`
          );
          for (const item of o.items) {
            console.log(chalk.dim(`    · ${item.productName} × ${item.quantity}`));
          }
          console.log();
        }
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── ORDER DETAIL ───────────────────────────────────────────────────
  order
    .command("show <id>")
    .description("Show order details")
    .option("--json", "Output raw JSON")
    .action(async (id: string, opts) => {
      try {
        const spinner = ora("Fetching order...").start();
        const api = getApiClient();
        const res = await api.get(`/orders/${id}`);
        spinner.stop();

        const o: Order = res.data.order;

        if (opts.json) {
          console.log(JSON.stringify(o, null, 2));
          return;
        }

        const statusColor = STATUS_COLORS[o.status] || chalk.white;
        console.log();
        console.log(chalk.bold(`  Order ${o.id}`));
        console.log(`  Status:   ${statusColor(o.status.toUpperCase())}`);
        console.log(`  Total:    ${chalk.bold(formatPrice(o.totalAmount, o.currency))}`);
        console.log(`  Agent:    ${o.agent}`);
        console.log(`  Placed:   ${new Date(o.createdAt).toLocaleString()}`);
        console.log(`  Updated:  ${new Date(o.updatedAt).toLocaleString()}`);
        if (o.trackingNumber) {
          console.log(`  Tracking: ${o.trackingNumber}`);
          if (o.trackingUrl) console.log(`  Track:    ${chalk.cyan.underline(o.trackingUrl)}`);
        }
        console.log(chalk.bold("\n  Items:"));
        for (const item of o.items) {
          console.log(`    · ${item.productName} × ${item.quantity}  ${formatPrice(item.totalPrice, o.currency)}`);
        }
        console.log();
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── CANCEL ─────────────────────────────────────────────────────────
  order
    .command("cancel <id>")
    .description("Cancel an order")
    .action(async (id: string) => {
      try {
        const { confirm } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirm",
            message: `Cancel order ${id}? This may not be reversible.`,
            default: false,
          },
        ]);
        if (!confirm) return;

        const spinner = ora("Cancelling order...").start();
        const api = getApiClient();
        await api.post(`/orders/${id}/cancel`);
        spinner.succeed(chalk.green("Order cancelled."));
      } catch (error) {
        handleApiError(error);
      }
    });
}
