# Passwordless Auth — Current Setup Session Flow

## Summary

CLISHOP now uses a resumable passwordless setup session flow designed for both humans and agent runners.

The core contract is:

```bash
clishop setup start --email user@example.com --json
clishop setup status --setup-id <setup_id> --json
clishop setup wait --setup-id <setup_id> --timeout 300 --json
clishop setup cancel --setup-id <setup_id> --json
```

The human-friendly `clishop setup` wrapper still exists, but it is layered on top of the same setup session model.

## Why this changed

The older flow mixed prompts, decorative terminal output, and a blocking wait for browser completion in one command. That works for humans, but it is brittle for OpenClaw, Claude-style shells, MCP agents, and any environment that parses stdout.

The new setup model separates responsibilities cleanly:

- `setup_url` is for the human to open in a browser
- `setup_id` is for the agent or CLI to track the setup lifecycle

## Current CLI behavior

### Human wrapper

```bash
clishop setup
```

Behavior:

- asks for email if needed
- starts a setup session
- prints the secure setup URL
- waits for completion
- stores auth locally when complete

### Agent-safe commands

#### `clishop setup start`

Starts a setup session and returns immediately.

Example:

```bash
clishop setup start --email user@example.com --json
```

Example response:

```json
{
  "ok": true,
  "setup_id": "dc21271181cf3d7baad7cda8b2b8e43f585d6892a783794e2d3538fdd9448aa9",
  "status": "pending_user_action",
  "next_action": "open_setup_url",
  "setup_url": "https://clishop.ai/setup/payment?token=...&deviceCode=...",
  "expires_at": "2026-04-04T19:49:57.869Z",
  "poll_after_seconds": 5,
  "human_message": "Open this link to securely connect your payment method."
}
```

#### `clishop setup status`

Checks the current status without blocking.

Example:

```bash
clishop setup status --setup-id <setup_id> --json
```

Possible states:

- `pending_user_action`
- `processing`
- `completed`
- `failed`
- `expired`
- `cancelled`

If setup is completed, the CLI will finalize and store auth locally when appropriate.

#### `clishop setup wait`

Convenience helper that waits until the setup completes or times out.

Example:

```bash
clishop setup wait --setup-id <setup_id> --timeout 300 --json
```

This is a helper, not the core contract.

#### `clishop setup cancel`

Cancels an active setup session.

Example:

```bash
clishop setup cancel --setup-id <setup_id> --json
```

## MCP behavior

The MCP server mirrors the same model:

- `setup` starts the setup session and returns `setup_id` plus `setup_url`
- `setup_status` checks setup progress and finalizes auth when setup is complete

This allows agent runtimes to:

1. start setup,
2. send the setup URL to the human,
3. check status later using the setup ID,
4. continue ordering once setup is complete.

## Backend endpoints involved

The current setup session flow uses these unauthenticated endpoints:

- `POST /auth/setup-link`
- `POST /auth/setup/status`
- `POST /auth/setup/cancel`
- `POST /auth/setup/claim`
- `POST /auth/setup-payment`

The legacy compatibility endpoint still exists:

- `POST /auth/device/poll`

## Notes

- `setup_id` currently maps directly to the backend `deviceCode`
- the setup URL is reusable until expiry
- the default expiry is 30 minutes
- in JSON mode, stdout is JSON only
- non-interactive environments should prefer `setup start/status/wait/cancel` over the human wrapper
