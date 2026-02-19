import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { getApiClient, handleApiError } from "../api.js";

export interface Product {
  id: string;
  name: string;
  description: string;
  priceInCents: number;
  currency: string;
  category: string;
  categoryId?: string;
  vendor: string;
  storeId: string;
  storeName: string;
  storeVerified: boolean;
  storeRating: number | null;
  rating: number;
  reviewCount: number;
  inStock: boolean;
  imageUrl?: string;
  sku?: string;
  brand?: string;
  model?: string;
  gtin?: string;
  variant?: string;
  shippingPriceInCents?: number;
  freeShipping: boolean;
  shippingDays?: number;
  stockQuantity?: number;
  backorder: boolean;
  freeReturns: boolean;
  returnWindowDays?: number;
  checkoutMode: string;
}

export interface SearchResult {
  products: Product[];
  total: number;
  page: number;
  pageSize: number;
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

export function registerSearchCommands(program: Command): void {
  // ── SEARCH ─────────────────────────────────────────────────────────
  program
    .command("search <query>")
    .description("Search for products")

    // Product match
    .option("-c, --category <category>", "Filter by category")
    .option("--brand <brand>", "Filter by brand")
    .option("--model <model>", "Filter by model name/number")
    .option("--sku <sku>", "Filter by SKU")
    .option("--gtin <gtin>", "Filter by GTIN (UPC/EAN/ISBN)")
    .option("--variant <variant>", "Filter by variant (size/color/storage/etc.)")

    // Cost
    .option("--min-price <price>", "Minimum price (cents)", parseFloat)
    .option("--max-price <price>", "Maximum price (cents)", parseFloat)
    .option("--max-shipping <price>", "Maximum shipping cost (cents)", parseInt)
    .option("--max-total <price>", "Maximum landed total: item + shipping (cents)", parseInt)
    .option("--free-shipping", "Only show items with free shipping")

    // Delivery
    .option("--ship-to <address>", "Address profile label or ID (for context)")
    .option("--country <code>", "Delivery country (ISO 3166-1 alpha-2, e.g. US, BE, NL)")
    .option("--deliver-by <date>", "Need delivery by date (YYYY-MM-DD)")
    .option("--max-delivery-days <days>", "Maximum delivery/transit days", parseInt)

    // Availability
    .option("--in-stock", "Only show in-stock items")
    .option("--exclude-backorder", "Exclude backordered items")
    .option("--min-qty <qty>", "Minimum quantity available", parseInt)

    // Returns
    .option("--free-returns", "Only show items with free returns")
    .option("--min-return-window-days <days>", "Minimum return window in days", parseInt)

    // Trust / eligibility
    .option("--store <store>", "Limit to a store (ID, slug, or name)")
    .option("--vendor <vendor>", "Filter by vendor name (alias for --store)")
    .option("--trusted-only", "Only show products from verified stores")
    .option("--min-store-rating <rating>", "Minimum store rating (0-5)", parseFloat)
    .option("--checkout-mode <mode>", "Checkout mode: instant, handoff")

    // Rating / sorting / pagination
    .option("--min-rating <rating>", "Minimum product rating (1-5)", parseFloat)
    .option("-s, --sort <field>", "Sort by: price, rating, relevance, newest, delivery", "relevance")
    .option("--order <dir>", "Sort order: asc, desc", "desc")
    .option("-p, --page <page>", "Page number", parseInt, 1)
    .option("-n, --per-page <count>", "Results per page", parseInt, 20)

    // Extended search
    .option("-e, --extended-search", "Enable extended search: query darkstores when no local results found")
    .option("--extended-timeout <seconds>", "Extended search timeout in seconds (default: 20, max: 60)", parseInt)

    // Output
    .option("--json", "Output raw JSON")

    .action(async (query: string, opts) => {
      try {
        const spinner = ora(`Searching for "${query}"...`).start();
        const api = getApiClient();

        // Compute --deliver-by → maxDeliveryDays if not explicitly set
        let maxDeliveryDays = opts.maxDeliveryDays;
        if (!maxDeliveryDays && opts.deliverBy) {
          const target = new Date(opts.deliverBy);
          const now = new Date();
          const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (diff > 0) maxDeliveryDays = diff;
        }

        // Extended search: clamp timeout to 5-60s
        const extendedSearch = opts.extendedSearch || false;
        const extendedTimeout = opts.extendedTimeout
          ? Math.min(60, Math.max(5, opts.extendedTimeout))
          : 20;

        // If extended search is enabled, increase the HTTP timeout to match
        const httpTimeout = extendedSearch ? (extendedTimeout + 5) * 1000 : 15000;

        if (extendedSearch) {
          spinner.text = `Searching for "${query}" (extended search: ${extendedTimeout}s timeout)...`;
        }

        const res = await api.get("/products/search", {
          params: {
            q: query,
            // Product match
            category: opts.category,
            brand: opts.brand,
            model: opts.model,
            sku: opts.sku,
            gtin: opts.gtin,
            variant: opts.variant,
            // Cost
            minPrice: opts.minPrice,
            maxPrice: opts.maxPrice,
            maxShipping: opts.maxShipping,
            maxTotal: opts.maxTotal,
            freeShipping: opts.freeShipping || undefined,
            // Delivery
            country: opts.country || undefined,
            maxDeliveryDays: maxDeliveryDays,
            // Availability
            inStock: opts.inStock || undefined,
            excludeBackorder: opts.excludeBackorder || undefined,
            minQty: opts.minQty,
            // Returns
            freeReturns: opts.freeReturns || undefined,
            minReturnDays: opts.minReturnWindowDays,
            // Trust
            store: opts.store,
            vendor: opts.vendor,
            trustedOnly: opts.trustedOnly || undefined,
            minStoreRating: opts.minStoreRating,
            checkoutMode: opts.checkoutMode,
            // Rating / sorting / pagination
            minRating: opts.minRating,
            sort: opts.sort,
            order: opts.order,
            page: opts.page,
            pageSize: opts.perPage,
            // Extended search
            extendedSearch: extendedSearch || undefined,
            extendedTimeout: extendedSearch ? extendedTimeout : undefined,
          },
          timeout: httpTimeout,
        });
        spinner.stop();

        const result: SearchResult = res.data;

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        // Check for extended search results
        const extended = (res.data as any).extended;
        const suggestAdvertise = (res.data as any).suggestAdvertise;

        if (result.products.length === 0 && (!extended || extended.total === 0)) {
          console.log(chalk.yellow(`\nNo results found for "${query}".`));

          if (!extendedSearch) {
            console.log(
              chalk.dim("\n  🔍 Tip: ") +
              chalk.white("Try extended search to query vendor stores in real-time:") +
              chalk.dim(`\n         Run: `) +
              chalk.cyan(`clishop search "${query}" --extended-search`) +
              chalk.dim("\n")
            );
          }

          if (suggestAdvertise || !extendedSearch) {
            console.log(
              chalk.dim("  💡 Tip: ") +
              chalk.white("Can't find what you need? Advertise your request and let vendors come to you!") +
              chalk.dim(`\n         Run: `) +
              chalk.cyan(`clishop advertise create`) +
              chalk.dim(` or `) +
              chalk.cyan(`clishop advertise quick "${query}"`) +
              chalk.dim("\n")
            );
          }
          return;
        }

        // Show local results
        if (result.products.length > 0) {
          console.log(
            chalk.bold(`\nResults for "${query}" — ${result.total} found (page ${result.page})\n`)
          );
        } else if (extended && extended.total > 0) {
          console.log(
            chalk.bold(`\nNo local results for "${query}". Extended search found ${extended.total} result(s) from ${extended.storesResponded} store(s):\n`)
          );
        }

        for (const p of result.products) {
          const stock = p.inStock
            ? chalk.green("In Stock")
            : p.backorder
              ? chalk.yellow("Backorder")
              : chalk.red("Out of Stock");
          const price = chalk.bold.white(formatPrice(p.priceInCents, p.currency));
          const stars = chalk.yellow(renderStars(p.rating));

          // Shipping info
          const shippingInfo = p.freeShipping
            ? chalk.green("Free Shipping")
            : p.shippingPriceInCents != null
              ? chalk.dim(`+${formatPrice(p.shippingPriceInCents, p.currency)} shipping`)
              : "";
          const deliveryInfo = p.shippingDays != null
            ? chalk.dim(`(${deliveryLabel(p.shippingDays)})`)
            : "";

          // Store trust badge
          const storeBadge = p.storeVerified ? chalk.green(" ✓") : "";

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
          meta.push(`by ${p.vendor}${storeBadge}`);
          console.log(`    ${chalk.dim(meta.join(" · "))}`);

          // Returns info
          const returnInfo: string[] = [];
          if (p.freeReturns) returnInfo.push("Free Returns");
          if (p.returnWindowDays) returnInfo.push(`${p.returnWindowDays}d return window`);
          if (p.checkoutMode === "handoff") returnInfo.push("Handoff checkout");

          if (returnInfo.length) {
            console.log(`    ${chalk.dim(returnInfo.join(" · "))}`);
          }

          console.log(`    ${p.description.length > 120 ? p.description.slice(0, 120) + "..." : p.description}`);
          console.log();
        }

        const totalPages = Math.ceil(result.total / result.pageSize);
        if (totalPages > 1) {
          console.log(chalk.dim(`  Page ${result.page} of ${totalPages}. Use --page to navigate.\n`));
        }

        // ── Extended search results ───────────────────────────────────
        if (extended && extended.products && extended.products.length > 0) {
          if (result.products.length > 0) {
            console.log(chalk.bold.magenta(`\n── Extended Search Results (${extended.total} from ${extended.storesResponded} store(s)) ──\n`));
          }

          for (const ep of extended.products) {
            const stock = ep.inStock
              ? chalk.green("In Stock")
              : chalk.red("Out of Stock");
            const price = chalk.bold.white(formatPrice(ep.priceInCents, ep.currency));

            const shippingInfo = ep.freeShipping
              ? chalk.green("Free Shipping")
              : ep.shippingPriceInCents != null
                ? chalk.dim(`+${formatPrice(ep.shippingPriceInCents, ep.currency)} shipping`)
                : "";
            const deliveryInfo = ep.shippingDays != null
              ? chalk.dim(`(${deliveryLabel(ep.shippingDays)})`)
              : "";

            console.log(`  ${chalk.bold.cyan(ep.name)} ${chalk.dim(`(${ep.externalProductId})`)}`);
            console.log(
              `    ${price}  ${stock}` +
              (shippingInfo ? `  ${shippingInfo}` : "") +
              (deliveryInfo ? ` ${deliveryInfo}` : "")
            );

            const meta: string[] = [];
            if (ep.brand) meta.push(ep.brand);
            if (ep.variant || ep.variantLabel) meta.push(ep.variant || ep.variantLabel);
            if (ep.storeName) meta.push(`by ${ep.storeName}`);
            meta.push(chalk.magenta("extended"));
            console.log(`    ${chalk.dim(meta.join(" · "))}`);

            if (ep.description) {
              console.log(`    ${ep.description.length > 120 ? ep.description.slice(0, 120) + "..." : ep.description}`);
            }
            console.log();
          }
        }

        // Show advertise tip on the last page of results
        const showAdvertiseTip = result.page >= totalPages || suggestAdvertise;
        if (showAdvertiseTip) {
          // If no extended search was used, suggest it
          if (!extendedSearch && result.products.length > 0) {
            console.log(
              chalk.dim("  🔍 Tip: ") +
              chalk.white("Want more results? Try extended search:") +
              chalk.dim(`\n         Run: `) +
              chalk.cyan(`clishop search "${query}" --extended-search`) +
              chalk.dim("\n")
            );
          }

          console.log(
            chalk.dim("  💡 Tip: ") +
            chalk.white("Didn't find the right match? Advertise your request for vendors to bid on.") +
            chalk.dim(`\n         Run: `) +
            chalk.cyan(`clishop advertise create`) +
            chalk.dim(` or `) +
            chalk.cyan(`clishop advertise quick "${query}"`) +
            chalk.dim("\n")
          );
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

        const storeBadge = p.storeVerified ? chalk.green(" ✓ Verified") : "";

        console.log();
        console.log(chalk.bold.cyan(`  ${p.name}`));
        console.log(chalk.dim(`  ID: ${p.id}`));
        if (p.brand) console.log(chalk.dim(`  Brand: ${p.brand}`));
        if (p.model) console.log(chalk.dim(`  Model: ${p.model}`));
        if (p.variant) console.log(chalk.dim(`  Variant: ${p.variant}`));
        if (p.sku) console.log(chalk.dim(`  SKU: ${p.sku}`));
        if (p.gtin) console.log(chalk.dim(`  GTIN: ${p.gtin}`));
        console.log();

        // Price & shipping
        console.log(`  Price:    ${chalk.bold(formatPrice(p.priceInCents, p.currency))}`);
        if (p.freeShipping) {
          console.log(`  Shipping: ${chalk.green("Free")}`);
        } else if (p.shippingPriceInCents != null) {
          console.log(`  Shipping: ${formatPrice(p.shippingPriceInCents, p.currency)}`);
        }
        if (p.shippingPriceInCents != null || p.freeShipping) {
          const total = p.priceInCents + (p.freeShipping ? 0 : (p.shippingPriceInCents ?? 0));
          console.log(`  Total:    ${chalk.bold(formatPrice(total, p.currency))}`);
        }

        // Availability
        const status = p.inStock
          ? chalk.green("In Stock")
          : p.backorder
            ? chalk.yellow("Backorder")
            : chalk.red("Out of Stock");
        console.log(`  Status:   ${status}${p.stockQuantity != null ? chalk.dim(` (${p.stockQuantity} available)`) : ""}`);

        // Delivery
        if (p.shippingDays != null) console.log(`  Delivery: ${deliveryLabel(p.shippingDays)}`);

        // Rating
        console.log(`  Rating:   ${chalk.yellow(renderStars(p.rating))} ${chalk.dim(`(${p.reviewCount} reviews)`)}`);
        console.log(`  Category: ${p.category}`);
        console.log(`  Store:    ${p.vendor}${storeBadge}${p.storeRating != null ? chalk.dim(` (${p.storeRating.toFixed(1)} store rating)`) : ""}`);

        // Returns
        const returnParts: string[] = [];
        if (p.freeReturns) returnParts.push(chalk.green("Free Returns"));
        if (p.returnWindowDays) returnParts.push(`${p.returnWindowDays}-day return window`);
        if (returnParts.length) console.log(`  Returns:  ${returnParts.join(" · ")}`);

        // Checkout mode
        if (p.checkoutMode && p.checkoutMode !== "instant") {
          console.log(`  Checkout: ${chalk.yellow(p.checkoutMode)}`);
        }

        console.log();
        console.log(`  ${p.description}`);
        console.log();
      } catch (error) {
        handleApiError(error);
      }
    });
}
