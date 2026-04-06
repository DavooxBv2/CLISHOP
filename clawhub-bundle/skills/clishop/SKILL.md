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