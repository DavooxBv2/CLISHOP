import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { getApiClient, handleApiError } from "../api.js";

export interface Review {
  id: string;
  productId: string;
  productName: string;
  rating: number;
  title: string;
  body: string;
  createdAt: string;
}

function renderStars(rating: number): string {
  return chalk.yellow("★".repeat(rating) + "☆".repeat(5 - rating));
}

export function registerReviewCommands(program: Command): void {
  const review = program
    .command("review")
    .description("Manage product reviews");

  // ── ADD REVIEW ─────────────────────────────────────────────────────
  review
    .command("add <productId>")
    .description("Write a review for a product")
    .action(async (productId: string) => {
      try {
        const answers = await inquirer.prompt([
          {
            type: "list",
            name: "rating",
            message: "Rating:",
            choices: [
              { name: "★★★★★  Excellent", value: 5 },
              { name: "★★★★☆  Good", value: 4 },
              { name: "★★★☆☆  Average", value: 3 },
              { name: "★★☆☆☆  Below Average", value: 2 },
              { name: "★☆☆☆☆  Poor", value: 1 },
            ],
          },
          { type: "input", name: "title", message: "Review title:" },
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
          title: answers.title,
          body: answers.body,
        });
        spinner.succeed(chalk.green("Review submitted!"));

        console.log(`\n  ${renderStars(answers.rating)}  ${chalk.bold(answers.title)}`);
        console.log(chalk.dim(`  Review ID: ${res.data.review.id}\n`));
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── LIST MY REVIEWS ────────────────────────────────────────────────
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

        const reviews: Review[] = res.data.reviews;

        if (opts.json) {
          console.log(JSON.stringify(reviews, null, 2));
          return;
        }

        if (reviews.length === 0) {
          console.log(chalk.yellow("\nYou haven't written any reviews yet.\n"));
          return;
        }

        console.log(chalk.bold("\nYour Reviews:\n"));
        for (const r of reviews) {
          const date = new Date(r.createdAt).toLocaleDateString();
          console.log(`  ${renderStars(r.rating)}  ${chalk.bold(r.title)}`);
          console.log(`  ${chalk.dim(`on ${r.productName}`)}  ${chalk.dim(date)}`);
          console.log(`  ${r.body.length > 150 ? r.body.slice(0, 150) + "..." : r.body}`);
          console.log();
        }
      } catch (error) {
        handleApiError(error);
      }
    });

  // ── DELETE REVIEW ──────────────────────────────────────────────────
  review
    .command("delete <reviewId>")
    .alias("rm")
    .description("Delete one of your reviews")
    .action(async (reviewId: string) => {
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
        await api.delete(`/reviews/${reviewId}`);
        spinner.succeed(chalk.green("Review deleted."));
      } catch (error) {
        handleApiError(error);
      }
    });
}
