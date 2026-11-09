# Design QA — PEBISNIS DIGITAL /akses

Reference: user-provided Instagram dark-profile screenshot, 1474 × 821.

## Visual checks

- PASS — Dark near-black full-viewport background, white profile title and bio.
- PASS — Circular Pebisnis Digital identity mark and compact horizontal profile statistics.
- PASS — Two wide dark profile buttons and round category highlights.
- PASS — Five-tab navigation and edge-to-edge five-column square image grid on desktop.
- PASS — Clickable grid opens an Instagram-like two-column image + readable material overlay.
- PASS — Desktop screenshot review against the supplied layout; spacing refined after review.
- PASS — Responsive breakpoints include three-column mobile grid, compact profile and bottom navigation.

## Functional checks

- PASS — Opened the production /akses URL in an unauthenticated public browser session.
- PASS — Clicking EPS 365 opened complete material with no sign-in or comment requirement.
- PASS — Searching for 365 filtered episode cards by number/title.
- PASS — Material reading uses native text, not hidden comments or image-only content.
- PASS — Public Supabase client intentionally has no persistent admin session.
- PASS — TypeScript and Next.js production build.

## Data integration boundary

- Currently 155 original episode texts (EPS 211–365) are bundled as a public fallback, with their original doodle-style illustrations regenerated on the client.
- The remaining existing EPS 1–210 are still behind Supabase admin-only row-level security. The migration at `supabase/migrations/20261110000100_public_akses_read_only.sql` prepares a **limited read-only** public RPC and image policy; it has **not been applied** to the live Supabase project because the matching project is not available in the currently connected Supabase accounts.
- Once applied, /akses will read all ACTIVE entries from the calendar, including their existing image paths, without authentication and without exposing orders, subscribers or unrestricted admin tables.

**Design QA result: PASSED. Full 365-entry data sync: PENDING Supabase connection/migration.**
