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
- Ships as a native [MCP server](https://modelcontextprotocol.io/) with 44 tools. Works with VS Code Copilot, Claude, Cursor, Windsurf, and anything else that speaks MCP.
- Can't find what you need? Post an advertise request and let vendors compete to fulfill it.
- Support tickets, product reviews, store reviews — all from the terminal.
- Anyone can sell on CLISHOP by deploying a [Dark Store](https://github.com/DavooxBv2/CLISHOP-DARKSTORE). No website needed.

---

## Install

Requires **Node.js ≥ 18**.

```bash
npm install -g clishop
```

This gives you two commands: `clishop` (the CLI) and `clishop-mcp` (the MCP server for AI agents).

To install from source instead:

```bash
git clone https://github.com/DavooxBv2/CLISHOP.git
cd CLISHOP
npm install
npm run build
npm link
```

## Quick Start

You can create your account on [clishop.ai](https://clishop.ai) or do everything from the CLI:

```bash
clishop setup
```

The setup wizard walks you through creating an account, adding an address, and linking a payment method. After that:

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

CLISHOP ships as a native MCP server with 44 tools. Any MCP-compatible client gets shopping capabilities out of the box.

```bash
clishop-mcp              # If installed globally
npx -y clishop --mcp     # Without installing
```

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
