<p align="center">
  <h1 align="center">CLISHOP</h1>
  <p align="center">
    <strong>Order anything from your terminal. Built for AI agents and humans.</strong>
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/clishop"><img alt="npm" src="https://img.shields.io/npm/v/clishop?style=flat-square&color=cb3837" /></a>
    <a href="https://clishop.ai"><img alt="Website" src="https://img.shields.io/badge/website-clishop.ai-blue?style=flat-square" /></a>
    <a href="https://discord.gg/vwXMbzD4bx"><img alt="Discord" src="https://img.shields.io/badge/Discord-Join-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  </p>
  <p align="center">
    <a href="#install">Install</a> •
    <a href="#quick-start">Quick Start</a> •
    <a href="#docs">Docs</a> •
    <a href="#mcp-server">MCP Server</a> •
    <a href="#sell-on-clishop">Sell on CLISHOP</a>
  </p>
</p>

---

CLISHOP is an open-source CLI that lets AI agents and humans search for products across multiple stores, compare prices, and place real orders — all from the terminal. No browser. No GUI. Just `stdin`/`stdout`.

```bash
npm install -g clishop
clishop setup
```

## Works with

<p>
  <img alt="VS Code" src="https://img.shields.io/badge/VS%20Code-Copilot-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white" />
  <img alt="Claude" src="https://img.shields.io/badge/Claude-Supported-7C3AED?style=for-the-badge&logo=anthropic&logoColor=white" />
  <img alt="GPT" src="https://img.shields.io/badge/GPT-Supported-10A37F?style=for-the-badge&logo=openai&logoColor=white" />
  <img alt="Gemini" src="https://img.shields.io/badge/Gemini-Supported-4285F4?style=for-the-badge&logo=googlegemini&logoColor=white" />
</p>
<p>
  <img alt="Cursor" src="https://img.shields.io/badge/Cursor-Supported-000000?style=for-the-badge&logo=cursor&logoColor=white" />
  <img alt="Windsurf" src="https://img.shields.io/badge/Windsurf-Supported-0EA5E9?style=for-the-badge" />
  <img alt="AutoGPT" src="https://img.shields.io/badge/AutoGPT-Agent-111827?style=for-the-badge&logo=github&logoColor=white" />
  <img alt="LangGraph" src="https://img.shields.io/badge/LangGraph-Agent-16A34A?style=for-the-badge&logo=langchain&logoColor=white" />
</p>

## Highlights

