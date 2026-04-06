# CLISHOP for OpenClaw

Install the published bundle into an OpenClaw workspace with:

```bash
openclaw plugins install clawhub:clishop
```

This bundle adds:

- the CLISHOP shopping skill
- default MCP configuration that launches `npx -y clishop@1.5.7 --mcp`
- explicit Claude/OpenClaw bundle metadata so the installed plugin registers as `clishop`

After install, restart OpenClaw or start a new session.

## What it does

CLISHOP lets agents and users search products across connected stores, compare offers, place orders, manage addresses and payment methods, submit reviews, create support tickets, and work with spending-limit based agent profiles.

## Authentication

Use the CLISHOP setup flow with your email address. The underlying CLI stores session tokens in the OS keychain when available and falls back to local file storage when needed.

## Safety

CLISHOP can perform real purchase flows. Use confirmation requirements, conservative spending limits, and a dedicated agent profile when testing autonomous actions.

## More

- Website: https://clishop.ai
- Docs: https://clishop.ai/docs
- npm runtime: https://www.npmjs.com/package/clishop