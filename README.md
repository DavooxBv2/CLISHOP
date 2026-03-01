<p align="center">
  <h1 align="center">CLISHOP</h1>
  <p align="center">
    <strong>Order anything from your terminal. Built for AI agents and humans.</strong>
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/clishop"><img alt="npm" src="https://img.shields.io/npm/v/clishop?style=flat-square&color=cb3837" /></a>
    <a href="https://clishop.ai"><img alt="Website" src="https://img.shields.io/badge/website-clishop.ai-blue?style=flat-square" /></a>
    <a href="https://discord.gg/vwXMbzD4bx"><img alt="Discord" src="https://img.shields.io/badge/Discord-Join-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  </p>
  <p align="center">
    <a href="#install">Install</a> •
    <a href="#quick-start">Quick Start</a> •
    <a href="#mcp-server">MCP Server</a> •
    <a href="#for-ai-agents">For AI Agents</a> •
    <a href="#commands">Commands</a>
  </p>
</p>

---

CLISHOP is an open-source CLI that lets AI agents and humans search for products across multiple stores, compare prices, and place real orders — all from the terminal. No browser. No GUI. Just `stdin`/`stdout`.

```bash
npm install -g clishop
clishop setup
```

## Works with

<p>
  <img alt="VS Code" src="https://img.shields.io/badge/VS%20Code-Copilot-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white" />
  <img alt="Claude" src="https://img.shields.io/badge/Claude-Supported-7C3AED?style=for-the-badge&logo=anthropic&logoColor=white" />
  <img alt="GPT" src="https://img.shields.io/badge/GPT-Supported-10A37F?style=for-the-badge&logo=openai&logoColor=white" />
  <img alt="Gemini" src="https://img.shields.io/badge/Gemini-Supported-4285F4?style=for-the-badge&logo=googlegemini&logoColor=white" />
</p>
<p>
  <img alt="Cursor" src="https://img.shields.io/badge/Cursor-Supported-000000?style=for-the-badge&logo=cursor&logoColor=white" />
  <img alt="Windsurf" src="https://img.shields.io/badge/Windsurf-Supported-0EA5E9?style=for-the-badge" />
  <img alt="AutoGPT" src="https://img.shields.io/badge/AutoGPT-Agent-111827?style=for-the-badge&logo=github&logoColor=white" />
  <img alt="LangGraph" src="https://img.shields.io/badge/LangGraph-Agent-16A34A?style=for-the-badge&logo=langchain&logoColor=white" />
</p>

## Highlights

- **Multi-store search** — Query products across many vendors in one command
- **Extended search** — Real-time queries to vendor stores when the local catalog doesn't have what you need
- **Agent safety profiles** — Spending caps, category restrictions, order confirmation via email or web
- **MCP server** — Native [Model Context Protocol](https://modelcontextprotocol.io/) support with 19 tools for AI agents
- **Non-interactive mode** — Every command works without prompts (flags + `--json` output)
- **Advertise requests** — Can't find it? Publish what you need and let vendors bid
- **Secure payments** — Card details never touch the CLI; payment setup goes through Stripe
- **OS keychain auth** — Tokens stored in the system keychain, not config files

---

## Install

**Requirements:** Node.js ≥ 18

### From npm

```bash
npm install -g clishop
```

### From source

```bash
git clone https://github.com/DavooxBv2/CLISHOP.git
cd CLISHOP
npm install
npm run build
npm link
```

## Quick Start

```bash
clishop setup
```

The setup wizard walks you through:

1. **Account** — Create an account or log in
2. **Agent** — Configure a safety profile (default: $200 max, confirmation required)
3. **Address** — Add a shipping address (required for searches)
4. **Payment** — Link a payment method via a secure browser link
5. **Search** — Run your first product search

Then start shopping:

```bash
clishop search "wireless headphones"    # Search across all stores
clishop info 1                          # Get details on result #1
clishop buy 1                           # Buy result #1
clishop order list                      # Check your orders
```

> **Tip:** Use result numbers from a search anywhere — `clishop info 1 2 3` or `clishop buy 2`.

---

## MCP Server

CLISHOP ships as a native MCP server. VS Code (GitHub Copilot), Claude Desktop, Cursor, Windsurf, and any MCP-compatible client gets access to 19 shopping tools out of the box.

```bash
# If installed globally
clishop-mcp

# Or run without installing
npx -y clishop --mcp
```

> **Prerequisite:** Log in once with `clishop login` before using MCP tools. The MCP server uses the same auth tokens stored in your OS keychain.

<details>
<summary><strong>VS Code / GitHub Copilot</strong></summary>

Add to `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "clishop": {
      "command": "clishop-mcp",
      "args": []
    }
  }
}
```

If not installed globally, use npx:

```json
{
  "servers": {
    "clishop": {
      "command": "npx",
      "args": ["-y", "clishop", "--mcp"]
    }
  }
}
```

</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "clishop": {
      "command": "clishop-mcp"
    }
  }
}
```

</details>

<details>
<summary><strong>Cursor</strong></summary>

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "clishop": {
      "command": "clishop-mcp"
    }
  }
}
```

