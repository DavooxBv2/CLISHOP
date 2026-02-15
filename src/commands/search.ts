import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { getApiClient, handleApiError } from "../api.js";

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  vendor: string;
  rating: number;
  reviewCount: number;
  inStock: boolean;
  imageUrl?: string;
}

export interface SearchResult {
  products: Product[];
  total: number;
  page: number;
  pageSize: number;
}

function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(price);
}

function renderStars(rating: number): string {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(empty);
}

export function registerSearchCommands(program: Command): void {
  // ── SEARCH ─────────────────────────────────────────────────────────
  program
    .command("search <query>")
    .description("Search for products")
    .option("-c, --category <category>", "Filter by category")
    .option("--min-price <price>", "Minimum price", parseFloat)
    .option("--max-price <price>", "Maximum price", parseFloat)
    .option("--min-rating <rating>", "Minimum rating (1-5)", parseFloat)
    .option("-s, --sort <field>", "Sort by: price, rating, relevance, newest", "relevance")
    .option("--order <dir>", "Sort order: asc, desc", "desc")
    .option("-p, --page <page>", "Page number", parseInt, 1)
    .option("-n, --per-page <count>", "Results per page", parseInt, 20)
    .option("--in-stock", "Only show in-stock items")
    .option("--vendor <vendor>", "Filter by vendor name")
    .option("--json", "Output raw JSON")
    .action(async (query: string, opts) => {
      try {
        const spinner = ora(`Searching for "${query}"...`).start();
        const api = getApiClient();
        const res = await api.get("/products/search", {
          params: {
            q: query,
            category: opts.category,
            minPrice: opts.minPrice,
            maxPrice: opts.maxPrice,
            minRating: opts.minRating,
            sort: opts.sort,
            order: opts.order,
            page: opts.page,
            pageSize: opts.perPage,
            inStock: opts.inStock || undefined,
            vendor: opts.vendor,
          },
        });
        spinner.stop();

        const result: SearchResult = res.data;

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.products.length === 0) {
          console.log(chalk.yellow(`\nNo results found for "${query}".`));
          return;
        }

        console.log(
          chalk.bold(`\nResults for "${query}" — ${result.total} found (page ${result.page})\n`)
        );

        for (const p of result.products) {
          const stock = p.inStock ? chalk.green("In Stock") : chalk.red("Out of Stock");
          const price = chalk.bold.white(formatPrice(p.price, p.currency));
          const stars = chalk.yellow(renderStars(p.rating));

          console.log(`  ${chalk.bold.cyan(p.name)} ${chalk.dim(`(${p.id})`)}`);
          console.log(`    ${price}  ${stock}  ${stars} ${chalk.dim(`(${p.reviewCount} reviews)`)}`);
          console.log(`    ${chalk.dim(p.category)} · ${chalk.dim(`by ${p.vendor}`)}`);
          console.log(`    ${p.description.length > 120 ? p.description.slice(0, 120) + "..." : p.description}`);
          console.log();
        }

        const totalPages = Math.ceil(result.total / result.pageSize);
        if (totalPages > 1) {
          console.log(chalk.dim(`  Page ${result.page} of ${totalPages}. Use --page to navigate.\n`));
        }
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── PRODUCT DETAIL ─────────────────────────────────────────────────
  program
    .command("product <id>")
    .description("View detailed product information")
    .option("--json", "Output raw JSON")
    .action(async (id: string, opts) => {
      try {
        const spinner = ora("Fetching product details...").start();
        const api = getApiClient();
        const res = await api.get(`/products/${id}`);
        spinner.stop();

        const p: Product = res.data.product;

        if (opts.json) {
          console.log(JSON.stringify(p, null, 2));
          return;
        }

        console.log();
        console.log(chalk.bold.cyan(`  ${p.name}`));
        console.log(chalk.dim(`  ID: ${p.id}`));
        console.log();
        console.log(`  Price:    ${chalk.bold(formatPrice(p.price, p.currency))}`);
        console.log(`  Status:   ${p.inStock ? chalk.green("In Stock") : chalk.red("Out of Stock")}`);
        console.log(`  Rating:   ${chalk.yellow(renderStars(p.rating))} ${chalk.dim(`(${p.reviewCount} reviews)`)}`);
        console.log(`  Category: ${p.category}`);
        console.log(`  Vendor:   ${p.vendor}`);
        console.log();
        console.log(`  ${p.description}`);
        console.log();
      } catch (error) {
        handleApiError(error);
      }
    });
}
