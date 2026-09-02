# Security Policy

## Reporting a vulnerability

Please report security issues **privately**, not as public GitHub issues.

- Preferred: GitHub private vulnerability reporting on this repository
  (the **Security** tab -> **Report a vulnerability**).
- Alternative: email support@wearewarp.com with "security" in the subject.

We aim to acknowledge reports within 3 business days and to keep you updated
through remediation. We are happy to coordinate disclosure timing and to credit
you in the release notes and the published advisory.

## Supported versions

The latest version published on npm is the supported version. Fixes ship in a
new release; please upgrade to the latest.

## Acknowledgments

We thank the researchers who have responsibly disclosed valid issues:

- **Syed Anas Mohiuddin** (maintainer of mcp-safeguard) — commodity-policy
  enforcement gap across quote tools, missing ZIP-format and US-domestic
  validation on `book`/`batch_book`, missing stop-ZIP verification in
  `multistop_book`, and an output-escaping issue in the bookings card widget
  (2026, fixed in 0.19.3).
