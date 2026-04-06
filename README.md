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
</p>

---

CLISHOP is an open-source CLI that lets AI agents and humans search for products across multiple stores, compare prices, and place real orders — all from the terminal. Anyone can sell on CLISHOP using a [Dark Store](https://github.com/DavooxBv2/CLISHOP-DARKSTORE).

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

- One query searches every store in the network. Results are filtered to what actually ships to your address.
- Set spending caps per order, require email confirmation before anything ships, or let it go through automatically — your call.
- Ships as a native [MCP server](https://modelcontextprotocol.io/) with 46 tools. Works with VS Code Copilot, Claude, Cursor, Windsurf, and anything else that speaks MCP.
- Can't find what you need? Post an advertise request and let vendors compete to fulfill it.
- Support tickets, product reviews, store reviews — all from the terminal.
- Anyone can sell on CLISHOP by deploying a [Dark Store](https://github.com/DavooxBv2/CLISHOP-DARKSTORE). No website needed.

---

## Install

Requires **Node.js ≥ 18**. Works on macOS, Windows, and Linux/WSL.

```bash
npm install -g clishop
```

This gives you two commands: `clishop` (the CLI) and `clishop-mcp` (the MCP server for AI agents).

### OpenClaw

Once the ClawHub package is published, install CLISHOP into an OpenClaw workspace with:

```bash
openclaw plugins install clawhub:clishop
```

The bundle exposes the CLISHOP skill under `skills/clishop/SKILL.md` and merges the packaged MCP defaults from `.mcp.json` so OpenClaw can launch the bundled CLISHOP MCP runtime locally without fetching npm code at startup.

### Linux / WSL

CLISHOP works out of the box on Linux and WSL. On systems without a native keychain, tokens are stored in a local file (`~/.config/clishop/auth.json`) with restricted permissions.

For native keychain support (optional):

```bash
sudo apt install libsecret-1-0
```

Run `clishop doctor` to check your system's compatibility.

### From source

```bash
git clone https://github.com/DavooxBv2/CLISHOP.git
cd CLISHOP
npm install
npm run build
npm link
```

## Quick Start

You can create your account on [clishop.ai](https://clishop.ai) or do everything from the CLI.

### Setup

Setup only needs an email address. Search first, then add your address and payment method when you're ready to buy.

For OpenClaw, MCP clients, Claude-style shells, and other tool runners, use:

```bash
clishop setup start --email user@example.com --json
```

`setup start` returns immediately with account-ready status and stores auth locally.

In OpenClaw, prefer the installed CLISHOP MCP tools over CLI shell commands. For address management, the intended flow is to call `list_addresses` first, then `add_address` non-interactively with any known fields, and ask the user only for missing required address fields (`label`, `firstName`, `lastName`, `line1`, `city`, `postalCode`, `country`).

- Search products right away with `clishop search <query>`
- Add a shipping address later with `clishop address add`
- Add a payment method later with `clishop payment add`

After setup is complete, add a shipping address and start ordering:

```
$ clishop search "wireless headphones"

  🔍 Search results for "wireless headphones"

  1  Sony WH-1000XM5                           $278.00
     SUPERSTORE · ★ 8.1 · Free shipping · 3-5 days

  2  JBL Tune 770NC Wireless                    $79.95
     EveryMarket · ★ 7.9 · $5.99 shipping · 5-8 days

```

```
$ clishop info 1

  Sony WH-1000XM5
  ─────────────────────────────────────
  Price:       $278.00
  Store:       SUPERSTORE (★ 8.1)
  Shipping:    Free · 3-5 business days
  Returns:     30-day free returns
  In stock:    Yes

  Industry-leading noise cancellation with
  Auto NC Optimizer. 30-hour battery life.
  Multipoint connection for two devices.
```

```bash
clishop buy 1
```

> **Tip:** use result numbers from a search anywhere — `clishop info 1 2 3` or `clishop buy 2`.

### Diagnostics

If something isn't working, run:

```bash
clishop doctor
```

This checks keychain availability, token storage, authentication status, and API connectivity.

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
       │  CLISHOP API   │  ← backend (Vercel)
       └───────┬───────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
 Store A    Store B    Store C   ← vendor Dark Stores
```

---

## Sell on CLISHOP

You can run your own store with the [Dark Store](https://github.com/DavooxBv2/CLISHOP-DARKSTORE) template. Define your catalog, shipping rules, and pricing in YAML, deploy to Vercel, and you're live. No website needed.

---

## Development

```bash
git clone https://github.com/DavooxBv2/CLISHOP.git
cd CLISHOP && npm install
npm run dev -- search "headphones"   # Dev mode (no build needed)
npm run build                        # Production build
npm run lint                         # Type-check
```

---

## MCP Server

CLISHOP ships as a native MCP server with 46 tools. Any MCP-compatible client gets shopping capabilities out of the box.

```bash
clishop-mcp              # If installed globally
node ./dist/mcp.js       # From the installed package directory
```

The MCP onboarding tools now follow the same email-first model:

- `setup` creates the account immediately from the email address
- `setup_status` remains available only for legacy setup IDs

See the [MCP setup guides](https://clishop.ai/docs#mcp-overview) for VS Code, Claude Desktop, Cursor, and Windsurf configuration.

---

## Docs

Full command reference, agent configuration, search filters, and more:

**[→ clishop.ai/docs](https://clishop.ai/docs)**

---

## Links

- 🌐 [clishop.ai](https://clishop.ai)
- 📖 [Docs](https://clishop.ai/docs)
- 💬 [Discord](https://discord.gg/vwXMbzD4bx)
- 🏪 [Dark Store](https://github.com/DavooxBv2/CLISHOP-DARKSTORE)

## License

[MIT](LICENSE)
