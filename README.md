# CLISHOP CLI

**CLISHOP** is a command-line shopping tool. Users search, browse, and buy products from multiple stores — all from the terminal. A single checkout covers items across stores.

- **Package**: `@clishop/cli`
- **Binary**: `clishop`
- **Runtime**: Node.js ≥ 18
- **Backend**: `https://clishop-backend.vercel.app/api`

---

## Install

```bash
npm install -g @clishop/cli
```

Or from source:

```bash
git clone https://github.com/DavooxBv2/CLISHOP.git
cd CLISHOP
npm install
npm run build
npm link        # makes "clishop" available globally
```

## First Run

Running `clishop` with no arguments triggers a guided setup wizard if the user hasn't completed setup. The wizard walks through:

1. Account creation or login
2. Agent configuration (optional — a default agent is created automatically)
3. Shipping address
4. Payment method (opens a secure browser link)
5. First product search

The wizard can also be re-run at any time:

```bash
clishop setup
```

---

## Authentication

All commands except `--help`, `--version`, `register`, `login`, `config`, and `setup` require authentication.

Auth tokens are stored in the OS keychain via `keytar`. Refresh tokens are rotated automatically on expiry.

```bash
clishop register                          # interactive: name, email, password
clishop login                             # interactive: email, password
clishop login -e user@example.com -p pass # non-interactive
clishop logout                            # clears local tokens
clishop whoami                            # prints current user name, email, id
```

### Non-interactive auth (for scripts / AI agents)

```bash
clishop login --email <email> --password <password>
```

Both `-e` / `--email` and `-p` / `--password` flags are supported. If either is omitted, the CLI will prompt interactively.

---

## Concepts

### Agents

Agents are **safety profiles** that control ordering behavior. Every user has a `default` agent created at registration.

Each agent has:
- `maxOrderAmount` — spending cap per order (in dollars)
- `requireConfirmation` — whether to prompt before placing an order
- `allowedCategories` / `blockedCategories` — category restrictions
- `defaultAddressId` — default shipping address
- `defaultPaymentMethodId` — default payment method

Use `--agent <name>` on any command to override the active agent for that invocation:

```bash
clishop search headphones --agent work
clishop buy prod_xxx --agent work
```

### Stores

Products belong to stores (vendors). Stores are first-class entities with their own IDs (`stor_xxx`). The CLI displays the store name alongside products.

### IDs

All entities use short, prefixed IDs:

| Prefix | Entity          | Example            |
|--------|-----------------|--------------------|
| `prod_` | Product        | `prod_a8k3m2x9p4w1` |
| `ordr_` | Order          | `ordr_b7n4q1y8t3v6` |
| `addr_` | Address        | `addr_c9j2w5r8m1k4` |
| `pymt_` | Payment method | `pymt_d3f8k1n7p2q9` |
| `stor_` | Store          | `stor_e4g7j2m8r5t1` |
| `user_` | User           | `user_f5h8k3n9s6v2` |
| `agnt_` | Agent          | `agnt_g6j9l4p1t7w3` |
| `chkt_` | Checkout       | `chkt_h7k1m5q2u8x4` |

### Money

All prices are stored and returned in **cents** (integer). The CLI converts to dollars for display. Example: `7999` = `$79.99`.

---

## Command Reference

### Search & Browse

```bash
clishop search <query>                    # search for products
clishop search <query> --json             # output raw JSON
clishop search <query> -c Electronics     # filter by category
clishop search <query> --vendor AudioTech # filter by store/vendor
clishop search <query> --min-price 1000   # min price in cents
clishop search <query> --max-price 10000  # max price in cents
clishop search <query> --min-rating 4     # minimum star rating (1-5)
clishop search <query> --in-stock         # only in-stock items
clishop search <query> -s price --order asc  # sort by price ascending
clishop search <query> -p 2 -n 10        # page 2, 10 results per page

clishop product <productId>               # view product details
clishop product <productId> --json        # raw JSON output
```

**Sort options** (`-s`): `price`, `rating`, `relevance`, `newest`

### Ordering

```bash
clishop buy <productId>                   # quick-buy with defaults
clishop buy <productId> -q 3             # buy quantity 3
clishop buy <productId> --address <id>   # specify shipping address
clishop buy <productId> --payment <id>   # specify payment method
clishop buy <productId> -y               # skip confirmation prompt
clishop buy <productId> --agent work     # use a specific agent

clishop order list                        # list your orders
clishop order list --status pending       # filter by status
clishop order list --json                 # raw JSON
clishop order show <orderId>              # order details + tracking
clishop order show <orderId> --json
clishop order cancel <orderId>            # cancel an order (interactive confirm)
```

