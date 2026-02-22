import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { getApiClient, handleApiError } from "../api.js";

export interface ProductReview {
  id: string;
  productId: string;
  productName: string;
  orderId?: string;
  rating: number;
  title: string;
  body: string;
  createdAt: string;
}

export interface StoreReview {
  id: string;
  storeId: string;
  storeName: string;
  orderId?: string;
  rating: number;
  title: string;
  body: string;
  createdAt: string;
}

function renderStars(rating: number): string {
  const filled = Math.round(rating);
  const empty = 10 - filled;
  return chalk.yellow("★".repeat(filled) + "☆".repeat(empty));
}

function renderRating(rating: number): string {
  if (rating === 0) return chalk.dim("No ratings yet");
  const color = rating >= 8 ? chalk.green : rating >= 5 ? chalk.yellow : chalk.red;
  return `${renderStars(rating)}  ${color(`${rating.toFixed(1)}/10`)}`;
}

const RATING_CHOICES = [
  { name: "10 ★★★★★★★★★★  Perfect", value: 10 },
  { name: " 9 ★★★★★★★★★☆  Excellent", value: 9 },
  { name: " 8 ★★★★★★★★☆☆  Great", value: 8 },
  { name: " 7 ★★★★★★★☆☆☆  Good", value: 7 },
  { name: " 6 ★★★★★★☆☆☆☆  Above Average", value: 6 },
  { name: " 5 ★★★★★☆☆☆☆☆  Average", value: 5 },
  { name: " 4 ★★★★☆☆☆☆☆☆  Below Average", value: 4 },
  { name: " 3 ★★★☆☆☆☆☆☆☆  Poor", value: 3 },
  { name: " 2 ★★☆☆☆☆☆☆☆☆  Bad", value: 2 },
  { name: " 1 ★☆☆☆☆☆☆☆☆☆  Terrible", value: 1 },
];

