---
name: clishop
description: "Order anything from your terminal — search products, compare prices across stores, place orders, manage addresses and payments. Built for AI agents and humans."
---

# CLISHOP — Buy anything from your terminal

CLISHOP is an open-source MCP server and CLI that lets AI agents search for products across multiple stores, compare prices, and place real orders — all from the terminal.

**46 MCP tools** for the full shopping lifecycle: search → compare → buy → track → review → return.

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
node ./dist/mcp.js       # From the installed package directory
```

## OpenClaw usage rules

When CLISHOP is installed in OpenClaw, prefer the MCP tools exposed by the CLISHOP server instead of shell commands.

- OpenClaw commonly exposes these tools with a `clishop__<tool_name>` naming pattern, for example `clishop__list_addresses`, `clishop__add_address`, `clishop__set_default_address`, `clishop__add_payment_method`, `clishop__list_payment_methods`, and `clishop__buy_product`.
- If those MCP tools are available, do not fall back to `clishop address add` or other CLI subcommands.
- If a user asks to add a home or shipping address and the address is already known from memory or prior conversation context, call the address tool directly and only ask for missing required fields.
- If a user asks to add a payment method, call `clishop__add_payment_method` or `add_payment_method` to generate a secure setup link for the human. Do not ask the user to paste card details into chat.

### Non-interactive address flow

1. Call `clishop__list_addresses` or `list_addresses` first to check existing saved addresses.
2. If the correct address already exists, reuse it and call `clishop__set_default_address` or `set_default_address` if needed.
3. If no suitable address exists, call `clishop__add_address` or `add_address` directly with the known fields.
4. Ask the user only for any missing required fields.
5. Prefer `setDefault: true` when adding the main home address.

### Payment method flow

1. Call `clishop__list_payment_methods` or `list_payment_methods` first to see whether a payment method already exists.
2. If none exists, call `clishop__add_payment_method` or `add_payment_method`.
3. Give the returned `setupUrl` to the human and tell them to complete payment setup in the secure web portal.
4. After the human confirms completion, call `clishop__list_payment_methods` again.
5. If needed, call `clishop__set_default_payment_method` or `set_default_payment_method` with the chosen payment method ID.

The agent must never collect raw card details in chat. The secure web flow is the supported path.

Required fields for `add_address`:

- `label`
- `firstName`
- `lastName`
- `line1`
- `city`
- `postalCode`
- `country`

Optional fields:

- `line2`
- `region`
- `phone`
- `companyName`
- `vatNumber`
- `taxId`
- `instructions`
- `setDefault`

Example `add_address` payload for a US home address in San Francisco:

```json
{
	"label": "Home",
	"firstName": "Alex",
	"lastName": "Johnson",
	"line1": "1234 Hayes Street",
	"city": "San Francisco",
	"region": "CA",
	"postalCode": "94117",
	"country": "United States",
	"phone": "+14155550123",
	"instructions": "Leave at front door",
	"setDefault": true
}
```

## Tools

| Tool | Description | Read-only |
|------|-------------|-----------|
| `setup` | Create or sign in with an email address (completes immediately) | ❌ |
| `setup_status` | Check a legacy setup session by setup_id | ✅ |
| `search_products` | Search across all connected stores with filters (price, brand, category, shipping, ratings) | ✅ |
| `get_product` | Get detailed info about a specific product | ✅ |
| `buy_product` | Place an order (respects agent safety limits) | ❌ |
| `list_orders` | List orders, optionally filtered by status | ✅ |
| `get_order` | Full order details including tracking and shipments | ✅ |
| `cancel_order` | Cancel a pending or confirmed order | ❌ |
| `list_addresses` | List saved shipping addresses | ✅ |
| `add_address` | Add a new shipping address | ❌ |
| `remove_address` | Remove a saved address | ❌ |
| `set_default_address` | Set the default shipping address for the active agent | ❌ |
| `list_payment_methods` | List saved payment methods | ✅ |
| `add_payment_method` | Generate a secure payment-setup link for the human | ❌ |
| `remove_payment_method` | Remove a saved payment method | ❌ |
| `set_default_payment_method` | Set the default payment method for the active agent | ❌ |
| `list_stores` | Browse available stores | ✅ |
| `get_store` | View store details | ✅ |
| `store_catalog` | Browse a store's product catalog | ✅ |
| `account_status` | Full account overview (user, agents, addresses, payments) | ✅ |
| `list_agents` | List safety profiles (spending limits, allowed categories) | ✅ |
| `get_agent` | View details of a specific agent | ✅ |
| `create_agent` | Create a new agent (safety profile) with spending limits | ❌ |
| `update_agent` | Update an agent's settings (limits, categories, defaults) | ❌ |
| `switch_agent` | Switch the active agent | ❌ |
| `get_spending_limit` | View the current monthly spending limit | ✅ |
| `set_spending_limit` | Change the monthly spending limit | ❌ |
| `add_product_review` | Write a product review (1-10 rating) | ❌ |
| `add_store_review` | Write a store review (1-10 rating) | ❌ |
| `list_reviews` | List all your product and store reviews | ✅ |
| `get_product_rating` | View rating details for a product | ✅ |
| `get_store_rating` | View rating details for a store | ✅ |
| `delete_review` | Delete one of your reviews | ❌ |
| `create_advertise_request` | Post a request for vendors to bid on | ❌ |
| `list_advertise_requests` | List your advertised requests | ✅ |
| `get_advertise_request` | View an advertised request and its bids | ✅ |
| `accept_advertise_bid` | Accept a vendor's bid | ❌ |
| `reject_advertise_bid` | Reject a vendor's bid | ❌ |
| `cancel_advertise_request` | Cancel an open advertised request | ❌ |
| `create_support_ticket` | Create a support ticket for an order | ❌ |
| `list_support_tickets` | List support tickets | ✅ |
| `get_support_ticket` | View a support ticket and its message history | ✅ |
| `reply_to_support_ticket` | Send a reply to a support ticket | ❌ |
| `close_support_ticket` | Close a resolved support ticket | ❌ |
| `submit_feedback` | Report a bug or suggest an improvement | ❌ |
| `list_feedback` | List your submitted bug reports and suggestions | ✅ |
| `get_feedback` | View details of a specific feedback item | ✅ |

## External Endpoints

All network requests go to the CLISHOP API:

| Endpoint | Method | Data sent | Purpose |
|----------|--------|-----------|---------|
| `/auth/setup-link` | POST | Email address | Create account / sign in |
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
| `/payment-methods/:id` | DELETE | Payment method ID | Remove payment method |
| `/stores` | GET | Query, filters | Browse stores |
| `/stores/:id` | GET | Store ID/slug | Store details |
| `/stores/:id/products` | GET | Query, filters | Store catalog |
| `/agents` | GET | — | List agents |
| `/spending-limit` | GET/PATCH | Limit in cents | Get/set spending limit |
| `/products/:id/reviews` | POST | Rating, title, body | Product review |
| `/stores/:id/reviews` | POST | Rating, title, body | Store review |
| `/reviews/mine` | GET | — | List own reviews |
| `/products/:id/rating` | GET | — | Product rating details |
| `/stores/:id/rating` | GET | — | Store rating details |
| `/advertise` | GET/POST | Title, description, brand, quantity, max bid price | Advertise requests |
| `/advertise/:id` | GET | — | Advertise request details |
| `/advertise/:id/bids/:id/accept` | POST | — | Accept bid |
| `/advertise/:id/bids/:id/reject` | POST | — | Reject bid |
| `/advertise/:id/cancel` | POST | — | Cancel advertise request |
| `/support` | GET/POST | Ticket details or status filter | Support tickets |
| `/support/:id` | GET | — | Support ticket details |
| `/support/:id/reply` | POST | Message | Reply to support ticket |
| `/support/:id/status` | PATCH | Status | Close support ticket |
| `/feedback` | GET/POST | Feedback type, title, description | Feedback |
| `/feedback/:id` | GET | — | Feedback details |

All requests are sent over **HTTPS** to `https://clishop-backend.vercel.app/api`.

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