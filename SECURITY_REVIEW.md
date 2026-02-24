# Security Review & Public npm Readiness (CLISHOP CLI)

## Scope
This review covers the current CLI repository (`src/**`, `package.json`, `README.md`) with focus on:

- Authentication and token handling
- Backend connectivity and transport security
- Local data handling (config/secrets)
- Risks for publishing as a public npm CLI

## Current Security Model

### 1) Authentication + session storage
- Login and registration send credentials directly to backend endpoints (`/auth/login`, `/auth/register`) using Axios. The backend returns an access token, optional refresh token, and user profile.
- Access and refresh tokens are stored in the OS keychain via `keytar` (`service=clishop`, accounts: `auth-token`, `refresh-token`).
- User profile JSON is also persisted in keychain as `user-info`.
- API requests attach `Authorization: Bearer <token>` via Axios request interceptor.
- On `401`, CLI attempts token refresh (`/auth/refresh`) and retries the original request.

### 2) Backend connection model
- API base URL defaults to `https://clishop-backend.vercel.app/api`.
- There are currently *two* base URL sources:
  - `src/auth.ts` uses `config.get("apiBaseUrl")`
  - `src/api.ts` uses `process.env.CLISHOP_API_URL || hardcoded default`
- This split can cause auth and data requests to hit different environments if values diverge.

### 3) Local configuration
- Non-secret app configuration is stored via `conf` (agent profiles, output mode, active agent, setup flag, API URL).
- Agent profiles are safety/guardrail features (max order amount, category allow/deny lists, confirmation toggle), not security boundaries.

## Key Risks Identified

1. **Credential exposure via CLI flags**
   - `login --password <password>` allows secrets in shell history and process listing.

2. **Inconsistent base URL source of truth**
   - Auth and API modules use different base URL derivation paths.
   - Misconfiguration could leak credentials/tokens to an unintended backend.

3. **Refresh token handling is implicit and untyped**
   - Refresh flow assumes `{ token }` response shape without schema validation.

4. **No explicit certificate/public-key pinning**
   - Relies on platform TLS trust store only (normal for many CLIs, but higher assurance may be needed for payment-adjacent flows).

5. **No dependency-audit gate in CI (in this repo)**
   - Public npm packages should enforce vulnerability checks in CI and release pipeline.

6. **Missing supply-chain publication controls (repo-level)**
   - No visible npm provenance/signing/release hardening in this repository.

## Required Changes Before Public npm Launch

### High priority (must-do)

1. **Unify API base URL resolution**
   - Single helper (e.g., `getApiBaseUrl()`) used by both `auth.ts` and `api.ts`.
   - Enforce precedence order consistently (explicit CLI config override vs env override, whichever policy you choose).

2. **Deprecate plaintext password flag for automation-safe auth**
   - Keep interactive masked prompt as default.
   - Add `--password-stdin` or device-code/browser auth flow for non-interactive use.
   - If `--password` remains, print a warning about shell/process exposure.

3. **Add input/output schema validation for auth responses**
   - Validate token fields and expected shape before storage/retry.
   - Fail closed on malformed responses.

4. **Add secure release workflow**
   - npm 2FA for publish.
   - Trusted publishing / provenance (`npm publish --provenance` via GitHub Actions OIDC).
   - Protect main/release branches + signed tags.

5. **Add CI security gates**
   - `npm audit` (or osv/sca equivalent) + dependency review on PR.
   - Secret scanning (e.g., Gitleaks) + CodeQL/SAST.

### Medium priority

6. **Harden token lifecycle**
   - Consider storing token metadata (`issuedAt`, `expiresAt`) and proactive refresh before expiry.
   - Rotate/clear tokens on repeated refresh failures.

7. **Strengthen transport controls**
   - Restrict allowed API URL patterns for production builds (e.g., allowlist domains unless explicitly `--insecure-dev`).
   - Warn when using non-HTTPS endpoints.

8. **Threat-model docs + disclosure process**
   - Add `SECURITY.md` with reporting channel, support window, and dependency update policy.

### Nice-to-have

9. **Telemetry/privacy posture (if added later)**
   - Explicit opt-in, redaction of identifiers/tokens, and documented retention.

10. **Runtime integrity checks**
   - Add optional command to verify backend certificate/metadata expectations for enterprise deployments.

## Practical Publication Checklist

- [ ] Add `SECURITY.md` and vulnerability disclosure contact.
- [ ] Add CI workflow: lint, build, tests, dependency audit, secret scan.
- [ ] Add release workflow with npm provenance + 2FA enforcement.
- [ ] Add/verify `.npmignore` or `files` whitelist in `package.json` (publish only `dist`, docs, license).
- [ ] Ensure no secrets/tokens/logging of sensitive headers.
- [ ] Add auth method safe for bots (`--password-stdin` or device flow).
- [ ] Unify backend URL configuration and document precedence clearly.

## Bottom Line
The project already has a solid baseline for a CLI (keychain token storage, bearer auth, refresh flow, HTTPS default). For public npm release, the biggest gaps are **operational security and supply-chain hardening** plus **credential UX hardening** (`--password` exposure) and **base URL consistency**.