</details>

<details>
<summary><strong>Windsurf</strong></summary>

Add to `~/.windsurf/mcp.json`:

```json
{
  "mcpServers": {
    "clishop": {
      "command": "clishop-mcp"
    }
  }
}
```

</details>

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `search_products` | Search products across all stores with filters |
| `get_product` | Get detailed product info |
| `buy_product` | Place an order with safety checks |
| `list_orders` | List orders by status |
| `get_order` | Get order details + tracking |
| `cancel_order` | Cancel a pending order |
| `list_addresses` | List shipping addresses |
| `add_address` | Add a shipping address |
| `remove_address` | Remove a shipping address |
| `list_payment_methods` | List payment methods |
| `list_stores` | Browse available stores |
| `get_store` | Get store details |
| `store_catalog` | Browse a store's catalog |
| `account_status` | Full account overview |
| `list_agents` | List safety agents |
| `create_advertise_request` | Post a request for vendors to bid on |
| `create_support_ticket` | Open a support ticket |
| `list_support_tickets` | List support tickets |
| `submit_feedback` | Report bugs or suggest improvements |

---

## For AI Agents

CLISHOP is designed to be called by AI agents, scripts, and automation pipelines. Every command supports non-interactive flags and machine-readable JSON output.

### Authenticate

```bash
echo "<password>" | clishop login --email user@example.com --password-stdin
```

### Search → Buy flow

```bash
# Search (JSON for parsing)
clishop search "wireless headphones" --json

# Get details on a result
clishop info 1 --json

# Buy it (skip confirmation prompt)
clishop buy 1 -y

# Check order status
clishop order list --json
```

### Agent safety profiles

Create a scoped agent with a $50 spending cap:

```bash
clishop agent create shopping-bot --max-amount 50 --require-confirm
```

Use it for a specific command:

```bash
clishop search "USB-C cable" --agent shopping-bot --json
clishop buy 1 --agent shopping-bot -y
```

### JSON everywhere

Append `--json` to any read command:

```bash
clishop search "laptop stand" --json
clishop order list --json
clishop order show ordr_xxx --json
clishop info xprd_xxx --json
clishop store list --json
clishop status --json
```

### Exit codes

| Code | Meaning |
|------|---------|
| `0`  | Success |
| `1`  | Error (auth failure, not found, validation, API error) |

Errors go to `stderr`. JSON output goes to `stdout`.

---

## Commands

### Authentication

```bash
clishop register                           # Create account (interactive)
clishop login                              # Log in (interactive)
clishop login -e user@example.com -p pass  # Log in (non-interactive)
clishop logout                             # Clear local tokens
clishop whoami                             # Print current user
```

### Search & Browse

```bash
clishop search <query>                     # Search across all stores
clishop search <query> --json              # JSON output
clishop search <query> -c Electronics      # Filter by category
clishop search <query> --brand Sony        # Filter by brand
clishop search <query> --store StoreName   # Filter by store
clishop search <query> --min-price 1000    # Min price (cents)
clishop search <query> --max-price 10000   # Max price (cents)
clishop search <query> --in-stock          # Only in-stock items
clishop search <query> --free-shipping     # Free shipping only
clishop search <query> --free-returns      # Free returns only
clishop search <query> --country US        # Delivery country
clishop search <query> -e                  # Force extended search
clishop search <query> -i                  # Interactive mode
clishop search <query> --compact           # One-line-per-result
clishop search <query> -s price --order asc  # Sort by price

clishop info <id or #> [id...]             # Get details from vendor store
clishop info 1 2 3                         # Use search result numbers
clishop product <productId>                # View local product details
```

**Sort options:** `price`, `total-cost`, `rating`, `relevance`, `newest`, `delivery`

### Ordering

```bash
clishop buy <id or #>                      # Quick-buy a product
clishop buy 1                              # Buy search result #1
clishop buy <id> -q 3                      # Buy quantity 3
clishop buy <id> --address <addrId>        # Specify address
clishop buy <id> --payment <pmId>          # Specify payment method
clishop buy <id> -y                        # Skip confirmation prompt

clishop order list                         # List orders
clishop order list --status pending        # Filter by status
clishop order show <orderId>               # Order details
clishop order cancel <orderId>             # Cancel an order
```

When an order is placed, you'll receive a **confirmation email**. You can confirm the order via the email link or on the [website](https://clishop.ai/orders). Orders are only sent to the vendor after confirmation (unless you've opted out).

### Agents

Agents are safety profiles that control per-order limits and behavior.

```bash
clishop agent list                         # List all agents
clishop agent show                         # Show active agent
clishop agent create <name>                # Create agent (interactive)
clishop agent create <name> --max-amount 100 --require-confirm
clishop agent use <name>                   # Switch active agent
clishop agent update <name>                # Update settings
clishop agent delete <name>                # Delete (can't delete "default")
```

