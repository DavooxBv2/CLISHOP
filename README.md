<p align="center">
  <h1 align="center">CLISHOP</h1>
  <p align="center">
    <strong>An open-source CLI for AI agents (and humans) to search, compare, and buy products — all from the terminal.</strong>
  </p>
  <p align="center">
    <a href="#quick-start">Quick Start</a> •
    <a href="#for-ai-agents">For AI Agents</a> •
    <a href="#command-reference">Commands</a> •
    <a href="#concepts">Concepts</a>
  </p>
</p>

---

CLISHOP lets AI agents and scripts autonomously search for products across multiple stores, compare prices, and place orders — entirely through a command-line interface. No browser. No GUI. Just `stdin`/`stdout`.

Built for the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) era, where AI agents need tool-use interfaces to interact with the real world.

## Highlights

- **Multi-store search** — Query products across many vendors in one command
- **Extended search** — Real-time queries to vendor stores when local catalog doesn't have what you need
- **Agent profiles** — Safety guardrails: spending caps, category restrictions, confirmation prompts
- **Non-interactive mode** — Every command works without prompts (flags + `--json` output)
- **Advertise requests** — Can't find it? Publish what you need and let vendors bid
- **Secure payments** — Card details never touch the CLI; payment setup uses secure browser links
- **OS keychain auth** — Tokens stored in the system keychain, not config files

## Quick Start

### Install from npm

```bash
npm install -g @clishop/cli
```

### Or build from source

```bash
git clone https://github.com/DavooxBv2/CLISHOP.git
cd CLISHOP
npm install
npm run build
npm link
```

### First run

```bash
clishop
```

Running `clishop` with no arguments triggers a guided setup wizard:

1. Create an account or log in
2. Configure an agent (a `default` agent is created automatically)
3. Add a shipping address
4. Link a payment method (opens a secure browser link)
5. Run your first search

Re-run setup anytime with `clishop setup`.

**Requirements:** Node.js ≥ 18

## For AI Agents

CLISHOP is designed to be called by AI agents, scripts, and automation pipelines. Every command supports non-interactive flags and machine-readable JSON output.

### Authenticate

```bash
clishop login --email <email> --password <password>
```

### Search → Buy flow

```bash
# Search for products (JSON output for parsing)
clishop search "wireless headphones" --json

# View product details
clishop product prod_a8k3m2x9p4w1 --json

# Buy it (skip confirmation prompt)
clishop buy prod_a8k3m2x9p4w1 -y

# Check order status
clishop order list --json
```

### Use agent safety profiles

Agents act as guardrails. Create a `shopping-bot` agent with a $50 spending cap:

```bash
clishop agent create shopping-bot --max-amount 50 --no-confirm
```

Then use it:

```bash
clishop search "USB-C cable" --agent shopping-bot --json
clishop buy prod_xxx --agent shopping-bot -y
```

### JSON output everywhere

Append `--json` to any read command for structured output:

```bash
clishop search "laptop stand" --json
clishop order list --json
clishop order show ordr_xxx --json
clishop product prod_xxx --json
clishop review list --json
clishop store list --json
clishop status --json
clishop advertise list --json
clishop support list --json
clishop feedback list --json
```

### Exit codes

| Code | Meaning |
|------|---------|
| `0`  | Success |
| `1`  | Error (auth failure, not found, validation, API error) |

Errors are printed to `stderr`. Successful JSON output goes to `stdout`.

## Concepts

### Agents

Agents are **safety profiles** that control how the CLI behaves when placing orders. Every account has a `default` agent.

| Setting | Description |
|---------|-------------|
| `maxOrderAmount` | Spending cap per order (in dollars) |
| `requireConfirmation` | Prompt before placing an order |
| `allowedCategories` | Whitelist of product categories |
| `blockedCategories` | Blacklist of product categories |
| `defaultAddressId` | Default shipping address |
| `defaultPaymentMethodId` | Default payment method |

Use `--agent <name>` on any command to override the active agent for that invocation.

### Stores & Extended Search

Products live in stores (vendors). When a regular search doesn't find what you need, CLISHOP can automatically query vendor stores in real-time via **extended search**. This happens automatically when no local results are found, or can be forced with `--extended-search`.

After an extended search, use `clishop info <id>` to request detailed product information directly from the vendor's store.

### Advertised Requests

Can't find what you're looking for? Publish a request describing what you need, and vendors can submit bids:

```bash
# Interactive
clishop advertise create

# Non-interactive (for agents)
clishop advertise quick "Custom engraved laptop stand" \
  --brand "StandCo" \
  --bid-price 89.99 \
  --quantity 1 \
  --speed 5 \
  --free-returns
```

Vendors see your request and can submit bids with pricing, delivery estimates, and return policies. You (or your agent) can then accept or reject bids.

