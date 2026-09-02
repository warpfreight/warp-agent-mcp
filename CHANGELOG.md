# Changelog

## 0.19.3 — Security

Security fixes (reported by Syed Anas Mohiuddin, maintainer of mcp-safeguard):

- Enforce the perishable/reefer commodity policy (`checkCommodity`) across all
  commodity-accepting quote tools (`van_quote`, `box_truck_quote`, `ftl_quote`,
  `ltl_quote`, `ltl_market_options`, and per-lane in `batch_quote`), not just
  `compare_modes` and `multistop_quote`.
- Add 5-digit ZIP validation and the US-domestic (`isCanadianPostal`) guard to
  `book` and `batch_book` address handling, matching the quote tools.
- Verify each `multistop_book` leg's ZIP against the quoted stop sequence.
- HTML-escape city/state (`cityState`) in the bookings confirmation card widget.

Also added `SECURITY.md` and enabled GitHub private vulnerability reporting.
