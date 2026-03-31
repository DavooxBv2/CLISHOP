import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { getApiClient, handleApiError } from "../api.js";
import { getActiveAgent } from "../config.js";

export interface AdvertiseRequest {
  id: string;
  status: string;
  title: string;
  description?: string;
  sku?: string;
  brand?: string;
  company?: string;
  features?: string;
  quantity: number;
  recurring: boolean;
  recurringNote?: string;
  bidPriceInCents?: number;
  currency: string;
  speedDays?: number;
  freeReturns?: boolean;
  minReturnDays?: number;
  paymentMethods?: string; // "all" or JSON array of payment method IDs
  address?: {
    id: string;
    label: string;
    line1?: string;
    line2?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
  };
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  bids?: AdvertiseBid[];
}

export interface AdvertiseBid {
  id: string;
  storeId: string;
  status: string;
  priceInCents: number;
  currency: string;
  shippingDays?: number;
  freeReturns?: boolean;
  returnWindowDays?: number;
  note?: string;
  store?: {
    id: string;
    name: string;
    slug: string;
    verified: boolean;
    rating: number | null;
  };
  product?: {
    id: string;
    name: string;
    priceInCents: number;
    currency: string;
  };
  createdAt: string;
}

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

const STATUS_COLORS: Record<string, (s: string) => string> = {
  open: chalk.green,
  closed: chalk.dim,
  accepted: chalk.blue,
  cancelled: chalk.red,
  expired: chalk.yellow,
};

const BID_STATUS_COLORS: Record<string, (s: string) => string> = {
  pending: chalk.yellow,
  accepted: chalk.green,
  rejected: chalk.red,
  withdrawn: chalk.dim,
};