export function registerReviewCommands(program: Command): void {
  const review = program
    .command("review")
    .description("Manage product & store reviews");

  // ── REVIEW AN ORDER (items + store) ─────────────────────────────────
  review
    .command("order <orderId>")
    .description("Review items and store from an order")
    .action(async (orderId: string) => {
      try {
        const api = getApiClient();

        // Fetch reviewable items
        const spinner = ora("Fetching order details...").start();
        let reviewable: any;
        try {
          const res = await api.get(`/orders/${orderId}/reviewable`);
          reviewable = res.data;
        } catch (err: any) {
          spinner.stop();
          handleApiError(err);
          return;
        }
        spinner.stop();

        const unreviewedItems = reviewable.items.filter((i: any) => !i.alreadyReviewed);
        const storeAlreadyReviewed = reviewable.store.alreadyReviewed;

        if (unreviewedItems.length === 0 && storeAlreadyReviewed) {
          console.log(chalk.yellow("\nYou've already reviewed everything in this order.\n"));
          return;
        }

        console.log(chalk.bold(`\n  Review Order ${chalk.cyan(orderId)}`));
        console.log(chalk.dim(`  Store: ${reviewable.store.name}\n`));

        const itemReviews: any[] = [];
        let storeReview: any = undefined;

        // ── Review each unreviewed product ──
        for (const item of unreviewedItems) {
          console.log(chalk.bold(`  Product: ${item.productName}`));

          const { wantReview } = await inquirer.prompt([
            {
              type: "confirm",
              name: "wantReview",
              message: `Review "${item.productName}"?`,
              default: true,
            },
          ]);

          if (!wantReview) continue;

          const answers = await inquirer.prompt([
            {
              type: "select",
              name: "rating",
              message: "Rating (1-10):",
              choices: RATING_CHOICES,
            },
            {
              type: "input",
              name: "title",
              message: "Review title:",
              validate: (v: string) => v.trim().length > 0 || "Title is required",
            },
            {
              type: "input",
              name: "body",
              message: "Review body:",
              validate: (v: string) => v.trim().length > 0 || "Body is required",
            },
          ]);

          itemReviews.push({
            productId: item.productId,
            rating: answers.rating,
            title: answers.title.trim(),
            body: answers.body.trim(),
          });

          console.log(chalk.dim(`  ✓ ${item.productName}: ${answers.rating}/10\n`));
        }

        // ── Review the store ──
        if (!storeAlreadyReviewed) {
          console.log(chalk.bold(`  Store: ${reviewable.store.name}`));

          const { wantStoreReview } = await inquirer.prompt([
            {
              type: "confirm",
              name: "wantStoreReview",
              message: `Review store "${reviewable.store.name}"?`,
              default: true,
            },
          ]);

          if (wantStoreReview) {
            const storeAnswers = await inquirer.prompt([
              {
                type: "select",
                name: "rating",
                message: "Store rating (1-10):",
                choices: RATING_CHOICES,
              },
              {
                type: "input",
                name: "title",
                message: "Store review title:",
                validate: (v: string) => v.trim().length > 0 || "Title is required",
              },
              {
                type: "input",
                name: "body",
                message: "Store review body:",
                validate: (v: string) => v.trim().length > 0 || "Body is required",
              },
            ]);

            storeReview = {
              rating: storeAnswers.rating,
              title: storeAnswers.title.trim(),
              body: storeAnswers.body.trim(),
            };
          }
        }

        if (itemReviews.length === 0 && !storeReview) {
          console.log(chalk.yellow("\nNo reviews submitted.\n"));
          return;
        }

        // Submit all reviews
        const submitSpinner = ora("Submitting reviews...").start();
        try {
          const res = await api.post(`/orders/${orderId}/reviews`, {
            itemReviews,
            storeReview,
          });
          submitSpinner.succeed(chalk.green("Reviews submitted!"));

          const data = res.data;
          if (data.productReviews?.length > 0) {
            console.log(chalk.bold("\n  Product Reviews:"));
            for (const r of data.productReviews) {
              console.log(`    ${renderStars(r.rating)}  ${chalk.bold(r.title)}`);
            }
          }
          if (data.storeReview && !data.storeReview.skipped) {
            console.log(chalk.bold("\n  Store Review:"));
            console.log(`    ${renderStars(data.storeReview.rating)}  ${chalk.bold(data.storeReview.title)}`);
          }
          console.log();
        } catch (err) {
          submitSpinner.stop();
          handleApiError(err);
        }
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── ADD PRODUCT REVIEW ──────────────────────────────────────────────
  review
    .command("add <productId>")
    .description("Write a review for a product")
    .option("--order <orderId>", "Associate with an order")
    .action(async (productId: string, opts) => {
      try {
        const answers = await inquirer.prompt([
          {
            type: "select",
            name: "rating",
            message: "Rating (1-10):",
            choices: RATING_CHOICES,
          },
          { type: "input", name: "title", message: "Review title:", validate: (v: string) => v.trim().length > 0 || "Required" },
          {
            type: "editor",
            name: "body",
            message: "Review body (opens your editor):",
          },
        ]);

        const spinner = ora("Submitting review...").start();
        const api = getApiClient();
        const res = await api.post(`/products/${productId}/reviews`, {
          rating: answers.rating,
          title: answers.title.trim(),
          body: answers.body.trim(),
          orderId: opts.order || undefined,
        });
        spinner.succeed(chalk.green("Review submitted!"));

        console.log(`\n  ${renderRating(answers.rating)}  ${chalk.bold(answers.title)}`);
        console.log(chalk.dim(`  Review ID: ${res.data.review.id}\n`));
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── ADD STORE REVIEW ────────────────────────────────────────────────
  review
    .command("store <storeId>")
    .description("Write a review for a store")
    .option("--order <orderId>", "Associate with an order")
    .action(async (storeId: string, opts) => {
      try {
        const answers = await inquirer.prompt([
          {
            type: "select",
            name: "rating",
            message: "Store rating (1-10):",
            choices: RATING_CHOICES,
          },
          { type: "input", name: "title", message: "Review title:", validate: (v: string) => v.trim().length > 0 || "Required" },
          {
            type: "editor",
            name: "body",
            message: "Review body (opens your editor):",
          },
        ]);

        const spinner = ora("Submitting store review...").start();
        const api = getApiClient();
        const res = await api.post(`/stores/${storeId}/reviews`, {
          rating: answers.rating,
          title: answers.title.trim(),
          body: answers.body.trim(),
          orderId: opts.order || undefined,
        });
        spinner.succeed(chalk.green("Store review submitted!"));

        console.log(`\n  ${renderRating(answers.rating)}  ${chalk.bold(answers.title)}`);
        console.log(chalk.dim(`  Review ID: ${res.data.review.id}\n`));
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── LIST MY REVIEWS ─────────────────────────────────────────────────
  review
    .command("list")
    .alias("ls")
    .description("List your reviews")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const spinner = ora("Fetching reviews...").start();
        const api = getApiClient();
        const res = await api.get("/reviews/mine");
        spinner.stop();

        const { productReviews, storeReviews } = res.data;

        if (opts.json) {
          console.log(JSON.stringify(res.data, null, 2));
          return;
        }

        if (productReviews.length === 0 && storeReviews.length === 0) {
          console.log(chalk.yellow("\nYou haven't written any reviews yet.\n"));
          return;
        }

        if (productReviews.length > 0) {
          console.log(chalk.bold("\nProduct Reviews:\n"));
          for (const r of productReviews as ProductReview[]) {
            const date = new Date(r.createdAt).toLocaleDateString();
            console.log(`  ${renderStars(r.rating)}  ${chalk.bold(r.title)}`);
            console.log(`  ${chalk.dim(`on ${r.productName}`)}  ${chalk.dim(date)}`);
            console.log(`  ${r.body.length > 150 ? r.body.slice(0, 150) + "..." : r.body}`);
            console.log();
          }
        }

        if (storeReviews.length > 0) {
          console.log(chalk.bold("Store Reviews:\n"));
          for (const r of storeReviews as StoreReview[]) {
            const date = new Date(r.createdAt).toLocaleDateString();
            console.log(`  ${renderStars(r.rating)}  ${chalk.bold(r.title)}`);
            console.log(`  ${chalk.dim(`store: ${r.storeName}`)}  ${chalk.dim(date)}`);
            console.log(`  ${r.body.length > 150 ? r.body.slice(0, 150) + "..." : r.body}`);
            console.log();
          }
        }
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── VIEW PRODUCT RATING ─────────────────────────────────────────────
  review
    .command("rating <id>")
    .description("View rating details for a product or store")
    .option("--store", "View store rating instead of product")
    .action(async (id: string, opts) => {
      try {
        const spinner = ora("Fetching rating...").start();
        const api = getApiClient();
        const endpoint = opts.store ? `/stores/${id}/rating` : `/products/${id}/rating`;
        const res = await api.get(endpoint);
        spinner.stop();

        const { rating } = res.data;
        const entity = opts.store ? res.data.store : res.data.product;

        console.log();
        console.log(chalk.bold(`  ${entity.name}`));
        console.log(`  ${renderRating(rating.displayRating)}`);
        console.log();
        console.log(`  Reviews:         ${rating.reviewCount}`);
        console.log(`  Total Orders:    ${rating.totalOrders}`);
        console.log(`  Bayesian Avg:    ${rating.bayesianAverage.toFixed(2)}`);
        console.log(`  Effective Cap:   ${rating.effectiveCeiling.toFixed(1)}`);
        if (rating.isCapped) {
          console.log(chalk.yellow(`  ⚠ Rating is capped — needs more orders to unlock higher rating`));
          if (rating.totalOrders < 100) {
            console.log(chalk.dim(`    ${100 - rating.totalOrders} more orders needed to unlock 8.0+ rating`));
          } else if (rating.totalOrders < 1000) {
            console.log(chalk.dim(`    ${1000 - rating.totalOrders} more orders needed to unlock 9.0+ rating`));
          }
        }
        console.log();
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── DELETE REVIEW ───────────────────────────────────────────────────
  review
    .command("delete <reviewId>")
    .alias("rm")
    .description("Delete one of your reviews")
    .option("--store", "Delete a store review")
    .action(async (reviewId: string, opts) => {
      try {
        const { confirm } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirm",
            message: `Delete review ${reviewId}?`,
            default: false,
          },
        ]);
        if (!confirm) return;

        const spinner = ora("Deleting review...").start();
        const api = getApiClient();
        const endpoint = opts.store ? `/store-reviews/${reviewId}` : `/reviews/${reviewId}`;
        await api.delete(endpoint);
        spinner.succeed(chalk.green("Review deleted."));
      } catch (error) {
        handleApiError(error);
      }
    });
}
