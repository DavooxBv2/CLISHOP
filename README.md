CLISHOP (CLI)

This repository contains the CLISHOP command-line interface.

The CLI is the primary tool for buyers to:

authenticate to CLISHOP,

manage ordering-related profile data (as supported by the platform),

search/quote/buy items through CLISHOP’s backend,

view order history and track shipments,

get a consistent, scriptable interface to ordering workflows.

The CLI is a client. It does not own the database, vendor integrations, or order orchestration logic. It talks to CLISHOP-BACKEND over HTTPS APIs.

What this repo is responsible for
Buyer experience in the terminal

A fast, ergonomic command set for ordering workflows

Human-friendly interactive output (and optional JSON output for scripting)

Clear confirmation prompts and safety messaging before irreversible actions

A consistent UX across platforms (macOS/Linux/Windows, as supported)

Authentication and session handling

Provides a login flow that authenticates the user with the CLISHOP platform

Maintains a local authenticated session (token handling and refresh as applicable)

Supports logout and account/session inspection

Note: authentication details (OIDC/device flow/etc.) are platform decisions owned by the backend. The CLI implements the client-side portion.

API client usage

The CLI calls CLISHOP-BACKEND endpoints to:

search and retrieve offers

request quotes

place orders

fetch order status and history

fetch tracking updates

The CLI should never talk directly to vendor systems.

Local configuration

Stores non-sensitive CLI preferences (output format, default address/profile, etc.)

Keeps secrets/tokens in the platform-appropriate secure store (where applicable)

Supports configuration via environment variables for automation

What this repo is not responsible for

Storing or managing the source-of-truth order database

Implementing vendor integrations/connectors

Handling payment card data (the CLI should never collect raw card details)

Running background order workflows (that happens in CLISHOP-BACKEND)

Shared contracts

The CLI depends on versioned packages published by CLISHOP-BACKEND:

@clishop/types
Shared types/schemas derived from the backend’s canonical API contract.

@clishop/buyer-client
A typed API client used by the CLI to call the backend consistently.

These packages are the mechanism that keeps the CLI aligned with the backend API as it evolves.

Relationship to other CLISHOP repositories

CLISHOP-BACKEND: the API + orchestration service the CLI calls

CLISHOP-WEB: the website/dashboard for users and (optionally) vendor portal UI

CLISHOP-VENDORSDK: tools and SDK for vendors integrating with CLISHOP