### IDs

All entities use short, prefixed IDs:

| Prefix | Entity | Example |
|--------|--------|---------|
| `prod_` | Product | `prod_a8k3m2x9p4w1` |
| `ordr_` | Order | `ordr_b7n4q1y8t3v6` |
| `addr_` | Address | `addr_c9j2w5r8m1k4` |
| `pymt_` | Payment method | `pymt_d3f8k1n7p2q9` |
| `stor_` | Store | `stor_e4g7j2m8r5t1` |
| `user_` | User | `user_f5h8k3n9s6v2` |
| `agnt_` | Agent | `agnt_g6j9l4p1t7w3` |
| `chkt_` | Checkout | `chkt_h7k1m5q2u8x4` |
| `fdbk_` | Feedback | `fdbk_i8l2n6r3v9y5` |

### Money

All prices are stored and returned in **cents** (integer). The CLI converts to dollars for display. Example: `7999` → `$79.99`.

## Command Reference

### Authentication

```bash
clishop register                           # Interactive account creation
clishop login                              # Interactive login
clishop login -e user@example.com -p pass  # Non-interactive login
clishop logout                             # Clear local tokens
clishop whoami                             # Print current user info
```

### Search & Browse

```bash
clishop search <query>                     # Search for products
clishop search <query> --json              # JSON output
clishop search <query> -c Electronics      # Filter by category
clishop search <query> --brand Sony        # Filter by brand
clishop search <query> --store AudioTech   # Filter by store
clishop search <query> --min-price 1000    # Min price (cents)
clishop search <query> --max-price 10000   # Max price (cents)
clishop search <query> --min-rating 4      # Min rating (1-5)
clishop search <query> --in-stock          # Only in-stock items
clishop search <query> --free-shipping     # Free shipping only
clishop search <query> --free-returns      # Free returns only
clishop search <query> --express           # 2-day or faster delivery
clishop search <query> --ship-to "Home"    # Use saved address for location
clishop search <query> --country US        # Delivery country
clishop search <query> --deliver-by 2026-03-01  # Need it by date
clishop search <query> --trusted-only      # Verified stores only
clishop search <query> -e                  # Force extended search
clishop search <query> -i                  # Interactive: select products for more info
clishop search <query> --compact           # One-line-per-result output
clishop search <query> --detailed          # Full details inline
clishop search <query> -s price --order asc  # Sort by price ascending
clishop search <query> -p 2 -n 10         # Page 2, 10 results per page

clishop product <productId>                # View product details
clishop product <productId> --json         # JSON output

clishop info <id> [id...]                  # Get detailed info from vendor stores
clishop info <id> --json                   # JSON output
```

**Sort options:** `price`, `total-cost`, `rating`, `relevance`, `newest`, `delivery`

### Ordering

```bash
clishop buy <productId>                    # Quick-buy with defaults
clishop buy <productId> -q 3              # Buy quantity 3
clishop buy <productId> --address <id>    # Specify shipping address
clishop buy <productId> --payment <id>    # Specify payment method
clishop buy <productId> -y                # Skip confirmation prompt
clishop buy <productId> --agent work      # Use a specific agent

clishop order list                         # List your orders
clishop order list --status pending        # Filter by status
clishop order list --json                  # JSON output
clishop order show <orderId>               # Order details + tracking
clishop order cancel <orderId>             # Cancel an order
```

**Order statuses:** `pending`, `confirmed`, `processing`, `shipped`, `delivered`, `cancelled`

### Agents

```bash
clishop agent list                         # List all agents
clishop agent show                         # Show active agent
clishop agent show <name>                  # Show specific agent
clishop agent create <name>                # Interactive creation
clishop agent create <name> --max-amount 100 --no-confirm  # Non-interactive
clishop agent use <name>                   # Switch active agent
clishop agent update <name>                # Update agent settings
clishop agent delete <name>                # Delete (can't delete "default")
```

### Addresses

```bash
clishop address list                       # List addresses
clishop address add                        # Interactive: add address
clishop address remove <id>                # Remove address
clishop address set-default <id>           # Set default for active agent
```

### Payment Methods

```bash
clishop payment list                       # List payment methods
clishop payment add                        # Get secure setup link
clishop payment remove <id>                # Remove payment method
clishop payment set-default <id>           # Set default for active agent
```

### Reviews

```bash
clishop review add <productId>             # Write a review
clishop review list                        # List your reviews
clishop review list --json                 # JSON output
clishop review delete <reviewId>           # Delete a review
```

### Stores

```bash
clishop store list                         # List available stores
clishop store list --verified              # Only verified stores
clishop store list --min-rating 4          # Min store rating
clishop store info <store>                 # Store details
clishop store catalog <store>              # Browse store products
clishop store catalog <store> -q "cable"   # Search within store
```

