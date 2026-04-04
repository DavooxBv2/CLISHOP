---
name: clishop
description: "Order anything from your terminal — search products, compare prices across stores, place orders, manage addresses and payments. Built for AI agents and humans."
homepage: https://github.com/DavooxBv2/CLISHOP
metadata:
  clawdbot:
    emoji: "🛍️"
    requires:
      env: ["CLISHOP_API_URL"]
    files: ["scripts/*"]
---

# CLISHOP — Buy anything from your terminal

CLISHOP is an open-source MCP server and CLI that lets AI agents search for products across multiple stores, compare prices, and place real orders — all from the terminal.

**19 MCP tools** for the full shopping lifecycle: search → compare → buy → track → return.

## Installation

```bash
npm install -g clishop
```

Use the email-first setup command:

```bash
clishop setup start --email user@example.com --json
```

Then search products, and only add an address or payment method when the user is ready to buy.

### MCP Server

```bash
clishop-mcp              # If installed globally
npx -y clishop --mcp     # Without installing
```

## Tools

| Tool | Description | Read-only |
|------|-------------|-----------|
| `search_products` | Search across all connected stores with filters (price, brand, category, shipping, ratings) | ✅ |
| `get_product` | Get detailed info about a specific product | ✅ |
| `buy_product` | Place an order (respects agent safety limits) | ❌ |
| `list_orders` | List orders, optionally filtered by status | ✅ |
| `get_order` | Full order details including tracking and shipments | ✅ |
| `cancel_order` | Cancel a pending or confirmed order | ❌ |
| `list_addresses` | List saved shipping addresses | ✅ |
| `add_address` | Add a new shipping address | ❌ |
| `remove_address` | Remove a saved address | ❌ |
| `list_payment_methods` | List saved payment methods | ✅ |
| `list_stores` | Browse available stores | ✅ |
| `get_store` | View store details | ✅ |
| `store_catalog` | Browse a store's product catalog | ✅ |
| `account_status` | Full account overview (user, agents, addresses, payments) | ✅ |
| `list_agents` | List safety profiles (spending limits, allowed categories) | ✅ |
| `create_advertise_request` | Post a request for vendors to bid on | ❌ |
| `create_support_ticket` | Create a support ticket for an order | ❌ |
| `list_support_tickets` | List support tickets | ✅ |
| `submit_feedback` | Report a bug or suggest an improvement | ❌ |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLISHOP_API_URL` | No | Override the API base URL (defaults to `https://clishop-backend.vercel.app/api`) |

Authentication is handled through the setup flow, which stores the session token securely in the OS keychain when available (via keytar) or falls back to local file storage. No API key env var is needed.

## External Endpoints

All network requests go to the CLISHOP API:

| Endpoint | Method | Data sent | Purpose |
|----------|--------|-----------|---------|
| `/products/search` | GET | Search query, filters (category, brand, price range, country) | Product search |
| `/products/:id` | GET | Product ID | Product details |
| `/products/extended/:id` | GET | Product ID | Extended product lookup across vendor stores |
| `/orders` | GET | Status filter, page | List user's orders |
| `/orders` | POST | Product ID, quantity, address ID, payment ID, agent name | Place an order |
| `/orders/:id` | GET | Order ID | Order details |
| `/orders/:id/tracking` | GET | Order ID | Shipment tracking |
| `/orders/:id/cancel` | POST | Order ID | Cancel an order |
| `/addresses` | GET | Agent name | List addresses |
| `/addresses` | POST | Full address fields (name, street, city, country, etc.) | Add address |
| `/addresses/:id` | DELETE | Address ID | Remove address |
| `/payment-methods` | GET | Agent name | List payment methods |
| `/stores` | GET | Query, filters | Browse stores |
| `/stores/:id` | GET | Store ID/slug | Store details |
| `/stores/:id/products` | GET | Query, filters | Store catalog |
| `/agents` | GET | — | List agents |
| `/advertise` | POST | Title, description, brand, quantity, max bid price | Create advertise request |
| `/support` | GET/POST | Ticket details or status filter | Support tickets |
| `/feedback` | POST | Feedback type, title, description | Submit feedback |

All requests are sent over **HTTPS** to `https://clishop-backend.vercel.app/api` (or the `CLISHOP_API_URL` override).

## Security & Privacy

- **Authentication:** Session tokens are stored in the OS keychain via [keytar](https://github.com/nicknisi/keytar), never in plain-text config files.
- **No local data collection:** CLISHOP does not collect analytics, telemetry, or tracking data locally.
- **Agent safety profiles:** Spending limits (`maxOrderAmount`), category allow/block lists, and confirmation requirements are enforced client-side before any order is placed.
- **Data sent to API:** Only the data required for each operation (search queries, addresses, order details) is sent to the CLISHOP backend API. No additional metadata is collected.
- **Vendor stores:** When extended search is enabled, the CLISHOP backend fans out search queries to registered vendor Dark Stores in real-time. Product data flows through the CLISHOP API — the CLI never contacts vendor stores directly.

## Trust Statement

By using this skill, your search queries, shipping addresses, payment method references, and order details are sent to the CLISHOP API (`clishop-backend.vercel.app`). The API acts as a gateway to registered vendor stores. No data is sold or shared with third parties beyond what is necessary to fulfill orders.

## Model Invocation Note

This skill is designed for autonomous invocation by AI agents via the Model Context Protocol (MCP). When an MCP client (e.g. Claude Desktop, Cursor, VS Code Copilot) calls these tools, the agent may search for products, place orders, and manage account data on the user's behalf — subject to the safety thresholds configured in the user's agent profile.

## Links

- 🌐 [clishop.ai](https://clishop.ai)
- 📖 [Docs](https://clishop.ai/docs)
- 💬 [Discord](https://discord.gg/vwXMbzD4bx)
- 🏪 [Dark Store template](https://github.com/DavooxBv2/CLISHOP-DARKSTORE)
- 📦 [npm](https://www.npmjs.com/package/clishop)
