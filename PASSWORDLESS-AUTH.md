# Passwordless Auth — CLI Analysis

## Objective

Simplify the CLI setup so an AI agent only needs to **show a single link** to onboard a user. Remove password collection from the setup wizard. Add MCP tools (`setup`, `setup_status`) that agents use to initiate onboarding.

## Why

- AI agents can't (and shouldn't) handle passwords
- Address creation is already a separate MCP tool (`add_address`) that the agent can handle autonomously
- The only step requiring human interaction is linking a payment method (Stripe)
- The CLI setup wizard currently has 5 steps — it should have 1 for agent-driven onboarding

## Expected Functionality

1. **MCP tool: `setup`** — Calls `POST /auth/setup-link` with user's email + name, returns the Stripe URL for the agent to show the user. The agent gives the user this link, they click it, link their card, done.
2. **MCP tool: `setup_status`** — Polls a device code and returns current status. For agents that prefer to control polling themselves.
3. **Simplified `clishop setup` command** — Default path: ask email + name → call setup-link → open browser → poll until complete. No legacy wizard.
4. **Updated `account_status` tool** — Indicates when the user is not authenticated and suggests using the `setup` tool.
5. **Removed `login` and `register` commands** — No password-based auth. All onboarding goes through `setup`.

---

## Detailed Changes

### MCP Server (`src/mcp.ts`)

**Add `setup` tool** (after `account_status`):

```typescript
server.registerTool("setup", {
  title: "Setup",
  description:
    "Onboard a new user by creating their account and generating a Stripe payment setup link. " +
    "The user must open this link in their browser to link their payment method. " +
    "This is the ONLY step requiring human interaction. " +
    "After the user completes the link, call setup_status with the returned deviceCode to get auth tokens. " +
    "The agent can then use add_address to set up shipping autonomously.",
  inputSchema: {
    email: z.string().email().describe("User's email address"),
    name: z.string().describe("User's full name"),
  },
  annotations: {
    title: "Setup",
    readOnlyHint: false,
    openWorldHint: true,
  },
});
```

Implementation:

- Call `POST /auth/setup-link` with `{ email, name }` (no auth header needed — use raw axios)
- Return `{ setupUrl, deviceCode, message: "Ask the user to open setupUrl in their browser to link their payment method." }`

**Add `setup_status` tool:**

```typescript
server.registerTool("setup_status", {
  title: "Setup Status",
  description:
    "Poll the setup status after the user was given a payment link via the setup tool. " +
    "Returns 'pending' while waiting, 'complete' with auth tokens when done, or 'expired' if timed out.",
  inputSchema: {
    deviceCode: z.string().describe("The deviceCode returned by the setup tool"),
  },
  annotations: {
    title: "Setup Status",
    readOnlyHint: true,
  },
});
```

Implementation:

- Call `POST /auth/device/poll` with `{ deviceCode }` (no auth header)
- If `status === "complete"`: store tokens via `storeToken()`, `storeRefreshToken()`, `storeUserInfo()`, return the result
- If `status === "pending"` or `"expired"`: return as-is

**Modify `account_status` tool:**

- When `loggedIn: false`, change the message from `"Run 'clishop login' first."` to: `"Not set up yet. Use the setup tool to onboard the user with a payment link."`

**Modify `buy_product` tool:**

- When no payment method is set, change error from `"Add one first via 'clishop payment add'"` to: `"No payment method linked. Use the setup tool to onboard the user first."`

---

### Auth (`src/auth.ts`)

**Add `storeAuthFromSetup` helper:**

```typescript
export async function storeAuthFromSetup(data: {
  token: string;
  refreshToken: string;
  user: UserInfo;
}): Promise<void> {
  await storeToken(data.token);
  await storeRefreshToken(data.refreshToken);
  await storeUserInfo(data.user);
}
```

---

### API (`src/api.ts`)

For the two unauthenticated calls (`setup-link` and `device/poll`), use raw `axios.post()` directly against the base URL. No need for a full separate client — there are only 2 unauthenticated endpoints.

---

### Setup Command (`src/commands/setup.ts`)

**Restructure `runSetupWizard`:**

Replace the full 5-step wizard with a fork:

```
if (already logged in && has payment method) → "You're all set!"
if (already logged in && no payment method) → just do payment link flow
if (not logged in) → new link flow (only path — no legacy wizard)
```

**New link flow** (the default path):

1. Ask for email + name (or accept via `--email` / `--name` flags)
2. Call `POST /auth/setup-link` with `{ email, name }`
3. Open `setupUrl` in browser
4. Print the URL as fallback
5. Poll `POST /auth/device/poll` every 5 seconds with a spinner
6. On complete: store tokens, mark `setupCompleted: true`
7. Print: `"✓ Payment linked! Your agent can now add addresses and place orders."`

**Keep legacy wizard** as `clishop setup --classic` for users who prefer the full interactive experience.

**Remove address step from the default setup flow.** The agent handles addresses via `add_address`, or the user can do `clishop address add` separately.

---

### Index (`src/index.ts`)

No changes needed — first-run detection already calls `runSetupWizard()`.

---

### Config (`src/config.ts`)

No schema changes needed. The existing `setupCompleted`, `defaultPaymentMethodId`, `defaultAddressId` fields work as-is.

---

### Commands unchanged

- `clishop address add` — unchanged, agent uses this autonomously
- `clishop payment add` — unchanged, works for adding more payment methods after initial setup
- `clishop payment list` — unchanged
- `clishop logout` — clears tokens and resets config
- `clishop whoami` — shows current user info

---

## Agent Flow After Implementation

```
Agent                              CLI/MCP                         User
  │                                   │                              │
  │ call setup                       │                              │
  │ { email, name }                   │                              │
  ├──────────────────────────────────►│                              │
  │                                   │── POST /auth/setup-link ──► Backend
  │                                   │◄── { setupUrl, deviceCode }  │
  │◄──────────────────────────────────┤                              │
  │ { setupUrl, deviceCode }          │                              │
  │                                   │                              │
  │ "Open this link to link           │                              │
  │  your payment method:             │                              │
  │  https://checkout.stripe.com/..." ──────────────────────────────►│
  │                                   │                              │
  │                                   │         User adds card       │
  │                                   │                              │
  │ call setup_status                 │                              │
  │ { deviceCode }                    │                              │
  ├──────────────────────────────────►│                              │
  │                                   │── POST /auth/device/poll ──► Backend
  │                                   │◄── { status: "complete" }    │
  │                                   │    stores tokens locally     │
  │◄──────────────────────────────────┤                              │
  │ { status: "complete", user }      │                              │
  │                                   │                              │
  │ call add_address                  │                              │
  │ { line1, city, country, ... }     │                              │
  ├──────────────────────────────────►│                              │
  │                                   │── POST /addresses ────────► Backend
  │                                   │                              │
  │ ✓ Ready for autonomous ordering   │                              │
```