| Setting | Description |
|---------|-------------|
| `maxOrderAmount` | Spending cap per order (dollars) |
| `requireConfirmation` | Require email/web confirmation before ordering |
| `allowedCategories` | Whitelist of product categories |
| `blockedCategories` | Blacklist of product categories |
| `defaultAddressId` | Default shipping address |
| `defaultPaymentMethodId` | Default payment method |

### Addresses

```bash
clishop address list                       # List addresses
clishop address add                        # Add address (interactive)
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

### Stores

```bash
clishop store list                         # List stores
clishop store list --verified              # Only verified stores
clishop store info <store>                 # Store details
clishop store catalog <store>              # Browse products
clishop store catalog <store> -q "cable"   # Search within store
```

### Advertised Requests

Can't find what you're looking for? Publish a request and let vendors bid:

```bash
clishop advertise create                   # Publish a request (interactive)
clishop advertise quick <title>            # Publish (non-interactive)
clishop advertise list                     # List your requests
clishop advertise show <id>                # View request + bids
clishop advertise accept <id> <bidId>      # Accept a bid
clishop advertise reject <id> <bidId>      # Reject a bid
clishop advertise cancel <id>              # Cancel a request
```

### Reviews

```bash
clishop review add <productId>             # Write a review
clishop review list                        # List your reviews
clishop review delete <reviewId>           # Delete a review
```

### Support & Feedback

```bash
clishop support create <orderId>           # Open a support ticket
clishop support list                       # List tickets
clishop support show <ticketId>            # View ticket
clishop support reply <ticketId>           # Reply to ticket

clishop feedback bug                       # Report a bug
clishop feedback suggest                   # Submit a suggestion
clishop feedback list                      # List your feedback
clishop feedback show <id>                 # View details
```

### Account & Config

```bash
clishop status                             # Full account overview
clishop config show                        # Show config
clishop config reset                       # Reset to defaults
clishop config path                        # Print config file path
clishop setup                              # Re-run setup wizard
```

---

## Concepts

### Extended Search

When a regular search doesn't find what you need, CLISHOP queries vendor stores in real-time. This happens automatically, or you can force it with `--extended-search` / `-e`.

Extended search results use `xprd_` IDs. Use `clishop info <id>` to get full details from the vendor.

### Order Confirmation

By default, every order requires confirmation before it's sent to the vendor. When you place an order:

1. Payment is authorized immediately
2. You receive a **confirmation email** with a one-click confirm link
3. You can also confirm on the [website](https://clishop.ai/orders)
4. The order is only sent to the vendor after you confirm

You can disable confirmation per-agent if you trust your automation.

### IDs

All entities use short, prefixed IDs:

| Prefix | Entity |
|--------|--------|
| `prod_` | Product |
| `xprd_` | Extended product (from vendor search) |
| `ordr_` | Order |
| `addr_` | Address |
| `pymt_` | Payment method |
| `stor_` | Store |
| `agnt_` | Agent |

### Money

All prices are stored in **cents** (integer). The CLI converts to dollars for display: `7999` → `$79.99`.

---

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
       │  CLISHOP API   │  ← clishop-backend (Vercel)
       │                │
       └───────┬───────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
 Store A    Store B    Store C   ← vendor stores
```

The CLI is a stateless client. All data flows through the backend API.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript (ESM) |
| CLI framework | [Commander.js](https://github.com/tj/commander.js) |
| Prompts | [Inquirer.js](https://github.com/SBoudrias/Inquirer.js) |
| HTTP | [Axios](https://github.com/axios/axios) |
| Config | [Conf](https://github.com/sindresorhus/conf) |
| Auth | [Keytar](https://github.com/nicktrav/node-keytar) (OS keychain) |
| Bundler | [tsup](https://github.com/egoist/tsup) |

## Development

```bash
git clone https://github.com/DavooxBv2/CLISHOP.git
cd CLISHOP
npm install

npm run dev -- search "headphones"   # Dev mode (no build)
npm run build                        # Production build
npm run lint                         # Type-check
```

## Contributing

Contributions welcome! Please open an issue first to discuss.

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit (`git commit -m 'feat: add my feature'`)
4. Push (`git push origin feat/my-feature`)
5. Open a Pull Request

## Sell on CLISHOP

Want to sell your own products through CLISHOP? Use the [Dark Store](https://github.com/DavooxBv2/CLISHOP-DARKSTORE) template to create your own store — no website needed. Configure your catalog, shipping, and pricing in a few YAML files, deploy to Vercel, and start receiving orders.

## Links

- 🌐 **Website:** [clishop.ai](https://clishop.ai)
- 💬 **Discord:** [discord.gg/vwXMbzD4bx](https://discord.gg/vwXMbzD4bx)
- 📦 **npm:** [npmjs.com/package/clishop](https://www.npmjs.com/package/clishop)
- 🏪 **Dark Store:** [github.com/DavooxBv2/CLISHOP-DARKSTORE](https://github.com/DavooxBv2/CLISHOP-DARKSTORE)
- 📄 **Terms:** [clishop.ai/terms](https://clishop.ai/terms)
- 🔒 **Privacy:** [clishop.ai/privacy](https://clishop.ai/privacy)

## License

[MIT](LICENSE)