**Order statuses**: `pending`, `confirmed`, `processing`, `shipped`, `delivered`, `cancelled`

The `buy` command:
1. Fetches product info
2. Checks agent safety limits (max amount, category restrictions)
3. Shows a confirmation prompt (unless `-y` or agent has `requireConfirmation: false`)
4. Creates a checkout + order on the backend
5. Returns the order ID

### Agents

```bash
clishop agent list                        # list all agents (active marked with ●)
clishop agent show                        # show active agent details
clishop agent show <name>                 # show specific agent
clishop agent create <name>               # interactive: create a new agent
clishop agent create <name> --max-amount 1000  # set max order amount ($)
clishop agent create <name> --no-confirm  # don't require order confirmation
clishop agent use <name>                  # switch active agent
clishop agent update <name>               # interactive: update agent settings
clishop agent delete <name>               # delete an agent (cannot delete "default")
```

### Addresses

Addresses are scoped to the active agent.

```bash
clishop address list                      # list addresses for active agent
clishop address add                       # interactive: add an address
clishop address remove <addressId>        # remove (soft-delete) an address
clishop address set-default <addressId>   # set default address for active agent
```

Address fields when adding:
- **Label**: e.g. "Home", "Office"
- **Street name and number**: e.g. "123 Main St"
- **Apartment/suite** (optional)
- **Postal / ZIP code**
- **City**
- **State / Province / Region** (optional — supports international addresses)
- **Country**

### Payment Methods

Payment methods are scoped to the active agent. The CLI never collects card details — it opens a secure browser link.

```bash
clishop payment list                      # list payment methods for active agent
clishop payment add                       # get a secure setup link (opens browser)
clishop payment remove <paymentId>        # remove (soft-delete) a payment method
clishop payment set-default <paymentId>   # set default payment for active agent
```

### Reviews

```bash
clishop review add <productId>            # interactive: write a review (rating, title, body)
clishop review list                       # list your reviews
clishop review list --json                # raw JSON
clishop review delete <reviewId>          # delete a review
```

### Configuration

```bash
clishop config show                       # show current config (active agent, output format, path)
clishop config set-output human           # set output format to human-readable
clishop config set-output json            # set output format to JSON
clishop config reset                      # reset all config to defaults
clishop config path                       # print config file path
```

### Setup

```bash
clishop setup                             # run the first-time setup wizard
```

---

## Non-Interactive Usage (for AI Agents & Scripts)

The CLI is designed to work in automated/scripted environments:

### Login without prompts

```bash
clishop login -e <email> -p <password>
```

### Skip order confirmation

```bash
clishop buy <productId> -y
```

### JSON output for parsing

```bash
clishop search headphones --json
clishop order list --json
clishop order show <orderId> --json
clishop product <productId> --json
clishop review list --json
```

### Typical automated workflow

```bash
# 1. Authenticate
clishop login -e user@example.com -p mypassword

# 2. Search for a product
clishop search "wireless headphones" --json

# 3. View product details (use a product ID from search results)
clishop product prod_a8k3m2x9p4w1 --json

# 4. Buy it (skip confirmation)
clishop buy prod_a8k3m2x9p4w1 -y

# 5. Check order status
clishop order list --json
```

### Using a specific agent

```bash
clishop buy prod_xxx --agent work -y
```

### Exit codes

- `0` — success
- `1` — error (auth failure, not found, validation error, API error)

Errors are printed to stderr. On failure, check the error message for details.

---

## Configuration Storage

| Data | Location |
|------|----------|
| CLI config (agents, preferences) | `~/.config/clishop/config.json` (or OS equivalent) |
| Auth tokens | OS keychain (via `keytar`) |

The config file path can be found with:

```bash
clishop config path
```

---

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `CLISHOP_API_URL` | Override the backend API URL | `https://clishop-backend.vercel.app/api` |

---

## Architecture

```
CLISHOP CLI (this repo)
  │
  ├── Calls CLISHOP-BACKEND over HTTPS
  │     └── https://clishop-backend.vercel.app/api
  │
  ├── Stores config locally (conf)
  │     └── ~/.config/clishop/config.json
  │
  └── Stores auth tokens in OS keychain (keytar)
```

The CLI is a pure client. It does not own the database, vendor integrations, or order orchestration. All data operations go through the backend API.
