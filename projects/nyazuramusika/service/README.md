# NyazuraMusika service

Cloudflare Workers / Vinext service for the NyazuraMusika Android marketplace. D1 stores Google accounts, roles, sessions, goods, private live-check signaling and purchase records. R2 stores seller-selected product photos.

Use the retained pnpm lockfile. Configure logical bindings `DB` and `BUCKET` and apply all Drizzle migrations in order. Run `pnpm exec tsc --noEmit`, `node tests/marketplace.mjs` and `pnpm build`.

Runtime variables: `MARKET_ORIGIN`, `GOOGLE_CLIENT_ID`, secret `GOOGLE_CLIENT_SECRET`, and `ADMIN_GOOGLE_EMAILS`. Optional relay variables: `TURN_KEY_ID` and secret `TURN_API_TOKEN`. Secrets stay on the server. New Google accounts are users; seller registration and admin changes are enforced by the service. Existing ChatGPT accounts are retained but excluded from Google authentication and listings.

Google setup and public service activation are required for Android access. The current service audience remains owner-private. Private live calls use browser cookies restricted to one room; they cannot authenticate other routes. The backend verifies Google token signatures/claims and native PKCE before creating an app session.

EcoCash functionality is a direct external-app/USSD handoff plus purchase records. No PIN is requested, no funds are sent or held, and no automatic wallet-to-wallet integration is connected. Receipts are seller-confirmed records, labelled as not independently verified by EcoCash. Automated transfer support requires the provider's approved API contract and credentials.

Complete project setup and API documentation are in the parent project's `docs/` directory on GitHub.
