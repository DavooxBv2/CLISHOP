import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { getApiClient, handleApiError } from "../api.js";

export interface Store {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  description?: string;
  country?: string;
  currency: string;
  status: string;
  verified: boolean;
  rating: number | null;
  logoUrl?: string;
  contactEmail?: string;
  productCount?: number;
  createdAt: string;
}

interface Product {
  id: string;
  name: string;
  description: string;
  priceInCents: number;
  currency: string;
  category: string;
  rating: number;
  reviewCount: number;
  inStock: boolean;
  backorder: boolean;
  brand?: string;
  variant?: string;
  freeShipping: boolean;
  shippingPriceInCents?: number;
  shippingDays?: number;
  freeReturns: boolean;
  returnWindowDays?: number;
  storeVerified: boolean;
}

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function renderStars(rating: number): string {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(empty);
}

function deliveryLabel(days: number): string {
  if (days <= 0) return "Same-day";
  if (days === 1) return "Next-day";
  if (days === 2) return "2-day";
  return `${days}-day`;
}

export function registerStoreCommands(program: Command): void {
  const store = program
    .command("store")
    .description("Browse stores and their catalogs");

  // ── LIST stores ─────────────────────────────────────────────────────
  store
    .command("list")
    .alias("ls")
    .description("List available stores")
    .option("-q, --query <query>", "Search stores by name")
    .option("--verified", "Only show verified stores")
    .option("--min-rating <rating>", "Minimum store rating (0-5)", parseFloat)
    .option("--country <country>", "Filter by country")
    .option("-s, --sort <field>", "Sort by: name, rating, newest, products", "name")
    .option("--order <dir>", "Sort order: asc, desc", "asc")
    .option("-p, --page <page>", "Page number", parseInt, 1)
    .option("-n, --per-page <count>", "Results per page", parseInt, 20)
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const spinner = ora("Fetching stores...").start();
        const api = getApiClient();
        const res = await api.get("/stores", {
          params: {
            q: opts.query,
            verified: opts.verified || undefined,
            minRating: opts.minRating,
            country: opts.country,
            sort: opts.sort,
            order: opts.order,
            page: opts.page,
            pageSize: opts.perPage,
          },
        });
        spinner.stop();

        const { stores, total, page, pageSize } = res.data;

        if (opts.json) {
          console.log(JSON.stringify(res.data, null, 2));
          return;
        }

        if (stores.length === 0) {
          console.log(chalk.yellow("\nNo stores found.\n"));
          return;
        }

        console.log(chalk.bold(`\nStores — ${total} found (page ${page})\n`));

        for (const s of stores as Store[]) {
          const badge = s.verified ? chalk.green(" ✓") : "";
          const rating = s.rating != null
            ? chalk.yellow(renderStars(s.rating)) + chalk.dim(` (${s.rating.toFixed(1)})`)
            : chalk.dim("No rating");
          const products = s.productCount != null
            ? chalk.dim(`${s.productCount} products`)
            : "";
          const country = s.country ? chalk.dim(`  ${s.country}`) : "";

          console.log(`  ${chalk.bold.cyan(s.name)}${badge} ${chalk.dim(`(${s.slug})`)}`);
          console.log(`    ${rating}  ${products}${country}`);
          if (s.description) {
            const desc = s.description.length > 100
              ? s.description.slice(0, 100) + "..."
              : s.description;
            console.log(`    ${chalk.dim(desc)}`);
          }
          console.log();
        }

        const totalPages = Math.ceil(total / pageSize);
        if (totalPages > 1) {
          console.log(chalk.dim(`  Page ${page} of ${totalPages}. Use --page to navigate.\n`));
        }
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── STORE INFO ──────────────────────────────────────────────────────
  store
    .command("info <store>")
    .description("View store details (by name, slug, or ID)")
    .option("--json", "Output raw JSON")
    .action(async (storeId: string, opts) => {
      try {
        const spinner = ora("Fetching store info...").start();
        const api = getApiClient();
        const res = await api.get(`/stores/${encodeURIComponent(storeId)}`);
        spinner.stop();

        const s: Store = res.data.store;

        if (opts.json) {
          console.log(JSON.stringify(s, null, 2));
          return;
        }

        const badge = s.verified ? chalk.green(" ✓ Verified") : chalk.dim(" Unverified");

        console.log();
        console.log(chalk.bold.cyan(`  ${s.name}`) + badge);
        console.log(chalk.dim(`  ID: ${s.id}  |  Slug: ${s.slug}`));
        console.log();

        if (s.description) console.log(`  ${s.description}`);
        console.log();

        if (s.rating != null) {
          console.log(`  Rating:   ${chalk.yellow(renderStars(s.rating))} ${chalk.dim(`(${s.rating.toFixed(1)})`)}`);
        }
        if (s.productCount != null) console.log(`  Products: ${s.productCount}`);
        if (s.country) console.log(`  Country:  ${s.country}`);
        console.log(`  Currency: ${s.currency}`);
        if (s.domain) console.log(`  Website:  ${chalk.cyan.underline(s.domain)}`);
        if (s.contactEmail) console.log(`  Contact:  ${s.contactEmail}`);
        console.log();
        console.log(chalk.dim(`  Browse catalog: clishop store catalog ${s.slug}`));
        console.log(chalk.dim(`  Search products: clishop search "<query>" --store ${s.slug}`));
        console.log();
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── STORE CATALOG ───────────────────────────────────────────────────
  store
    .command("catalog <store>")
    .description("Browse a store's product catalog (by name, slug, or ID)")
    .option("-q, --query <query>", "Search within the store's products")
    .option("-c, --category <category>", "Filter by category")
    .option("--min-price <price>", "Minimum price (cents)", parseFloat)
    .option("--max-price <price>", "Maximum price (cents)", parseFloat)
    .option("--min-rating <rating>", "Minimum product rating (1-5)", parseFloat)
    .option("--in-stock", "Only show in-stock items")
    .option("--free-shipping", "Only show items with free shipping")
    .option("-s, --sort <field>", "Sort by: price, rating, newest, name", "newest")
    .option("--order <dir>", "Sort order: asc, desc", "desc")
    .option("-p, --page <page>", "Page number", parseInt, 1)
    .option("-n, --per-page <count>", "Results per page", parseInt, 20)
    .option("--json", "Output raw JSON")
    .action(async (storeId: string, opts) => {
      try {
        const spinner = ora(`Fetching catalog for "${storeId}"...`).start();
        const api = getApiClient();
        const res = await api.get(`/stores/${encodeURIComponent(storeId)}/catalog`, {
          params: {
            q: opts.query,
            category: opts.category,
            minPrice: opts.minPrice,
            maxPrice: opts.maxPrice,
            minRating: opts.minRating,
            inStock: opts.inStock || undefined,
            freeShipping: opts.freeShipping || undefined,
            sort: opts.sort,
            order: opts.order,
            page: opts.page,
            pageSize: opts.perPage,
          },
        });
        spinner.stop();

        const { store: storeInfo, products, total, page, pageSize } = res.data;

        if (opts.json) {
          console.log(JSON.stringify(res.data, null, 2));
          return;
        }

        const badge = storeInfo.verified ? chalk.green(" ✓") : "";
        const storeRating = storeInfo.rating != null
          ? chalk.dim(` (${storeInfo.rating.toFixed(1)} ★)`)
          : "";

        console.log(
          chalk.bold(`\n${storeInfo.name}${badge}${storeRating} — ${total} products (page ${page})\n`)
        );

        if (products.length === 0) {
          console.log(chalk.yellow("  No products found matching your filters.\n"));
          return;
        }

        for (const p of products as Product[]) {
          const stock = p.inStock
            ? chalk.green("In Stock")
            : p.backorder
              ? chalk.yellow("Backorder")
              : chalk.red("Out of Stock");
          const price = chalk.bold.white(formatPrice(p.priceInCents, p.currency));
          const stars = chalk.yellow(renderStars(p.rating));

          const shippingInfo = p.freeShipping
            ? chalk.green("Free Shipping")
            : p.shippingPriceInCents != null
              ? chalk.dim(`+${formatPrice(p.shippingPriceInCents, p.currency)} shipping`)
              : "";
          const deliveryInfo = p.shippingDays != null
            ? chalk.dim(`(${deliveryLabel(p.shippingDays)})`)
            : "";

          console.log(`  ${chalk.bold.cyan(p.name)} ${chalk.dim(`(${p.id})`)}`);
          console.log(
            `    ${price}  ${stock}  ${stars} ${chalk.dim(`(${p.reviewCount} reviews)`)}` +
            (shippingInfo ? `  ${shippingInfo}` : "") +
            (deliveryInfo ? ` ${deliveryInfo}` : "")
          );

          const meta: string[] = [];
          if (p.category) meta.push(p.category);
          if (p.brand) meta.push(p.brand);
          if (p.variant) meta.push(p.variant);
          if (meta.length) console.log(`    ${chalk.dim(meta.join(" · "))}`);

          const returnInfo: string[] = [];
          if (p.freeReturns) returnInfo.push("Free Returns");
          if (p.returnWindowDays) returnInfo.push(`${p.returnWindowDays}d return window`);
          if (returnInfo.length) console.log(`    ${chalk.dim(returnInfo.join(" · "))}`);

          const desc = p.description.length > 120
            ? p.description.slice(0, 120) + "..."
            : p.description;
          console.log(`    ${desc}`);
          console.log();
        }

        const totalPages = Math.ceil(total / pageSize);
        if (totalPages > 1) {
          console.log(chalk.dim(`  Page ${page} of ${totalPages}. Use --page to navigate.\n`));
        }
      } catch (error) {
        handleApiError(error);
      }
    });

}
