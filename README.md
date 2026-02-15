CLISHOP (CLI)

This repository contains the CLISHOP command-line interface.

The CLI is the primary tool for buyers to:

authenticate to CLISHOP,

manage ordering-related profile data (as supported by the platform),

search/quote/buy items through CLISHOP's backend,

view order history and track shipments,

get a consistent, scriptable interface to ordering workflows.

The CLI is a client. It does not own the database, vendor integrations, or order orchestration logic. It talks to CLISHOP-BACKEND over HTTPS APIs.

## Quick Start

```bash
# Install dependencies
npm install

# Build the CLI
npm run build

# Run it
node dist/index.js --help

# Or link it globally
npm link
clishop --help
```

## Commands

```
clishop login           Log in to your CLISHOP account
clishop register        Create a new CLISHOP account
clishop logout          Log out
clishop whoami          Show current user

clishop agent list      List all agents
clishop agent create    Create a new agent (safety profile)
clishop agent use       Switch the active agent
clishop agent show      Show agent details
clishop agent update    Update agent settings
clishop agent delete    Delete an agent

clishop address list    List addresses for the active agent
clishop address add     Add a new address
clishop address remove  Remove an address
clishop address set-default  Set default address

clishop payment list    List payment methods
clishop payment add     Add a payment method (opens browser)
clishop payment remove  Remove a payment method
clishop payment set-default  Set default payment

clishop search <query>  Search for products
clishop product <id>    View product details

clishop buy <productId> Quick-buy a product
clishop order list      List your orders
clishop order show <id> Show order details
clishop order cancel    Cancel an order

clishop review add      Write a product review
clishop review list     List your reviews
clishop review delete   Delete a review

clishop config show     Show configuration
clishop config set-api-url  Set backend URL
clishop config set-output   Set output format
clishop config reset    Reset configuration
```

## Agents

Agents are safety profiles for ordering. Every user has a "default" agent.
Each agent has its own:

- Max order amount (safety limit)
- Allowed/blocked product categories
- Default shipping address
- Default payment method
- Confirmation requirement

Use `--agent <name>` on any command to use a specific agent for that invocation.

## Configuration

Config is stored locally at `~/.config/clishop/config.json` (or platform equivalent).
Auth tokens are stored securely in the OS keychain via `keytar`.

Set the backend URL:
```bash
clishop config set-api-url https://api.clishop.dev/api
```

## What this repo is responsible for
Buyer experience in the terminal

A fast, ergonomic command set for ordering workflows

Human-friendly interactive output (and optional JSON output for scripting)

Clear confirmation prompts and safety messaging before irreversible actions

A consistent UX across platforms (macOS/Linux/Windows, as supported)

Authentication and session handling

Provides a login flow that authenticates the user with the CLISHOP platform

Maintains a local authenticated session (token handling and refresh as applicable)

Supports logout and account/session inspection

Note: authentication details (OIDC/device flow/etc.) are platform decisions owned by the backend. The CLI implements the client-side portion.

API client usage

The CLI calls CLISHOP-BACKEND endpoints to:

search and retrieve offers

request quotes

place orders

fetch order status and history

fetch tracking updates

The CLI should never talk directly to vendor systems.

Local configuration

Stores non-sensitive CLI preferences (output format, default address/profile, etc.)

Keeps secrets/tokens in the platform-appropriate secure store (where applicable)

Supports configuration via environment variables for automation

What this repo is not responsible for

Storing or managing the source-of-truth order database

Implementing vendor integrations/connectors

Handling payment card data (the CLI should never collect raw card details)

Running background order workflows (that happens in CLISHOP-BACKEND)

Relationship to other CLISHOP repositories

CLISHOP-BACKEND: the API + orchestration service the CLI calls

CLISHOP-WEB: the website/dashboard for users and (optionally) vendor portal UI

CLISHOP-VENDORSDK: tools and SDK for vendors integrating with CLISHOP
