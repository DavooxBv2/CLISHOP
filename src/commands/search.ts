import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { getApiClient, handleApiError } from "../api.js";
import { getActiveAgent } from "../config.js";

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

// ── Currency conversion ──────────────────────────────────────────────
// Uses the free open.er-api.com (no key needed, updates daily)

let rateCache: { base: string; rates: Record<string, number>; fetchedAt: number } | null = null;

async function fetchRates(baseCurrency: string): Promise<Record<string, number>> {
  // Cache for 1 hour
  if (rateCache && rateCache.base === baseCurrency && Date.now() - rateCache.fetchedAt < 3600000) {
    return rateCache.rates;
  }
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${baseCurrency}`);
    const data = await res.json() as { rates?: Record<string, number> };
    if (data.rates) {
      rateCache = { base: baseCurrency, rates: data.rates, fetchedAt: Date.now() };
      return data.rates;
    }
  } catch {
    // Silently fail — conversion is optional
  }
  return {};
}

function convertPrice(cents: number, fromCurrency: string, toCurrency: string, rates: Record<string, number>): number | null {
  if (fromCurrency === toCurrency) return null; // same currency, no conversion needed
  const rate = rates[toCurrency];
  if (!rate) return null;
  return Math.round(cents * rate);
}

function formatConverted(cents: number, fromCurrency: string, toCurrency: string, rates: Record<string, number>): string {
  const converted = convertPrice(cents, fromCurrency, toCurrency, rates);
  if (converted == null) return "";
  return chalk.dim(` (~${formatPrice(converted, toCurrency)})`);
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

function estimatedArrival(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function scoreOutOf10(rating: number, maxScale = 5): string {
  return ((rating / maxScale) * 10).toFixed(1);
}

// ── Free-form info renderer ───────────────────────────────────────────
// Recursively renders arbitrary key-value data from stores in a readable way.
// Handles nested objects, arrays, strings, numbers, booleans, etc.

function renderFreeFormInfo(data: any, indent: number = 0): void {
  const pad = " ".repeat(indent);

  if (data == null) return;

  if (typeof data === "string") {
    // Wrap long strings
    if (data.length > 100) {
      const words = data.split(/\s+/);
      let line = "";
      for (const word of words) {
        if (line.length + word.length + 1 > 90) {
          console.log(`${pad}${chalk.dim(line)}`);
          line = word;
        } else {
          line = line ? `${line} ${word}` : word;
        }
      }
      if (line) console.log(`${pad}${chalk.dim(line)}`);
    } else {
      console.log(`${pad}${data}`);
    }
    return;
  }

  if (typeof data === "number" || typeof data === "boolean") {
    console.log(`${pad}${data}`);
    return;
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      if (typeof item === "string") {
        console.log(`${pad}${chalk.dim("•")} ${item}`);
      } else if (typeof item === "object" && item !== null) {
        renderFreeFormInfo(item, indent + 2);
        console.log(); // spacing between array items
      } else {
        console.log(`${pad}${chalk.dim("•")} ${String(item)}`);
      }
    }
    return;
  }

  if (typeof data === "object") {
    for (const [key, value] of Object.entries(data)) {
      // Skip internal/meta fields
      if (key === "product_id" || key === "error" || key === "available") continue;

      const label = key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      if (value == null) continue;

      if (typeof value === "string") {
        if (value.length > 80) {
          console.log(`${pad}${chalk.bold(label + ":")}`);
          renderFreeFormInfo(value, indent + 4);
        } else {
          console.log(`${pad}${chalk.bold(label + ":")} ${value}`);
        }
      } else if (typeof value === "number") {
        console.log(`${pad}${chalk.bold(label + ":")} ${value}`);
      } else if (typeof value === "boolean") {
        console.log(`${pad}${chalk.bold(label + ":")} ${value ? chalk.green("Yes") : chalk.red("No")}`);
      } else if (Array.isArray(value)) {
        console.log(`${pad}${chalk.bold(label + ":")}`);
        renderFreeFormInfo(value, indent + 4);
      } else if (typeof value === "object") {
        console.log(`${pad}${chalk.bold(label + ":")}`);
        renderFreeFormInfo(value, indent + 4);
      }
    }
  }
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

    // Delivery location
    .option("--ship-to <address>", "Saved address label or ID (resolves country/city/postal automatically)")
    .option("--country <code>", "Delivery country (ISO 3166-1 alpha-2, e.g. US, BE, NL)")
    .option("--city <city>", "Delivery city")
    .option("--postal-code <code>", "Delivery postal/zip code")
    .option("--region <region>", "Delivery state/province/region")
    .option("--lat <latitude>", "Delivery latitude (for local/proximity search)", parseFloat)
    .option("--lng <longitude>", "Delivery longitude (for local/proximity search)", parseFloat)
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
    .option("-s, --sort <field>", "Sort by: price, total-cost, rating, relevance, newest, delivery", "relevance")
    .option("--order <dir>", "Sort order: asc, desc", "desc")
    .option("-p, --page <page>", "Page number", parseInt, 1)
    .option("-n, --per-page <count>", "Results per page", parseInt, 10)

    // Delivery shortcuts
    .option("--express", "Only show items with 2-day or faster delivery")

    // Extended search
    .option("-e, --extended-search", "Enable extended search: query darkstores when no local results found")
    .option("--no-extended-search", "Disable automatic extended search when no local results found")
    .option("--extended-timeout <seconds>", "Extended search timeout in seconds (default: 30, max: 60)", parseInt)

    // Output
    .option("--json", "Output raw JSON")
    .option("--compact", "Compact one-line-per-result output")
    .option("--detailed", "Show full product details inline")

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

        // Resolve --ship-to: if provided, fetch the saved address to extract location fields
        let shipToCountry = opts.country || undefined;
        let shipToCity = opts.city || undefined;
        let shipToPostalCode = opts.postalCode || undefined;
        let shipToRegion = opts.region || undefined;
        let shipToLat = opts.lat || undefined;
        let shipToLng = opts.lng || undefined;

        if (opts.shipTo) {
          try {
            spinner.text = `Resolving address "${opts.shipTo}"...`;
            const addrRes = await api.get("/addresses");
            const addresses = addrRes.data.addresses || [];
            // Match by label (case-insensitive) or by ID
            const match = addresses.find((a: any) =>
              a.id === opts.shipTo ||
              (a.label && a.label.toLowerCase() === opts.shipTo.toLowerCase())
            );
            if (match) {
              if (!shipToCountry) shipToCountry = match.country;
              if (!shipToCity) shipToCity = match.city;
              if (!shipToPostalCode) shipToPostalCode = match.postalCode;
              if (!shipToRegion) shipToRegion = match.region;
            } else {
              spinner.warn(`Address "${opts.shipTo}" not found — ignoring --ship-to`);
              spinner.start(`Searching for "${query}"...`);
            }
          } catch {
            // Address lookup failed — continue without it
          }
          spinner.text = `Searching for "${query}"...`;
        }

        // Auto-resolve default address when no location flags are set
        // Uses the active agent's default address so searches target the right region
        if (!shipToCountry && !shipToCity && !shipToPostalCode && !opts.shipTo) {
          const agent = getActiveAgent();
          if (agent.defaultAddressId) {
            try {
              spinner.text = `Resolving default address...`;
              const addrRes = await api.get("/addresses");
              const addresses = addrRes.data.addresses || [];
              const defaultAddr = addresses.find((a: any) => a.id === agent.defaultAddressId);
              if (defaultAddr) {
                shipToCountry = defaultAddr.country;
                shipToCity = defaultAddr.city;
                shipToPostalCode = defaultAddr.postalCode;
                shipToRegion = defaultAddr.region || undefined;
                spinner.text = `Searching for "${query}" (delivering to: ${[shipToCity, shipToCountry].filter(Boolean).join(", ")})...`;
              }
            } catch {
              // Default address lookup failed — continue without it
            }
          }
        }

        // Extended search: clamp timeout to 5-60s, default 30s
        // Extended search is enabled by default (auto-triggers when no results found)
        // User can force it with -e, or disable it with --no-extended-search
        const forceExtended = opts.extendedSearch === true;
        const disableExtended = opts.extendedSearch === false;
        const extendedTimeout = opts.extendedTimeout
          ? Math.min(60, Math.max(5, opts.extendedTimeout))
          : 30;

        // --express shortcut → max 2-day delivery
        if (opts.express && !maxDeliveryDays) {
          maxDeliveryDays = 2;
        }

        // Build common search params (reused for both regular & extended calls)
        const searchParams: Record<string, any> = {
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
          // Delivery location
          shipTo: opts.shipTo || undefined,
          country: shipToCountry,
          city: shipToCity,
          postalCode: shipToPostalCode,
          region: shipToRegion,
          lat: shipToLat,
          lng: shipToLng,
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
          sort: opts.sort === "total-cost" ? "price" : opts.sort, // backend doesn't know total-cost yet
          order: opts.order,
          page: opts.page,
          pageSize: opts.perPage,
        };

        // If user forced extended search (-e), include it in the first call
        if (forceExtended) {
          searchParams.extendedSearch = true;
          searchParams.extendedTimeout = extendedTimeout;
        }

        const httpTimeout = forceExtended ? (extendedTimeout + 5) * 1000 : 15000;

        if (forceExtended) {
          const locationParts = [shipToCountry, shipToCity, shipToPostalCode].filter(Boolean);
          const locationLabel = locationParts.length > 0 ? locationParts.join(", ") : "global";
          spinner.text = `Searching for "${query}" (extended search: ${extendedTimeout}s timeout, deliver to: ${locationLabel})...`;
        }

        let res = await api.get("/products/search", {
          params: searchParams,
          timeout: httpTimeout,
        });

        // ── Auto-trigger extended search when no results found ──
        // If the regular search found nothing and extended search wasn't disabled,
        // automatically run the extended search to query all registered stores.
        const regularResult: SearchResult = res.data;
        const regularExtended = (res.data as any).extended;

        if (
          regularResult.products.length === 0 &&
          (!regularExtended || regularExtended.total === 0) &&
          !forceExtended &&
          !disableExtended
        ) {
          spinner.text = `No local results for "${query}". Starting extended search across all stores (${extendedTimeout}s timeout)...`;

          try {
            res = await api.get("/products/search", {
              params: {
                ...searchParams,
                extendedSearch: true,
                extendedTimeout,
              },
              timeout: (extendedTimeout + 5) * 1000,
            });
          } catch (extErr) {
            // If extended search fails (e.g. timeout), continue with empty results
            spinner.warn(`Extended search failed — showing regular results only.`);
          }
        }

        spinner.stop();

        const result: SearchResult = res.data;

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        // Check for extended search results
        const extended = (res.data as any).extended;
        const suggestAdvertise = (res.data as any).suggestAdvertise;
        const didExtendedSearch = forceExtended || (res.data as any).extended != null;

        if (result.products.length === 0 && (!extended || extended.total === 0)) {
          if (didExtendedSearch) {
            console.log(chalk.yellow(`\nNo results found for "${query}" (searched local catalog + all vendor stores).`));
          } else {
            console.log(chalk.yellow(`\nNo results found for "${query}".`));
          }

          if (!didExtendedSearch && disableExtended) {
            console.log(
              chalk.dim("\n  🔍 Tip: ") +
              chalk.white("Extended search was disabled. Enable it to query vendor stores in real-time:") +
              chalk.dim(`\n         Run: `) +
              chalk.cyan(`clishop search "${query}" --extended-search`) +
              chalk.dim("\n")
            );
          }

          console.log(
            chalk.dim("  💡 Tip: ") +
            chalk.white("Can't find what you need? Advertise your request and let vendors come to you!") +
            chalk.dim(`\n         Run: `) +
            chalk.cyan(`clishop advertise create`) +
            chalk.dim(` or `) +
            chalk.cyan(`clishop advertise quick "${query}"`) +
            chalk.dim("\n")
          );
          return;
        }

        // ── Fetch exchange rates for currency conversion ──────────
        // Determine user's preferred currency from their country
        const COUNTRY_CURRENCY: Record<string, string> = {
          US: "USD", CA: "CAD", GB: "GBP", AU: "AUD", NZ: "NZD",
          EU: "EUR", DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", NL: "EUR",
          BE: "EUR", AT: "EUR", IE: "EUR", PT: "EUR", FI: "EUR", GR: "EUR",
          LU: "EUR", SK: "EUR", SI: "EUR", EE: "EUR", LV: "EUR", LT: "EUR",
          SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK",
          CH: "CHF", HU: "HUF", RO: "RON", BG: "BGN", HR: "EUR",
          JP: "JPY", CN: "CNY", KR: "KRW", IN: "INR", SG: "SGD",
          TH: "THB", AE: "AED", IL: "ILS", TR: "TRY", ZA: "ZAR",
          BR: "BRL", MX: "MXN", AR: "ARS", CO: "COP", CL: "CLP",
        };
        const userCurrency = shipToCountry ? (COUNTRY_CURRENCY[shipToCountry.toUpperCase()] || "EUR") : "EUR";
        let exchangeRates: Record<string, number> = {};
        try {
          exchangeRates = await fetchRates(userCurrency);
        } catch {
          // Non-critical — conversion just won't show
        }

        // ── Merge all products for display ──────────────────────────
        // Combine local + extended into a unified list for rendering
        type DisplayProduct = {
          name: string; priceInCents: number; currency: string;
          freeShipping: boolean; shippingPriceInCents?: number | null; shippingDays?: number | null;
          vendor: string; storeVerified?: boolean; storeRating?: number | null;
          brand?: string | null; category?: string | null;
          rating?: number; reviewCount?: number;
          variant?: string | null; variantLabel?: string | null;
          description?: string | null; id?: string;
          isExtended?: boolean;
        };

        const allProducts: DisplayProduct[] = [];

        for (const p of result.products) {
          allProducts.push({
            ...p,
            vendor: p.vendor || p.storeName || "Unknown",
            isExtended: false,
          });
        }

        if (extended?.products) {
          for (const ep of extended.products) {
            allProducts.push({
              name: ep.name,
              priceInCents: ep.priceInCents,
              currency: ep.currency,
              freeShipping: ep.freeShipping,
              shippingPriceInCents: ep.shippingPriceInCents,
              shippingDays: ep.shippingDays,
              vendor: ep.storeName || "Unknown",
              storeRating: ep.storeRating ?? null,
              storeVerified: ep.storeVerified ?? false,
              brand: ep.brand,
              variant: ep.variant,
              variantLabel: ep.variantLabel,
              description: ep.description,
              id: ep.id,
              isExtended: true,
            });
          }
        }

        // Client-side sort for total-cost (backend doesn't support this directly)
        if (opts.sort === "total-cost") {
          allProducts.sort((a, b) => {
            const aCost = a.priceInCents + (a.freeShipping ? 0 : (a.shippingPriceInCents ?? 0));
            const bCost = b.priceInCents + (b.freeShipping ? 0 : (b.shippingPriceInCents ?? 0));
            return opts.order === "desc" ? bCost - aCost : aCost - bCost;
          });
        }

        if (allProducts.length === 0) {
          // Already handled above
        } else {
          // Header
          const totalCount = result.total + (extended?.total || 0);
          if (result.products.length > 0 && extended?.total > 0) {
            console.log(chalk.bold(`\nResults for "${query}" — ${result.total} local + ${extended.total} from stores\n`));
          } else if (extended?.total > 0) {
            console.log(chalk.bold(`\nExtended search for "${query}" — ${extended.total} result(s) from ${extended.storesResponded} store(s)\n`));
          } else {
            console.log(chalk.bold(`\nResults for "${query}" — ${result.total} found (page ${result.page})\n`));
          }

          // ── Price comparison summary ──
          if (allProducts.length >= 2) {
            const withTotal = allProducts.map((p) => ({
              ...p,
              totalCost: p.priceInCents + (p.freeShipping ? 0 : (p.shippingPriceInCents ?? 0)),
            }));
            const cheapest = withTotal.reduce((a, b) => a.totalCost < b.totalCost ? a : b);
            const fastest = allProducts.filter((p) => p.shippingDays != null).sort((a, b) => (a.shippingDays ?? 99) - (b.shippingDays ?? 99))[0];
            const bestRated = allProducts.filter((p) => (p.rating ?? 0) > 0).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0];

            const parts: string[] = [];
            parts.push(`${chalk.green("Best price:")} ${formatPrice(cheapest.totalCost, cheapest.currency)} at ${cheapest.vendor}`);
            if (fastest?.shippingDays != null) {
              parts.push(`${chalk.blue("Fastest:")} ${deliveryLabel(fastest.shippingDays)} at ${fastest.vendor}`);
            }
            if (bestRated?.rating) {
              parts.push(`${chalk.yellow("Top rated:")} ${scoreOutOf10(bestRated.rating)}/10 at ${bestRated.vendor}`);
            }
            console.log(`  ${chalk.dim("┌")} ${parts.join(chalk.dim(" │ "))}`);

            // Price range
            const prices = withTotal.map((p) => p.totalCost);
            const minP = Math.min(...prices);
            const maxP = Math.max(...prices);
            const avgP = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
            const curr = allProducts[0].currency;
            console.log(`  ${chalk.dim("└")} ${chalk.dim(`Price range: ${formatPrice(minP, curr)} – ${formatPrice(maxP, curr)} · Average: ${formatPrice(avgP, curr)}`)}`);
            console.log();
          }

          // ── Render each product ──
          for (let i = 0; i < allProducts.length; i++) {
            const p = allProducts[i];
            const num = i + 1;
            const itemPrice = p.priceInCents;
            const shippingPrice = p.freeShipping ? 0 : (p.shippingPriceInCents ?? 0);
            const totalCost = itemPrice + shippingPrice;

            // Badges
            const badges: string[] = [];
            if (i === 0) badges.push(chalk.bgGreen.black(" BEST MATCH "));
            // Best value = lowest total cost
            const allCosts = allProducts.map((x) => x.priceInCents + (x.freeShipping ? 0 : (x.shippingPriceInCents ?? 0)));
            if (totalCost === Math.min(...allCosts) && i !== 0) badges.push(chalk.bgYellow.black(" BEST VALUE "));

            // Currency conversion hint (only when product currency differs from user's)
            const converted = formatConverted(totalCost, p.currency, userCurrency, exchangeRates);

            // ── Compact mode ──
            if (opts.compact) {
              const priceStr = formatPrice(totalCost, p.currency) + converted;
              const store = p.vendor;
              const delivery = p.shippingDays != null ? `Arrives ${estimatedArrival(p.shippingDays)}` : "";
              console.log(
                `  ${chalk.dim(`[${num}]`)} ${chalk.cyan(p.name.length > 60 ? p.name.slice(0, 57) + "..." : p.name)}  ` +
                `${chalk.bold.white(priceStr)}  ${chalk.dim(store)}${delivery ? "  " + chalk.dim(delivery) : ""}` +
                (badges.length ? "  " + badges.join(" ") : "")
              );
              continue;
            }

            // ── Normal / Detailed mode ──
            // Number + Title + badges
            console.log(`  ${chalk.dim(`[${num}]`)} ${chalk.bold.cyan(p.name)}${badges.length ? "  " + badges.join(" ") : ""}`);

            // Price line with currency conversion
            let priceLine = `      ${chalk.bold.white(formatPrice(itemPrice, p.currency))}`;
            if (p.freeShipping) {
              priceLine += chalk.green("  Free Shipping");
            } else if (p.shippingPriceInCents != null && (p.shippingPriceInCents ?? 0) > 0) {
              priceLine += chalk.dim(` + ${formatPrice(shippingPrice, p.currency)} shipping`);
              priceLine += chalk.bold(` = ${formatPrice(totalCost, p.currency)}`);
            }
            // Currency conversion
            priceLine += converted;
            // Delivery date
            if (p.shippingDays != null) {
              priceLine += chalk.blue(`  Arrives ${estimatedArrival(p.shippingDays)}`);
            }
            console.log(priceLine);

            // Store & ratings
            const meta: string[] = [];
            const storeBadge = p.storeVerified ? chalk.green(" ✓") : "";
            const storeScore = p.storeRating != null
              ? chalk.dim(` ${p.storeRating.toFixed(1)}/10`)
              : chalk.dim(" (no store rating)");
            meta.push(`${p.vendor}${storeBadge}${storeScore}`);
            if (p.brand) meta.push(p.brand);
            if (p.rating && p.rating > 0) {
              meta.push(chalk.yellow(`${scoreOutOf10(p.rating)}/10`) + (p.reviewCount ? chalk.dim(` (${p.reviewCount})`) : ""));
            }
            if (p.isExtended) meta.push(chalk.magenta("via extended search"));
            console.log(`      ${chalk.dim(meta.join(" · "))}`);
            // Product ID
            if (p.id) console.log(`      ${chalk.dim(`ID: ${p.id}`)}`);;

            // Detailed mode: extra info
            if (opts.detailed) {
              if (p.category) console.log(`      ${chalk.dim(`Category: ${p.category}`)}`);
              if (p.variant || p.variantLabel) console.log(`      ${chalk.dim(`Variant: ${p.variant || p.variantLabel}`)}`);
              if (p.description) {
                console.log(`      ${chalk.dim(p.description.length > 200 ? p.description.slice(0, 200) + "..." : p.description)}`);
              }
            } else {
              // Normal mode: short description
              if (p.description) {
                console.log(`      ${chalk.dim(p.description.length > 80 ? p.description.slice(0, 80) + "..." : p.description)}`);
              }
            }
            console.log();
          }
        }

        // Show "info" tip when there are extended search results
        const hasExtendedProducts = extended?.products?.length > 0;
        if (hasExtendedProducts) {
          const sampleIds = extended.products.slice(0, 2).map((ep: any) => ep.id).join(" ");
          console.log(
            chalk.dim("  ℹ️  Tip: ") +
            chalk.white("Want more details? Request info from the store:") +
            chalk.dim(`\n         Run: `) +
            chalk.cyan(`clishop info ${sampleIds}`) +
            chalk.dim("\n")
          );
        }

        const totalPages = Math.ceil(result.total / result.pageSize);
        if (totalPages > 1) {
          console.log(chalk.dim(`  Page ${result.page} of ${totalPages}. Use --page to navigate.\n`));
        }

        // Show advertise tip on the last page of results
        const showAdvertiseTip = result.page >= totalPages || suggestAdvertise;
        if (showAdvertiseTip) {
          // If no extended search was used and it was explicitly disabled, suggest it
          if (!didExtendedSearch && disableExtended && result.products.length > 0) {
            console.log(
              chalk.dim("  🔍 Tip: ") +
              chalk.white("Want more results? Extended search was disabled. Enable it:") +
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

  // ── INFO — Request detailed product information from stores ────────
  // After a search returns results, users can request more info about
  // specific products. The backend proxies the request to the originating
  // store, which can return ANY information it wants (free-form).
  program
    .command("info <ids...>")
    .description("Request detailed information about search result products from their stores")
    .option("--json", "Output raw JSON")
    .action(async (ids: string[], opts) => {
      try {
        if (ids.length === 0) {
          console.error(chalk.red("\n✗ Please provide one or more product IDs."));
          console.log(chalk.dim("  Usage: clishop info <product-id> [product-id...]"));
          console.log(chalk.dim("  Example: clishop info ep_abc123 ep_def456\n"));
          process.exit(1);
        }

        if (ids.length > 20) {
          console.error(chalk.red("\n✗ Maximum 20 products per request."));
          process.exit(1);
        }

        const spinner = ora(`Requesting detailed info for ${ids.length} product(s)...`).start();
        const api = getApiClient();

        const res = await api.post("/products/info", {
          productIds: ids,
        }, {
          timeout: 30000,
        });

        spinner.stop();

        const { results, total } = res.data;

        if (opts.json) {
          console.log(JSON.stringify(res.data, null, 2));
          return;
        }

        if (!results || results.length === 0) {
          console.log(chalk.yellow("\nNo information returned for the requested products."));
          console.log(chalk.dim("  Make sure you're using product IDs from extended search results (ep_...)."));
          console.log(chalk.dim("  Product IDs are shown after each search result.\n"));
          return;
        }

        console.log(chalk.bold(`\nProduct Information — ${total} result(s)\n`));

        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const num = i + 1;

          // Header
          const storeBadge = result.storeName
            ? chalk.dim(` from ${result.storeName}`)
            : "";

          console.log(
            `  ${chalk.dim(`[${num}]`)} ${chalk.bold.cyan(result.info?.title || result.info?.product_id || result.productId)}${storeBadge}`
          );
          console.log(`      ${chalk.dim(`ID: ${result.productId}`)}`);

          if (result.error) {
            console.log(`      ${chalk.red(`Error: ${result.error}`)}`);
            console.log();
            continue;
          }

          // Product URL (if available)
          if (result.info?.product_url) {
            console.log(`      ${chalk.blue.underline(result.info.product_url)}`);
          }

          console.log();

          // Render all the free-form info from the store
          const info = result.info || {};

          // Price display (if available)
          if (info.price) {
            const priceStr = info.price.amount && info.price.currency
              ? formatPrice(Math.round(parseFloat(info.price.amount) * 100), info.price.currency)
              : `${info.price.amount || "N/A"}`;
            let priceLine = `      ${chalk.bold("Price:")} ${chalk.bold.white(priceStr)}`;

            if (info.list_price?.amount) {
              const listStr = formatPrice(
                Math.round(parseFloat(info.list_price.amount) * 100),
                info.list_price.currency || info.price.currency
              );
              priceLine += chalk.dim.strikethrough(` ${listStr}`);
            }
            console.log(priceLine);
          }

          // Pricing object (from darkstore format)
          if (info.pricing && !info.price) {
            const priceStr = info.pricing.amount && info.pricing.currency
              ? formatPrice(Math.round(parseFloat(info.pricing.amount) * 100), info.pricing.currency)
              : `${info.pricing.amount || "N/A"}`;
            let priceLine = `      ${chalk.bold("Price:")} ${chalk.bold.white(priceStr)}`;
            if (info.pricing.compare_at) {
              const listStr = formatPrice(
                Math.round(parseFloat(info.pricing.compare_at) * 100),
                info.pricing.currency
              );
              priceLine += chalk.dim.strikethrough(` ${listStr}`);
            }
            console.log(priceLine);
          }

          // Rating
          if (info.rating) {
            const ratingScore = typeof info.rating === "object"
              ? `${info.rating.score}/${info.rating.max}`
              : String(info.rating);
            let ratingLine = `      ${chalk.bold("Rating:")} ${chalk.yellow(ratingScore)}`;
            if (info.review_count) {
              ratingLine += chalk.dim(` (${info.review_count.toLocaleString()} reviews)`);
            }
            console.log(ratingLine);
          }

          // Brand
          if (info.brand) {
            console.log(`      ${chalk.bold("Brand:")} ${info.brand}`);
          }

          // Marketplace
          if (info.marketplace) {
            console.log(`      ${chalk.bold("Marketplace:")} ${info.marketplace.name || info.marketplace.domain || ""}`);
          }

          // Availability
          if (info.availability) {
            if (typeof info.availability === "string") {
              const isInStock = info.availability.toLowerCase().includes("in stock");
              console.log(`      ${chalk.bold("Availability:")} ${isInStock ? chalk.green(info.availability) : chalk.yellow(info.availability)}`);
            } else if (typeof info.availability === "object") {
              const status = info.availability.in_stock
                ? chalk.green("In Stock")
                : chalk.red("Out of Stock");
              let availLine = `      ${chalk.bold("Availability:")} ${status}`;
              if (info.availability.quantity != null) {
                availLine += chalk.dim(` (${info.availability.quantity} available)`);
              }
              console.log(availLine);
            }
          }

          // Prime
          if (info.prime) {
            console.log(`      ${chalk.bold("Prime:")} ${chalk.blue("✓ Prime eligible")}`);
          }

          // Shipping
          if (info.shipping && typeof info.shipping === "object") {
            const parts: string[] = [];
            if (info.shipping.free) parts.push(chalk.green("Free Shipping"));
            if (info.shipping.estimated_days) parts.push(`${info.shipping.estimated_days}-day delivery`);
            if (info.shipping.price?.amount) parts.push(`${info.shipping.price.amount} ${info.shipping.price.currency || ""}`);
            if (info.shipping.weight_kg) parts.push(`${info.shipping.weight_kg}kg`);
            if (parts.length > 0) {
              console.log(`      ${chalk.bold("Shipping:")} ${parts.join(" · ")}`);
            }
          }

          // Delivery info
          if (info.delivery_info) {
            console.log(`      ${chalk.bold("Delivery:")} ${info.delivery_info}`);
          }

          // Returns
          if (info.returns && typeof info.returns === "object") {
            const parts: string[] = [];
            if (info.returns.free) parts.push(chalk.green("Free Returns"));
            if (info.returns.window_days) parts.push(`${info.returns.window_days}-day window`);
            if (info.returns.note) parts.push(info.returns.note);
            if (parts.length > 0) {
              console.log(`      ${chalk.bold("Returns:")} ${parts.join(" · ")}`);
            }
          }

          // Checkout
          if (info.checkout && typeof info.checkout === "object") {
            const parts: string[] = [];
            if (info.checkout.mode) parts.push(info.checkout.mode);
            if (info.checkout.note) parts.push(info.checkout.note);
            if (parts.length > 0) {
              console.log(`      ${chalk.bold("Checkout:")} ${parts.join(" — ")}`);
            }
          }

          // Seller
          if (info.sold_by) {
            console.log(`      ${chalk.bold("Sold by:")} ${info.sold_by}`);
          }

          // Categories
          if (info.categories && Array.isArray(info.categories)) {
            console.log(`      ${chalk.bold("Category:")} ${info.categories.join(" > ")}`);
          }

          console.log();

          // Features / bullet points
          if (info.features && Array.isArray(info.features) && info.features.length > 0) {
            console.log(`      ${chalk.bold("Key Features:")}`);
            for (const feature of info.features) {
              // Wrap long features
              if (feature.length > 80) {
                const words = feature.split(/\s+/);
                let line = "";
                let first = true;
                for (const word of words) {
                  if (line.length + word.length + 1 > 76) {
                    if (first) {
                      console.log(`        ${chalk.dim("•")} ${line}`);
                      first = false;
                    } else {
                      console.log(`          ${line}`);
                    }
                    line = word;
                  } else {
                    line = line ? `${line} ${word}` : word;
                  }
                }
                if (line) {
                  if (first) {
                    console.log(`        ${chalk.dim("•")} ${line}`);
                  } else {
                    console.log(`          ${line}`);
                  }
                }
              } else {
                console.log(`        ${chalk.dim("•")} ${feature}`);
              }
            }
            console.log();
          }

          // Description
          if (info.description) {
            console.log(`      ${chalk.bold("Description:")}`);
            // Wrap long descriptions
            const words = info.description.split(/\s+/);
            let line = "";
            for (const word of words) {
              if (line.length + word.length + 1 > 76) {
                console.log(`        ${chalk.dim(line)}`);
                line = word;
              } else {
                line = line ? `${line} ${word}` : word;
              }
            }
            if (line) console.log(`        ${chalk.dim(line)}`);
            console.log();
          }

          // Specifications table
          if (info.specifications && typeof info.specifications === "object") {
            const specs = info.specifications;
            const keys = Object.keys(specs);
            if (keys.length > 0) {
              console.log(`      ${chalk.bold("Specifications:")}`);
              const maxKeyLen = Math.min(30, Math.max(...keys.map((k) => k.length)));
              for (const [key, value] of Object.entries(specs)) {
                const paddedKey = key.padEnd(maxKeyLen);
                console.log(`        ${chalk.dim(paddedKey)}  ${value}`);
              }
              console.log();
            }
          }

          // Images
          if (info.images && Array.isArray(info.images) && info.images.length > 0) {
            console.log(`      ${chalk.bold("Images:")} ${chalk.dim(`${info.images.length} available`)}`);
            // Show first 3 image URLs
            for (let j = 0; j < Math.min(3, info.images.length); j++) {
              console.log(`        ${chalk.dim(`[${j + 1}]`)} ${chalk.blue.underline(info.images[j])}`);
            }
            if (info.images.length > 3) {
              console.log(`        ${chalk.dim(`... and ${info.images.length - 3} more`)}`);
            }
            console.log();
          }

          // About section (A+ content)
          if (info.about && Array.isArray(info.about) && info.about.length > 0) {
            console.log(`      ${chalk.bold("About This Item:")}`);
            for (const section of info.about) {
              const words = section.split(/\s+/);
              let line = "";
              for (const word of words) {
                if (line.length + word.length + 1 > 76) {
                  console.log(`        ${chalk.dim(line)}`);
                  line = word;
                } else {
                  line = line ? `${line} ${word}` : word;
                }
              }
              if (line) console.log(`        ${chalk.dim(line)}`);
              console.log();
            }
          }

          // SEO info
          if (info.seo && typeof info.seo === "object" && Object.keys(info.seo).length > 0) {
            if (info.seo.title || info.seo.description) {
              console.log(`      ${chalk.bold("SEO:")}`);
              if (info.seo.title) console.log(`        Title: ${info.seo.title}`);
              if (info.seo.description) console.log(`        Description: ${info.seo.description}`);
              console.log();
            }
          }

          // Any remaining fields not handled above (free-form catch-all)
          const handledKeys = new Set([
            "product_id", "title", "price", "list_price", "pricing", "rating",
            "review_count", "brand", "marketplace", "availability", "prime",
            "shipping", "delivery_info", "returns", "checkout", "sold_by",
            "categories", "features", "description", "specifications",
            "images", "about", "seo", "product_url", "asin", "error",
            "available", "note", "updated_at", "sku", "model", "gtin",
            "variant", "tags",
          ]);

          const extraKeys = Object.keys(info).filter((k) => !handledKeys.has(k));
          if (extraKeys.length > 0) {
            console.log(`      ${chalk.bold("Additional Information:")}`);
            for (const key of extraKeys) {
              const value = info[key];
              if (value == null) continue;
              const label = key.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

              if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
                console.log(`        ${chalk.dim(label + ":")} ${value}`);
              } else if (Array.isArray(value)) {
                console.log(`        ${chalk.dim(label + ":")}`);
                renderFreeFormInfo(value, 10);
              } else if (typeof value === "object") {
                console.log(`        ${chalk.dim(label + ":")}`);
                renderFreeFormInfo(value, 10);
              }
            }
            console.log();
          }

          // Tags
          if (info.tags && Array.isArray(info.tags) && info.tags.length > 0) {
            console.log(`      ${chalk.bold("Tags:")} ${info.tags.map((t: string) => chalk.dim(`#${t}`)).join(" ")}`);
            console.log();
          }

          // Note from store
          if (info.note) {
            console.log(`      ${chalk.dim(`ℹ ${info.note}`)}`);
            console.log();
          }

          // Separator between products
          if (i < results.length - 1) {
            console.log(chalk.dim("  " + "─".repeat(60)));
            console.log();
          }
        }
      } catch (error) {
        handleApiError(error);
      }
    });
}
