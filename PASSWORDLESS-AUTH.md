# Passwordless Auth — Current Email-First Flow

## Summary

CLISHOP now uses an email-first passwordless flow designed for both humans and agent runners.

The core contract is:

```bash
clishop setup start --email user@example.com --json
```

## Why this changed

The older flow mixed account creation, payment setup, decorative terminal output, and a blocking wait for browser completion in one command. That works for humans, but it is brittle for OpenClaw, Claude-style shells, MCP agents, and any environment that parses stdout.

The current model separates responsibilities cleanly:

- setup only creates or signs in the account
- search works immediately after setup
- address and payment are collected later, only when the user is ready to buy

## Current CLI behavior

The CLI stores auth locally as soon as the email-based setup succeeds.

### Agent-safe command

#### `clishop setup start`

Creates or signs in the account and returns immediately.

Example:

```bash
clishop setup start --email user@example.com --json
```

Example response:

```json
{
  "ok": true,
  "setup_id": "usr_abc123",
  "status": "completed",
  "next_action": "search_products",
  "account_id": "usr_abc123",
  "human_message": "Account ready. Search now, then add address and payment when you are ready to buy."
}
```

### Legacy commands

The legacy `setup status`, `setup wait`, and `setup cancel` commands remain available only for older setup IDs.

## MCP behavior

The MCP server mirrors the same model:

- `setup` creates the account immediately from the email address
- `setup_status` remains only for legacy setup IDs

This allows agent runtimes to:

1. create the account,
2. search products immediately,
3. collect address and payment only when the user decides to buy.

## Backend endpoints involved

The current email-first flow uses this unauthenticated endpoint:

- `POST /auth/setup-link`

Legacy compatibility endpoints still exist:

- `POST /auth/setup/status`
- `POST /auth/setup/cancel`
- `POST /auth/setup/claim`
- `POST /auth/setup-payment`
- `POST /auth/device/poll`

## Notes

- setup stores auth immediately on success
- payment collection moved to `clishop payment add` and the buy flow
- in JSON mode, stdout is JSON only
- non-interactive environments should prefer `setup start` over prompt-based flows
