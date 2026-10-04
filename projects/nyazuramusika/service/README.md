# NyazuraMusika shared service

The Android marketplace API uses Cloudflare D1 for seller profiles, authorization codes, expiring app sessions and listings, and R2 for product photos. The database starts empty; no test listings are deployed.

`lib/marketplace.ts` implements the API. `db/schema.ts` and the generated `drizzle/` files define the schema. `app/android/connect/page.tsx` handles the return from dispatch-owned ChatGPT sign-in.

## Local development and verification

Use Node 22.13 or later and the supplied pnpm lockfile. Install dependencies with `node scripts/install-ci.mjs`, then generate migrations with `pnpm db:generate` when the schema changes. Run `node tests/marketplace.mjs` for integration checks and `pnpm build` to build the Worker. The integration tests use isolated local D1 and R2 storage; they do not write production goods or accounts.

The browser sign-in page requires Sites dispatch-owned identity headers. Local API tests call the internal code-issuance helper to represent authenticated identities; this helper is never an anonymous HTTP endpoint. A self-hosted fork must supply a verified identity integration before exposing that page.

## Deployment

The exported `.openai/hosting.json` declares only logical DB and BUCKET bindings. It contains no existing Site identity or credentials. Register a separate Site for a fork and let Sites provision its bindings and apply the checked-in migrations. Browser-owned authentication does not require an app password database.

The original marketplace service is deployed as an owner-private preview. Public access is a separate activation step so Android buyers can reach public read endpoints without an owner session. Do not put a private Sites service credential in the APK to bypass that boundary.

Applied migration files and their matching metadata must remain immutable; create additional migrations for future changes.
