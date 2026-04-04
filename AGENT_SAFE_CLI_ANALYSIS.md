# CLISHOP Agent-Safe CLI Analysis

## Goal

Make CLISHOP safe to use from agent shells such as OpenClaw, Claude-style tool runners, and similar environments where:

- prompts are brittle,
- rich terminal output is not a stable API,
- browser-driven human actions must be resumable,
- stdout must be machine-readable when requested.

The key design shift is:

- model human-in-the-loop setup as `start -> return state -> check status later`
- do not model it as `prompt -> print pretty text -> block forever`

## Core Design Rules

### 1. Separate human UX from agent contract

The real integration contract should be explicit subcommands with stable JSON output:

```bash
clishop setup start --email user@example.com --json
clishop setup status --setup-id stp_123 --json
clishop setup cancel --setup-id stp_123 --json
clishop setup wait --setup-id stp_123 --timeout 300 --json
```

The current friendly `clishop` and `clishop setup` flows can remain, but they should become wrappers around those primitives.

### 2. `--json` must mean JSON-only stdout

When `--json` is passed:

- stdout contains JSON only
- banners, status lines, hints, spinners, and decorative text must not go to stdout
- warnings may go to stderr
- exit codes must be meaningful

### 3. No blocking on human action by default

Commands that depend on a human opening a browser, confirming data, or completing a payment setup should return immediately with the next action and any resumable IDs.

### 4. Stable public state machine

Recommended setup states:

- `pending_user_action`
- `processing`
- `completed`
- `failed`
- `expired`
- `cancelled`

Do not casually rename these once published.

### 5. Stable machine-readable errors

Recommended error codes:

- `invalid_email`
- `setup_not_found`
- `setup_expired`
- `human_action_required`
- `payment_setup_required`
- `not_authenticated`
- `internal_error`

## Current Setup Problem

Today the current setup path in [src/commands/setup.ts](src/commands/setup.ts) still does all of the following in one command:

- optionally prompts for email,
- creates the account,
- prints the setup link,
- polls until the user finishes browser setup,
- stores auth locally when complete.

That is convenient for humans, but it is not a stable agent contract.

## Proposed Setup Refactor

### Public command surface

#### `clishop setup start`

Responsibilities:

- accept `--email` non-interactively
- create the setup session
- return immediately
- emit JSON if `--json` is set

Suggested response:

```json
{
  "ok": true,
  "setup_id": "stp_123",
  "status": "pending_user_action",
  "next_action": "open_setup_url",
  "setup_url": "https://clishop.ai/setup/payment?token=...",
  "expires_at": "2026-04-04T19:00:00Z",
  "poll_after_seconds": 5,
  "human_message": "Open this link to securely connect your payment method."
}
```

Implementation note:

- the existing backend `deviceCode` can be used as the first `setup_id`, or wrapped into a cleaner public ID format.

#### `clishop setup status`

Responsibilities:

- accept `--setup-id`
- return the current state without blocking
- if completed, return enough information to let the CLI finalize auth storage locally

Suggested completed response:

```json
{
  "ok": true,
  "setup_id": "stp_123",
  "status": "completed",
  "account_id": "acct_456"
}
```

Practical note:

- if local token installation is still needed on completion, the status response can also include `token`, `refresh_token`, and `user`, or the CLI can call a second finalize step.

#### `clishop setup cancel`

Responsibilities:

- accept `--setup-id`
- mark the setup session as cancelled if still pending
- return stable JSON

Suggested response:

```json
{
  "ok": true,
  "setup_id": "stp_123",
  "status": "cancelled"
}
```

#### `clishop setup wait`

Responsibilities:

- convenience helper only
- timeout-bounded
- safe to interrupt
- identical state model to `setup status`

This command is acceptable for scripts, but it must not be the only supported path.

### Human wrapper behavior

#### `clishop`

Current behavior in [src/index.ts](src/index.ts):

- if no args and setup is incomplete, auto-runs the full wizard.

Proposed behavior:

- if running in an interactive TTY, keep the current friendly wrapper
- internally call `setup start`
- show the URL to the human
- optionally poll using `setup wait`
- if not running in a TTY, do not auto-launch the wizard; print guidance or require explicit subcommands

#### `clishop setup`

Proposed behavior:

- retain as a wrapper for humans
- when interactive, call `setup start`, print the returned URL, then optionally `setup wait`
- when non-interactive, require `setup start` or support `--email --json` directly as a compatibility wrapper

## Command Inventory: Interactive or Human-Blocking Paths

The following commands currently require prompts, open editors, wait for browser completion, or block on human action.

### Setup and payment

#### `clishop`

Current behavior:

