---
name: clishop
description: "Search products, compare stores, place orders, and manage shopping flows through CLISHOP from OpenClaw."
---

# CLISHOP

CLISHOP adds shopping capabilities to OpenClaw through the packaged CLISHOP MCP server.

## Setup

After installing the bundle, authenticate with your email address using the CLISHOP setup flow.

Typical first step:

```bash
Use the `setup` tool with the user's email address.
```

Once setup is complete, you can search immediately and only add an address or payment method when you are ready to buy.

## OpenClaw usage rules

When running inside OpenClaw, prefer the exposed CLISHOP MCP tools over shelling out to the CLI.

- Use the CLISHOP tool surface from the installed MCP server. In OpenClaw, these tools are commonly surfaced with the `clishop__` prefix, for example `clishop__list_addresses`, `clishop__add_address`, `clishop__set_default_address`, `clishop__list_payment_methods`, and `clishop__buy_product`.
- Do not stop because a local `clishop` CLI binary is missing if the MCP tools are available.
- Do not tell the user to run `clishop address add` when the OpenClaw MCP tools are present.

## Non-interactive address flow

When the user wants to buy something or add a shipping address:

1. Call `clishop__list_addresses` first to see whether a suitable address already exists.
2. If a matching home address already exists, reuse it and call `clishop__set_default_address` if it should become the default.
3. If no suitable address exists and the user's home address is already available in memory or earlier conversation context, call `clishop__add_address` directly instead of asking the user to type it again.
4. Only ask the user for fields that are still missing.
5. Prefer `setDefault: true` when adding the primary home shipping address.

Required fields for `clishop__add_address`:

- `label`
- `firstName`
- `lastName`
- `line1`
- `city`
- `postalCode`
- `country`

Optional fields for `clishop__add_address`:

- `line2`
- `region`
- `phone`
- `companyName`
- `vatNumber`
- `taxId`
- `instructions`
- `setDefault`

Example intent mapping inside OpenClaw:

- "Add my home shipping address" -> `clishop__list_addresses`, then `clishop__add_address` if needed.
- "Use my saved address and buy this" -> `clishop__list_addresses`, optionally `clishop__set_default_address`, then `clishop__buy_product`.

## Core capabilities

- search products across connected stores
- inspect product and store details
- place and cancel orders
- manage addresses and payment methods
- create and switch agent safety profiles
- enforce spending limits
- write reviews and handle support tickets
- create advertise requests and review bids

## Safety notes

- CLISHOP can trigger real purchases.
- Use confirmation requirements and conservative spending limits for autonomous agents.
- Authentication tokens are stored by the CLISHOP runtime in the OS keychain when available, or local file storage otherwise.

## Runtime

This bundle configures OpenClaw to launch:

```bash
node ./dist/mcp.cjs
```

## Links

- https://clishop.ai
- https://clishop.ai/docs
- https://www.npmjs.com/package/clishop