# Security Policy

## Reporting a Vulnerability

If you discover a security issue in CLISHOP CLI, please report it privately:

- Open a private security advisory on GitHub (preferred), or
- Contact the maintainers via repository security contact.

Please include:
- A clear description of the issue
- Reproduction steps / proof of concept
- Potential impact
- Suggested remediation (if available)

## Security Expectations

- Never commit secrets or tokens.
- Use OS keychain-backed credentials where available.
- Prefer secure non-interactive auth methods over plaintext CLI arguments.
- Keep dependencies up to date and monitor advisories.