- auto-runs setup when no args are supplied and setup is incomplete

Problem:

- hidden side effect
- non-obvious in agent shells

Recommended change:

- only auto-run the human wrapper in interactive TTY mode
- otherwise print a short machine-safe hint to stderr and exit non-zero or show help

#### `clishop setup`

Current behavior:

- prompts for email if missing
- creates account and setup link
- blocks in a polling loop waiting for browser completion

Recommended change:

- split into `setup start/status/cancel/wait`
- keep `clishop setup` as human wrapper only
- add `--json`
- remove implicit blocking from the core contract

#### `clishop payment add`

Current behavior:

- creates payment setup link
- opens browser
- waits for `Press Enter when done...`
- checks for newly added payment method

Recommended change:

- add `payment add --json` to return:
  - `payment_setup_id`
  - `setup_url`
  - `status`
  - `poll_after_seconds`
- add `payment status --setup-id`
- optionally add `payment wait --setup-id --timeout`
- keep the current flow only as an interactive wrapper

### Address commands

#### `clishop address add`

Current behavior:

- fully interactive form
- country resolution loop
- default-address confirmation

Recommended change:

- support full flag-based non-interactive mode:
  - `--label`
  - `--first-name`
  - `--last-name`
  - `--phone`
  - `--line1`
  - `--line2`
  - `--postal-code`
  - `--city`
  - `--region`
  - `--country`
  - `--instructions`
  - `--company-name`
  - `--vat-number`
  - `--set-default`
- add `--json`
- keep prompts only when required fields are missing and the session is interactive
- make country normalization deterministic without requiring a confirm loop when flags are provided

#### `clishop address remove <id>`

Current behavior:

- confirmation prompt

Recommended change:

- add `-y, --yes`
- add `--json`
- no prompt when `--yes` is provided

### Order commands

#### `clishop buy <productIdOrNumber>`

Current behavior:

- may prompt for order confirmation

Recommended change:

- keep `-y, --yes`
- add `--json`
- if confirmation would be required and `--yes` is missing in non-interactive mode, return a stable machine-readable error such as:

```json
{
  "ok": false,
  "error": {
    "code": "human_action_required",
    "message": "Order confirmation is required.",
    "next_action": "rerun_with_yes_or_disable_confirmation"
  }
}
```

#### `clishop order cancel <id>`

Current behavior:

- confirmation prompt

Recommended change:

- add `-y, --yes`
- add `--json`

### Search commands

#### `clishop search <query> --interactive`

Current behavior:

- checkbox selection for requesting more information about products

Recommended change:

- preserve `--interactive` for humans
- add a non-interactive equivalent such as:
  - `clishop search <query> --select 1,4,7 --json`
  - or a follow-up command like `clishop product info <ids...> --json`
- avoid all checkbox prompts in agent mode

### Agent commands

#### `clishop agent update [name]`

Current behavior:

- interactive form for max amount, confirmation requirement, allowed categories, blocked categories

Recommended change:

- support direct flags:
  - `--max-amount`
  - `--require-confirmation`
  - `--no-require-confirmation`
  - `--allowed-categories`
  - `--blocked-categories`
- add `--json`
- keep the interactive form only when invoked without flags in TTY mode

#### `clishop agent delete <name>`

Current behavior:

- confirmation prompt

Recommended change:

- add `-y, --yes`
- add `--json`

### Advertise commands

#### `clishop advertise create`

Current behavior:

- large interactive wizard with multiple prompts, address selection, and payment-method selection

Recommended change:

- keep `advertise create` as human wizard only
- standardize `advertise quick` as the agent-safe contract
- extend `advertise quick` until it supports all fields currently available in the wizard
- add `--json` to `advertise quick`
- optionally add helper discovery flags:
  - `--use-default-address`
  - `--use-all-payment-methods`

#### `clishop advertise accept <advertiseId> <bidId>`

Current behavior:

- confirmation prompt

Recommended change:

- add `-y, --yes`
- add `--json`

#### `clishop advertise reject <advertiseId> <bidId>`

Current behavior:

- confirmation prompt

Recommended change:

- add `-y, --yes`
- add `--json`

#### `clishop advertise cancel <id>`

Current behavior:

- confirmation prompt

Recommended change:

- add `-y, --yes`
- add `--json`

### Support commands

#### `clishop support create <orderId>`

Current behavior:

- interactive category selection
- interactive priority selection
- subject prompt
- editor for long-form message

Recommended change:

- add full flag support:
  - `--category`
  - `--priority`
  - `--subject`
  - `--message`
- keep interactive prompts only when flags are missing and TTY is interactive
- add `--json`
- do not require editor prompts in agent mode

#### `clishop support reply <ticketId>`