export function registerAdvertiseCommands(program: Command): void {
  const advertise = program
    .command("advertise")
    .description("Advertise a request for vendors to bid on (when you can't find what you need)");

  // ── CREATE (interactive) ────────────────────────────────────────────
  advertise
    .command("create")
    .alias("new")
    .description("Create a new advertised request")
    .action(async () => {
      try {
        const agent = getActiveAgent();

        console.log(chalk.bold("\n  📢 Advertise a Request\n"));
        console.log(chalk.dim("  Can't find what you need? Describe it and vendors will bid to fulfill it.\n"));

        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "title",
            message: "What are you looking for? (product name / title):",
            validate: (v: string) => (v.trim() ? true : "Required"),
          },
          {
            type: "input",
            name: "description",
            message: "Describe what you need in detail (optional):",
          },
          {
            type: "input",
            name: "sku",
            message: "Specific SKU (optional):",
          },
          {
            type: "input",
            name: "brand",
            message: "Preferred brand (optional):",
          },
          {
            type: "input",
            name: "company",
            message: "Preferred company / manufacturer (optional):",
          },
          {
            type: "input",
            name: "features",
            message: "Desired features (optional):",
          },
          {
            type: "number",
            name: "quantity",
            message: "Quantity needed:",
            default: 1,
          },
          {
            type: "confirm",
            name: "recurring",
            message: "Is this a recurring order?",
            default: false,
          },
        ]);

        let recurringNote: string | undefined;
        if (answers.recurring) {
          const recAnswer = await inquirer.prompt([
            {
              type: "input",
              name: "recurringNote",
              message: "How often? (e.g. weekly, monthly, every 2 weeks):",
            },
          ]);
          recurringNote = recAnswer.recurringNote || undefined;
        }

        const priceAnswers = await inquirer.prompt([
          {
            type: "input",
            name: "bidPrice",
            message: "Max bid price you're willing to pay (e.g. 49.99, or leave empty):",
          },
        ]);

        let currency = "USD";
        if (priceAnswers.bidPrice && parseFloat(priceAnswers.bidPrice) > 0) {
          const currencyAnswer = await inquirer.prompt([
            {
              type: "list",
              name: "currency",
              message: "Currency:",
              choices: [
                { name: "USD ($)", value: "USD" },
                { name: "EUR (€)", value: "EUR" },
                { name: "GBP (£)", value: "GBP" },
                { name: "CAD (C$)", value: "CAD" },
                { name: "AUD (A$)", value: "AUD" },
                { name: "JPY (¥)", value: "JPY" },
                { name: "CHF (Fr)", value: "CHF" },
                { name: "CNY (¥)", value: "CNY" },
                { name: "INR (₹)", value: "INR" },
                { name: "Other (enter code)", value: "OTHER" },
              ],
              default: "USD",
            },
          ]);
          if (currencyAnswer.currency === "OTHER") {
            const customCurrency = await inquirer.prompt([
              {
                type: "input",
                name: "code",
                message: "Enter 3-letter currency code (e.g. SEK, NZD, MXN):",
                validate: (v: string) => /^[A-Z]{3}$/i.test(v.trim()) || "Enter a valid 3-letter code",
              },
            ]);
            currency = customCurrency.code.toUpperCase().trim();
          } else {
            currency = currencyAnswer.currency;
          }
        }

        const speedAnswer = await inquirer.prompt([
          {
            type: "input",
            name: "speedDays",
            message: "Desired delivery speed in days (optional):",
          },
        ]);

        // Return policy preferences
        const returnAnswers = await inquirer.prompt([
          {
            type: "confirm",
            name: "freeReturns",
            message: "Require free returns?",
            default: false,
          },
          {
            type: "input",
            name: "minReturnDays",
            message: "Minimum return window in days (optional, e.g. 30):",
          },
        ]);

        // Address selection
        const api = getApiClient();
        let addressId: string | undefined;

        const addrSpinner = ora("Fetching your addresses...").start();
        try {
          const addrRes = await api.get("/addresses", { params: { agent: agent.name } });
          addrSpinner.stop();
          const addresses = addrRes.data.addresses;

          if (addresses.length > 0) {
            // Build display names and map to IDs
            const addrMap = new Map<string, string>();
            const addrChoices: { name: string; value: string }[] = [];
            
            for (const a of addresses) {
              const displayName = `${a.label} — ${a.line1}`;
              addrMap.set(displayName, a.id);
              addrChoices.push({ name: displayName, value: displayName });
            }
            const skipOption = "Skip — don't set a delivery address";
            addrChoices.push({ name: chalk.dim(skipOption), value: skipOption });

            // Find default display name
            const defaultAddr = addresses.find((a: any) => a.id === agent.defaultAddressId);
            const defaultDisplay = defaultAddr ? `${defaultAddr.label} — ${defaultAddr.line1}` : "";

            const { selectedAddress } = await inquirer.prompt([
              {
                type: "list",
                name: "selectedAddress",
                message: "Delivery location:",
                choices: addrChoices,
                default: defaultDisplay,
              },
            ]);
            
            // Look up the ID from the selected display name
            addressId = addrMap.get(selectedAddress) || undefined;
          } else {
            addrSpinner.stop();
            console.log(chalk.dim("  No addresses found. You can add one later with: clishop address add"));
          }
        } catch {
          addrSpinner.stop();
          console.log(chalk.dim("  Could not fetch addresses. Skipping delivery location."));
        }

        // Payment method selection
        let paymentMethods: string | undefined;

        const paySpinner = ora("Fetching your payment methods...").start();
        try {
          const payRes = await api.get("/payment-methods", { params: { agent: agent.name } });
          paySpinner.stop();
          const payments = payRes.data.paymentMethods;

          if (payments.length > 0) {
            const payChoices = [
              { name: chalk.green("Accept all payment methods"), value: "__ALL__" },
              ...payments.map((p: any) => ({
                name: `${p.label}${p.brand ? ` (${p.brand})` : ""}`,
                value: p.id,
                checked: true, // Default: all user's payment methods selected
              })),
            ];

            const { selectedPayments } = await inquirer.prompt([
              {
                type: "checkbox",
                name: "selectedPayments",
                message: "Accepted payment methods:",
                choices: payChoices,
              },
            ]);

            if (selectedPayments.includes("__ALL__")) {
              paymentMethods = "all";
            } else if (selectedPayments.length > 0) {
              paymentMethods = JSON.stringify(selectedPayments);
            }
          } else {
            console.log(chalk.dim("  No payment methods found. Run: clishop setup"));
          }
        } catch {
          paySpinner.stop();
          console.log(chalk.dim("  Could not fetch payment methods. Skipping."));
        }

        // Build the request body
        const body: any = {
          title: answers.title,
          description: answers.description || undefined,
          sku: answers.sku || undefined,
          brand: answers.brand || undefined,
          company: answers.company || undefined,
          features: answers.features || undefined,
          quantity: answers.quantity || 1,
          recurring: answers.recurring,
          recurringNote,
          currency,
          paymentMethods,
          addressId,
        };

        if (priceAnswers.bidPrice) {
          const price = parseFloat(priceAnswers.bidPrice);
          if (!isNaN(price) && price > 0) {
            body.bidPriceInCents = Math.round(price * 100);
          }
        }
        if (speedAnswer.speedDays) {
          const days = parseInt(speedAnswer.speedDays, 10);
          if (!isNaN(days) && days > 0) {
            body.speedDays = days;
          }
        }
        if (returnAnswers.freeReturns) {
          body.freeReturns = true;
        }
        if (returnAnswers.minReturnDays) {
          const days = parseInt(returnAnswers.minReturnDays, 10);
          if (!isNaN(days) && days > 0) {
            body.minReturnDays = days;
          }
        }

        const spinner = ora("Publishing your request...").start();
        const res = await api.post("/advertise", body);
        spinner.succeed(chalk.green(`Request published! ID: ${chalk.bold(res.data.advertise.id)}`));

        console.log(chalk.dim("\n  Vendors can now see your request and submit bids."));
        console.log(chalk.dim(`  Check bids with: clishop advertise show ${res.data.advertise.id}\n`));
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── QUICK CREATE (non-interactive, flag-based) ──────────────────────
  advertise
    .command("quick <title>")
    .description("Quickly advertise a request with flags")
    .option("-d, --description <desc>", "Detailed description")
    .option("--sku <sku>", "Specific SKU")
    .option("--brand <brand>", "Preferred brand")
    .option("--company <company>", "Preferred company")
    .option("--features <features>", "Desired features")
    .option("-q, --quantity <qty>", "Quantity", parseInt, 1)
    .option("--recurring", "Recurring order")
    .option("--recurring-note <note>", "Recurrence frequency")
    .option("--bid-price <price>", "Max bid price", parseFloat)
    .option("--currency <code>", "Currency code (default: USD)")
    .option("--speed <days>", "Desired delivery days", parseInt)
    .option("--free-returns", "Require free returns")
    .option("--min-return-days <days>", "Minimum return window in days", parseInt)
    .option("--payment-methods <methods>", 'Payment methods: "all" or comma-separated IDs')
    .option("--address <id>", "Address ID for delivery")
    .action(async (title: string, opts) => {
      try {
        // Process payment methods
        let paymentMethods: string | undefined;
        if (opts.paymentMethods) {
          if (opts.paymentMethods.toLowerCase() === "all") {
            paymentMethods = "all";
          } else {
            // Convert comma-separated IDs to JSON array
            const ids = opts.paymentMethods.split(",").map((id: string) => id.trim()).filter(Boolean);
            if (ids.length > 0) {
              paymentMethods = JSON.stringify(ids);
            }
          }
        }

        const body: any = {
          title,
          description: opts.description,
          sku: opts.sku,
          brand: opts.brand,
          company: opts.company,
          features: opts.features,
          quantity: opts.quantity,
          recurring: opts.recurring || false,
          recurringNote: opts.recurringNote,
          currency: opts.currency?.toUpperCase() || "USD",
          paymentMethods,
          addressId: opts.address,
        };

        if (opts.bidPrice) {
          body.bidPriceInCents = Math.round(opts.bidPrice * 100);
        }
        if (opts.speed) {
          body.speedDays = opts.speed;
        }
        if (opts.freeReturns) {
          body.freeReturns = true;
        }
        if (opts.minReturnDays) {
          body.minReturnDays = opts.minReturnDays;
        }

        const spinner = ora("Publishing your request...").start();
        const api = getApiClient();
        const res = await api.post("/advertise", body);
        spinner.succeed(chalk.green(`Request published! ID: ${chalk.bold(res.data.advertise.id)}`));
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── LIST ────────────────────────────────────────────────────────────
  advertise
    .command("list")
    .alias("ls")
    .description("List your advertised requests")
    .option("--status <status>", "Filter by status (open, closed, accepted, cancelled, expired)")
    .option("-p, --page <page>", "Page number", parseInt, 1)
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const spinner = ora("Fetching your requests...").start();
        const api = getApiClient();
        const res = await api.get("/advertise", {
          params: { status: opts.status, page: opts.page },
        });
        spinner.stop();

        const ads: AdvertiseRequest[] = res.data.advertises;

        if (opts.json) {
          console.log(JSON.stringify(res.data, null, 2));
          return;
        }

        if (ads.length === 0) {
          console.log(chalk.yellow("\nNo advertised requests found.\n"));
          console.log(chalk.dim("  Create one with: clishop advertise create\n"));
          return;
        }

        console.log(chalk.bold("\n📢 Your Advertised Requests:\n"));
        for (const ad of ads) {
          const statusColor = STATUS_COLORS[ad.status] || chalk.white;
          const date = new Date(ad.createdAt).toLocaleDateString();
          const bidCount = ad.bids?.length || 0;
          const bidInfo = bidCount > 0
            ? chalk.cyan(` (${bidCount} bid${bidCount > 1 ? "s" : ""})`)
            : chalk.dim(" (no bids yet)");

          console.log(
            `  ${chalk.bold(ad.id)}  ${statusColor(ad.status.toUpperCase().padEnd(10))}  ${chalk.bold(ad.title)}${bidInfo}  ${chalk.dim(date)}`
          );

          const meta: string[] = [];
          if (ad.quantity > 1) meta.push(`qty: ${ad.quantity}`);
          if (ad.brand) meta.push(ad.brand);
          if (ad.bidPriceInCents) meta.push(`max: ${formatPrice(ad.bidPriceInCents, ad.currency)}`);
          if (ad.speedDays) meta.push(`${ad.speedDays}-day delivery`);
          if (ad.freeReturns) meta.push("free returns");
          if (ad.minReturnDays) meta.push(`${ad.minReturnDays}d return min`);
          if (ad.recurring) meta.push("recurring");
          if (ad.address) meta.push(`→ ${ad.address.label}`);
          if (meta.length) {
            console.log(`    ${chalk.dim(meta.join(" · "))}`);
          }
          console.log();
        }

        const totalPages = Math.ceil(res.data.total / res.data.pageSize);
        if (totalPages > 1) {
          console.log(chalk.dim(`  Page ${res.data.page} of ${totalPages}. Use --page to navigate.\n`));
        }
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── SHOW (detail + bids) ────────────────────────────────────────────
  advertise
    .command("show <id>")
    .description("View an advertised request and its bids")
    .option("--json", "Output raw JSON")
    .action(async (id: string, opts) => {
      try {
        const spinner = ora("Fetching request...").start();
        const api = getApiClient();
        const res = await api.get(`/advertise/${id}`);
        spinner.stop();

        const ad: AdvertiseRequest = res.data.advertise;

        if (opts.json) {
          console.log(JSON.stringify(ad, null, 2));
          return;
        }

        const statusColor = STATUS_COLORS[ad.status] || chalk.white;

        console.log();
        console.log(chalk.bold.cyan(`  📢 ${ad.title}`));
        console.log(`  ID:       ${chalk.dim(ad.id)}`);
        console.log(`  Status:   ${statusColor(ad.status.toUpperCase())}`);
        if (ad.description) console.log(`  Details:  ${ad.description}`);
        if (ad.sku) console.log(`  SKU:      ${ad.sku}`);
        if (ad.brand) console.log(`  Brand:    ${ad.brand}`);
        if (ad.company) console.log(`  Company:  ${ad.company}`);
        if (ad.features) console.log(`  Features: ${ad.features}`);
        console.log(`  Quantity: ${ad.quantity}`);
        if (ad.bidPriceInCents) console.log(`  Max Bid:  ${chalk.bold(formatPrice(ad.bidPriceInCents, ad.currency))}`);
        if (ad.speedDays) console.log(`  Speed:    ${ad.speedDays}-day delivery`);
        // Return policy requirements
        const returnReqs: string[] = [];
        if (ad.freeReturns) returnReqs.push(chalk.green("Free Returns required"));
        if (ad.minReturnDays) returnReqs.push(`${ad.minReturnDays}-day return window min`);
        if (returnReqs.length) console.log(`  Returns:  ${returnReqs.join(" · ")}`);
        if (ad.recurring) console.log(`  Recurring: Yes${ad.recurringNote ? ` (${ad.recurringNote})` : ""}`);
        if (ad.address) {
          const a = ad.address;
          console.log(`  Deliver to: ${a.label} — ${a.line1 || ""}${a.city ? `, ${a.city}` : ""}${a.region ? `, ${a.region}` : ""} ${a.postalCode || ""}, ${a.country || ""}`);
        }
        if (ad.paymentMethods) {
          if (ad.paymentMethods === "all") {
            console.log(`  Payment:  ${chalk.green("All methods accepted")}`);
          } else {
            try {
              const ids = JSON.parse(ad.paymentMethods);
              console.log(`  Payment:  ${ids.length} method${ids.length > 1 ? "s" : ""} configured`);
            } catch {
              console.log(`  Payment:  ${ad.paymentMethods}`);
            }
          }
        }
        if (ad.expiresAt) console.log(`  Expires:  ${new Date(ad.expiresAt).toLocaleString()}`);
        console.log(`  Created:  ${new Date(ad.createdAt).toLocaleString()}`);

        // Bids
        const bids = ad.bids || [];
        if (bids.length === 0) {
          console.log(chalk.dim("\n  No bids yet. Vendors will be able to see your request and submit bids."));
        } else {
          console.log(chalk.bold(`\n  Bids (${bids.length}):\n`));
          for (const bid of bids) {
            const bidStatusColor = BID_STATUS_COLORS[bid.status] || chalk.white;
            const storeBadge = bid.store?.verified ? chalk.green(" ✓") : "";
            const storeRating = bid.store?.rating != null ? chalk.dim(` (${bid.store.rating.toFixed(1)}★)`) : "";

            console.log(`    ${chalk.bold(bid.id)}  ${bidStatusColor(bid.status.toUpperCase().padEnd(10))}  ${chalk.bold(formatPrice(bid.priceInCents, bid.currency))}`);
            console.log(`      Store: ${bid.store?.name || bid.storeId}${storeBadge}${storeRating}`);
            if (bid.shippingDays != null) console.log(`      Delivery: ${bid.shippingDays}-day`);
            const bidReturns: string[] = [];
            if (bid.freeReturns) bidReturns.push(chalk.green("Free Returns"));
            if (bid.returnWindowDays) bidReturns.push(`${bid.returnWindowDays}-day return window`);
            if (bidReturns.length) console.log(`      Returns: ${bidReturns.join(" · ")}`);
            if (bid.note) console.log(`      Note: ${bid.note}`);
            if (bid.product) console.log(`      Product: ${bid.product.name} (${formatPrice(bid.product.priceInCents, bid.product.currency)})`);
            console.log(`      Date: ${new Date(bid.createdAt).toLocaleString()}`);
            console.log();
          }

          if (ad.status === "open") {
            const pendingBids = bids.filter((b) => b.status === "pending");
            if (pendingBids.length > 0) {
              console.log(chalk.dim(`  Accept a bid: clishop advertise accept ${ad.id} <bidId>`));
              console.log(chalk.dim(`  Reject a bid: clishop advertise reject ${ad.id} <bidId>\n`));
            }
          }
        }
        console.log();
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── ACCEPT BID ──────────────────────────────────────────────────────
  advertise
    .command("accept <advertiseId> <bidId>")
    .description("Accept a vendor's bid on your request")
    .action(async (advertiseId: string, bidId: string) => {
      try {
        // Show bid details first
        const api = getApiClient();
        const detailSpinner = ora("Fetching bid details...").start();
        const detailRes = await api.get(`/advertise/${advertiseId}`);
        detailSpinner.stop();

        const ad: AdvertiseRequest = detailRes.data.advertise;
        const bid = ad.bids?.find((b) => b.id === bidId);

        if (!bid) {
          console.error(chalk.red(`\n✗ Bid ${bidId} not found on request ${advertiseId}.`));
          process.exitCode = 1;
          return;
        }

        console.log(chalk.bold("\n  Accept this bid?\n"));
        console.log(`    Request:  ${ad.title}`);
        console.log(`    Store:    ${bid.store?.name || bid.storeId}${bid.store?.verified ? chalk.green(" ✓") : ""}`);
        console.log(`    Price:    ${chalk.bold(formatPrice(bid.priceInCents, bid.currency))}`);
        if (bid.shippingDays != null) console.log(`    Delivery: ${bid.shippingDays}-day`);
        if (bid.note) console.log(`    Note:     ${bid.note}`);
        console.log();

        const { confirm } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirm",
            message: "Accept this bid? (All other bids will be rejected)",
            default: false,
          },
        ]);
        if (!confirm) {
          console.log(chalk.yellow("Cancelled."));
          return;
        }

        const spinner = ora("Accepting bid...").start();
        await api.post(`/advertise/${advertiseId}/bids/${bidId}/accept`);
        spinner.succeed(chalk.green("Bid accepted! The vendor will now fulfill your request."));
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── REJECT BID ──────────────────────────────────────────────────────
  advertise
    .command("reject <advertiseId> <bidId>")
    .description("Reject a vendor's bid")
    .action(async (advertiseId: string, bidId: string) => {
      try {
        const { confirm } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirm",
            message: `Reject bid ${bidId}?`,
            default: false,
          },
        ]);
        if (!confirm) return;

        const spinner = ora("Rejecting bid...").start();
        const api = getApiClient();
        await api.post(`/advertise/${advertiseId}/bids/${bidId}/reject`);
        spinner.succeed(chalk.green("Bid rejected."));
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── CANCEL ──────────────────────────────────────────────────────────
  advertise
    .command("cancel <id>")
    .description("Cancel an advertised request")
    .action(async (id: string) => {
      try {
        const { confirm } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirm",
            message: `Cancel advertised request ${id}?`,
            default: false,
          },
        ]);
        if (!confirm) return;

        const spinner = ora("Cancelling request...").start();
        const api = getApiClient();
        await api.post(`/advertise/${id}/cancel`);
        spinner.succeed(chalk.green("Request cancelled."));
      } catch (error) {
        handleApiError(error);
      }
    });
}