- **Multi-store search** — Query products across many vendors in one command
- **Extended search** — Real-time queries to vendor stores when the local catalog doesn't have what you need
- **Agent safety profiles** — Spending caps, category restrictions, order confirmation via email or web
- **MCP server** — Native [Model Context Protocol](https://modelcontextprotocol.io/) support with 19 tools for AI agents
- **Non-interactive mode** — Every command works without prompts (flags + `--json` output)
- **Advertise requests** — Can't find it? Publish what you need and let vendors bid
- **Secure payments** — Card details never touch the CLI; payment setup goes through Stripe
- **OS keychain auth** — Tokens stored in the system keychain, not config files

---

## Install

**Requirements:** Node.js ≥ 18

```bash
npm install -g clishop
```

<details>
<summary>From source</summary>

```bash
git clone https://github.com/DavooxBv2/CLISHOP.git
cd CLISHOP
npm install
npm run build
npm link
```

</details>

## Quick Start

```bash
clishop setup                              # Guided wizard: account → agent → address → payment
clishop search "wireless headphones"       # Search across all stores
clishop info 1                             # Get details on result #1
clishop buy 1                              # Buy result #1
clishop order list                         # Check your orders
```

> **Tip:** Use result numbers from a search anywhere — `clishop info 1 2 3` or `clishop buy 2`.

---

## Docs

Use these when you're past the quick start and want the full reference.

**[→ clishop.ai/docs](https://clishop.ai/docs)** — Full documentation with sidebar navigation.

### Getting started

- [Introduction](https://clishop.ai/docs#introduction) — What CLISHOP is and how it works
- [Installation](https://clishop.ai/docs#installation) — npm, source, requirements
- [Setup Wizard](https://clishop.ai/docs#setup-wizard) — Account, agent, address, payment walkthrough
- [Quickstart](https://clishop.ai/docs#quickstart) — Search → info → buy in 60 seconds

### Commands

- [Search & Products](https://clishop.ai/docs#search) — `search`, `info`, `product` with all filter flags
- [Orders](https://clishop.ai/docs#buy) — `buy`, `order list`, `order show`, `order cancel`
- [Agents](https://clishop.ai/docs#agent-overview) — Safety profiles: spending caps, confirmation, category restrictions
- [Addresses](https://clishop.ai/docs#address-list) — Manage shipping addresses
- [Payment Methods](https://clishop.ai/docs#payment-list) — Add/remove cards via Stripe
- [Stores](https://clishop.ai/docs#store-list) — Browse stores and catalogs
- [Advertise](https://clishop.ai/docs#advertise-overview) — Publish requests and accept vendor bids
- [Reviews](https://clishop.ai/docs#review-order) — Rate products and stores
- [Support](https://clishop.ai/docs#support-create) — Open and manage support tickets
- [Feedback](https://clishop.ai/docs#feedback-overview) — Report bugs and suggest features

### MCP Server

- [Overview](https://clishop.ai/docs#mcp-overview) — How the MCP server works
- [VS Code / Copilot](https://clishop.ai/docs#mcp-vscode) — `.vscode/mcp.json` setup
- [Claude Desktop](https://clishop.ai/docs#mcp-claude-desktop) — `claude_desktop_config.json` setup
- [Cursor](https://clishop.ai/docs#mcp-cursor) — `.cursor/mcp.json` setup
- [Windsurf](https://clishop.ai/docs#mcp-windsurf) — `~/.windsurf/mcp.json` setup
- [All 19 MCP Tools](https://clishop.ai/docs#mcp-tools) — Full tool reference

### Reference

- [Configuration](https://clishop.ai/docs#config-show) — `config show`, `config reset`, `status`
- [Error Codes](https://clishop.ai/docs#error-codes) — Exit codes and error handling
- [Environment Variables](https://clishop.ai/docs#environment-variables) — Override defaults
- [Global Options](https://clishop.ai/docs#global-options) — `--json`, `--agent`, `--output`
- [FAQ](https://clishop.ai/docs#faq) — Common questions

---

## MCP Server

CLISHOP ships as a native MCP server with 19 tools. Any MCP-compatible client (VS Code, Claude Desktop, Cursor, Windsurf) gets shopping capabilities out of the box.

```bash
clishop-mcp              # If installed globally
npx -y clishop --mcp     # Or run without installing
```

> **Prerequisite:** Log in once with `clishop login` before using MCP tools.

See the [MCP setup guides](https://clishop.ai/docs#mcp-overview) for client-specific configuration.

---

## For AI Agents

Every command supports non-interactive flags and `--json` output:

```bash
echo "<password>" | clishop login --email user@example.com --password-stdin
clishop search "wireless headphones" --json
clishop buy 1 -y --agent shopping-bot
clishop order list --json
```

Create scoped agents with spending caps:

```bash
clishop agent create shopping-bot --max-amount 50 --require-confirm
```

Errors go to `stderr`, JSON to `stdout`. Exit code `0` = success, `1` = error.

See [the full agent docs](https://clishop.ai/docs#agent-overview) for all options.

---

## Sell on CLISHOP

Want to sell your own products through CLISHOP? Use the [Dark Store](https://github.com/DavooxBv2/CLISHOP-DARKSTORE) template to create your own store — no website needed. Configure your catalog, shipping, and pricing in a few YAML files, deploy to Vercel, and start receiving orders.

---

## Architecture

```
┌─────────────────────────────┐
│  AI Agent / Script / Human  │
└──────────────┬──────────────┘
               │
       ┌───────▼───────┐
       │  CLISHOP CLI   │  ← this repo
       │  (Node.js)     │
       └───────┬───────┘
               │ HTTPS
       ┌───────▼───────┐
       │  CLISHOP API   │  ← clishop-backend (Vercel)
       │                │
       └───────┬───────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
 Store A    Store B    Store C   ← vendor stores (or your own Dark Store)
```

## Development

```bash
git clone https://github.com/DavooxBv2/CLISHOP.git
cd CLISHOP && npm install
npm run dev -- search "headphones"   # Dev mode
npm run build                        # Production build
npm run lint                         # Type-check
```

## Contributing

Contributions welcome! Please open an issue first to discuss.

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit (`git commit -m 'feat: add my feature'`)
4. Push (`git push origin feat/my-feature`)
5. Open a Pull Request

## Links

- 🌐 **Website:** [clishop.ai](https://clishop.ai)
- 📖 **Docs:** [clishop.ai/docs](https://clishop.ai/docs)
- 💬 **Discord:** [discord.gg/vwXMbzD4bx](https://discord.gg/vwXMbzD4bx)
- 📦 **npm:** [npmjs.com/package/clishop](https://www.npmjs.com/package/clishop)
- 🏪 **Dark Store:** [github.com/DavooxBv2/CLISHOP-DARKSTORE](https://github.com/DavooxBv2/CLISHOP-DARKSTORE)
- 📄 **Terms:** [clishop.ai/terms](https://clishop.ai/terms)
- 🔒 **Privacy:** [clishop.ai/privacy](https://clishop.ai/privacy)

## License

[MIT](LICENSE)