Current behavior:

- editor prompt

Recommended change:

- add `--message`
- add `--json`
- only open editor in explicit interactive mode

#### `clishop support close <ticketId>`

Current behavior:

- confirmation prompt

Recommended change:

- add `-y, --yes`
- add `--json`

### Feedback commands

#### `clishop feedback bug`

Current behavior:

- prompts for any missing fields
- editor for reproduction steps

Recommended change:

- retain flag-based mode as the preferred agent-safe contract
- make all required fields explicit and non-interactive:
  - `--title`
  - `--description`
  - `--steps`
  - `--actual`
  - `--expected`
- add `--json`
- if required fields are missing in non-interactive mode, return `invalid_arguments` or `human_action_required`

#### `clishop feedback suggest`

Current behavior:

- prompts for missing fields
- editor for description

Recommended change:

- require `--title` and `--description` in agent mode
- add `--json`
- open editor only in explicit interactive mode

### Review commands

#### `clishop review order <orderId>`

Current behavior:

- asks whether to review each product
- prompts for rating, title, and body for each product
- optionally prompts for store review

Recommended change:

- do not try to preserve this as the agent-safe contract
- instead add non-interactive commands that accept structured input:
  - `clishop review order <orderId> --file reviews.json --json`
  - or `clishop review order <orderId> --reviews '<json>' --json`
- keep the current flow as a human wizard only

#### `clishop review add <productId>`

Current behavior:

- prompts for rating, title, body
- opens editor for body

Recommended change:

- support:
  - `--rating`
  - `--title`
  - `--body`
  - `--order`
  - `--json`

#### `clishop review store <storeId>`

Current behavior:

- prompts for rating, title, body
- opens editor for body

Recommended change:

- support:
  - `--rating`
  - `--title`
  - `--body`
  - `--order`
  - `--json`

#### `clishop review delete <reviewId>`

Current behavior:

- confirmation prompt

Recommended change:

- add `-y, --yes`
- add `--json`

## Cross-Cutting CLI Refactor Recommendations

### Introduce a standard interactivity policy

Every command should follow the same rules:

- if all required data is supplied, run non-interactively
- if required data is missing and stdin is a TTY, prompts are allowed only in human mode
- if required data is missing and stdin is not a TTY, fail with machine-readable JSON or a clear stderr error

### Add a shared `--json` response helper

Create a small response layer so commands can emit:

- success JSON
- stable error JSON
- no accidental logs on stdout

This will prevent every command from re-implementing ad hoc JSON behavior.

### Add a shared `--yes` confirmation helper

Commands that currently block on confirm prompts should standardize on:

- `-y, --yes`

Applies to:

- `address remove`
- `order cancel`
- `advertise accept`
- `advertise reject`
- `advertise cancel`
- `support close`
- `review delete`
- `agent delete`

### Add explicit non-interactive input flags everywhere

Commands currently depending on `inquirer` or editor prompts should grow flag-based equivalents first, then keep prompts only as a human convenience wrapper.

### Detect TTY explicitly

Recommended policy:

- use prompts only when `process.stdin.isTTY && process.stdout.isTTY`
- otherwise force the non-interactive path

This especially matters for OpenClaw and similar shells where the command might appear interactive but should still be treated as machine-controlled.

### Reduce spinner dependence in machine paths

Spinners are not the main problem, but they are unnecessary in agent-safe JSON mode.

Recommended policy:

- no spinners when `--json` is active
- avoid ANSI-heavy output in non-interactive mode

## Suggested Implementation Order

### Phase 1: unblock setup for agents

1. Implement `setup start`
2. Implement `setup status`
3. Implement `setup wait`
4. Implement `setup cancel`
5. Convert current `clishop setup` into a wrapper
6. Make bare `clishop` human-only in TTY mode

### Phase 2: remove the worst remaining human waits

1. Refactor `payment add`
2. Add `--yes` to destructive confirm commands
3. Add non-interactive flags to `address add`
4. Add non-interactive flags to `support create/reply`

### Phase 3: standardize the wider command surface

1. Add shared JSON helpers
2. Add shared confirmation helpers
3. Convert `agent update`, `review add/store`, and `feedback` to fully flag-based contracts
4. Relegate all existing wizards to explicit human-only wrappers

## Summary

The CLI is already close enough structurally to support this change without a rewrite. The biggest issue is not the backend or payment page anymore. The main issue is that setup and several other commands still treat the terminal as the primary UX surface instead of treating stdout/stderr and explicit subcommands as the real contract.

The correct direction is:

- stable resumable commands for agents
- human wrappers layered on top
- explicit JSON mode
- no hidden prompts or human waits in the core path