### Advertised Requests

```bash
clishop advertise create                   # Interactive: publish a request
clishop advertise quick <title>            # Non-interactive: publish a request
clishop advertise list                     # List your requests
clishop advertise show <id>                # View request + bids
clishop advertise accept <id> <bidId>      # Accept a vendor bid
clishop advertise reject <id> <bidId>      # Reject a vendor bid
clishop advertise cancel <id>              # Cancel a request
```

### Support Tickets

```bash
clishop support create <orderId>           # Create a support ticket
clishop support list                       # List your tickets
clishop support show <ticketId>            # View ticket + messages
clishop support reply <ticketId>           # Reply to a ticket
clishop support close <ticketId>           # Close a ticket
```

### Bug Reports & Suggestions

Found a bug? Have an idea to make CLISHOP better? Report it directly from the terminal:

```bash
# Report a bug (interactive — prompts for details)
clishop feedback bug

# Report a bug (non-interactive — for agents/scripts)
clishop feedback bug \
  --title "Search crashes on empty query" \
  --description "Running search with no query causes unhandled error" \
  --steps "1. Run: clishop search \"\"\n2. Observe crash" \
  --actual "CLI exits with stack trace" \
  --expected "Should show a friendly 'query required' error"

# Submit a suggestion (interactive)
clishop feedback suggest

# Submit a suggestion (non-interactive)
clishop feedback suggest \
  --title "Add wishlist feature" \
  --description "Would be great to save products to a wishlist for later"

# List your feedback
clishop feedback list                      # All feedback
clishop feedback list --type bug           # Only bug reports
clishop feedback list --type suggestion    # Only suggestions
clishop feedback list --status fixed       # Filter by status
clishop feedback list --json               # JSON output

# View a specific report
clishop feedback show <id>                 # View details + status
clishop feedback show <id> --json          # JSON output
```

**Bug report fields:**
| Field | Description |
|-------|-------------|
| `title` | Short summary of the bug |
| `description` | General description |
| `steps` | How to trigger the bug (steps to reproduce) |
| `actual` | What actually happens |
| `expected` | What you expected to happen |

**Feedback statuses:** `open`, `acknowledged`, `in_progress`, `fixed`, `wont_fix`, `closed`

The CLISHOP team reviews all feedback and updates the status. You'll see admin notes when you check your feedback with `clishop feedback show <id>`.

### Account & Config

```bash
clishop status                             # Full account overview
clishop status --json                      # JSON output

clishop config show                        # Show current config
clishop config set-output json             # Set output format (human | json)
clishop config reset                       # Reset config to defaults
clishop config path                        # Print config file path

clishop setup                              # Re-run setup wizard
```

## Configuration

| Data | Location |
|------|----------|
| CLI config (agents, preferences) | `~/.config/clishop/config.json` (or OS equivalent) |
| Auth tokens | OS keychain (via `keytar`) |

Find the config path:

```bash
clishop config path
```

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `CLISHOP_API_URL` | Override the backend API URL | `https://clishop-backend.vercel.app/api` |

## Architecture

```
┌─────────────────────────────┐
│  AI Agent / Script / Human  │
└──────────────┬──────────────┘
               │
       ┌───────▼───────┐
       │  CLISHOP CLI   │  ← this repo
       │  (Node.js)     │
       └───────┬───────┘
               │ HTTPS
       ┌───────▼───────┐
       │  CLISHOP API   │  ← clishop-backend
       │  (Vercel)      │
       └───────┬───────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
 Store A    Store B    Store C   ← vendor stores
```

The CLI is a stateless client. It doesn't own any database or vendor integrations — all data flows through the backend API.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript (ESM) |
| CLI framework | [Commander.js](https://github.com/tj/commander.js) |
| HTTP client | [Axios](https://github.com/axios/axios) |
| Prompts | [Inquirer.js](https://github.com/SBoudrias/Inquirer.js) |
| Config storage | [Conf](https://github.com/sindresorhus/conf) |
| Keychain | [Keytar](https://github.com/nicktrav/node-keytar) |
| Spinners | [Ora](https://github.com/sindresorhus/ora) |
| Colors | [Chalk](https://github.com/chalk/chalk) |
| Bundler | [tsup](https://github.com/egoist/tsup) |

## Development

```bash
git clone https://github.com/DavooxBv2/CLISHOP.git
cd CLISHOP
npm install

# Run in dev mode (no build step)
npm run dev -- search "headphones"

# Build
npm run build

# Type-check
npm run lint
```

## Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes (`git commit -m 'feat: add my feature'`)
4. Push to the branch (`git push origin feat/my-feature`)
5. Open a Pull Request

## License

[ISC](LICENSE)
