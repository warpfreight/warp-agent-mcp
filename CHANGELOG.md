# Changelog

## 0.22.0 — FedEx parcel

- `parcel_quote`: FedEx rates for small packages on US lanes through Warp's
  Freight API (`POST /api/v1/parcel/options`). Returns every option, each
  service level once per pickup type (`fedex_pickup` / `dropoff`). Requires a
  signed-in account.
- `parcel_book`: books the chosen option (`POST /api/v1/parcel/book`) with the
  same "pending is not failed" handling as `book`. Parcel quote ids book only
  through `parcel_book`.
- Server instructions and the workflow rules name `parcel_book` as a booking
  tool that needs explicit user confirmation.
- e2e tool list now includes `price_check`, which was missing.

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
