# NyazuraMusika

A native Android marketplace for buying and selling goods around Nyazura. Built with Java, a Cloudflare Workers service, D1 and R2. Version 1.1 adds Google accounts, server-enforced roles, live inspection, saved goods and EcoCash purchase records.

[Download the Android test APK](https://github.com/ShagyMunya/brian-shagaya-portfolio/raw/refs/heads/main/projects/nyazuramusika/downloads/NyazuraMusika.apk)

**Current deployment:** the shared service is public and Google OAuth credentials are configured on the server as of 5 October 2026. Start sign-in from the Android app's **Sign in with Google** button. A complete Google account login and return to Android still need device testing; an automated browser could not open the site. Live video needs two-device testing and TURN credentials for networks requiring a relay.

## Account roles

Every marketplace account signs in with Google. New accounts start as users. Admin access comes from a verified, server-configured owner email on first registration or an existing admin's explicit role change.

| Role | Permissions |
| --- | --- |
| User | Browse, save goods, contact sellers, request a private live check, prepare a purchase, submit a payment reference and view own receipts. |
| Seller | User features plus a public seller profile, own photos and goods, live-check responses, and confirmation of money received for own sales. |
| Admin | Seller features plus an account and listing dashboard, role assignment, account suspension/restoration and listing moderation. |

Roles and suspension are read from the server for each request. Client-side role labels grant no permissions. Admin changes are audited; an admin cannot remove or suspend their own access. Older ChatGPT sessions cannot authenticate the upgraded app.

## Distinctive features

- **See before paying:** a buyer requests a private live video check; the seller accepts and shows the goods through their camera. The buyer confirms their own inspection before preparing a purchase.
- **Saved goods:** an account-specific shortlist of goods to revisit.
- **Direct EcoCash handoff:** the purchase records the seller's receiving number, item, exact amount and currency. Android opens the official EcoCash Super App or the dialler for *151#. The buyer completes the transfer within EcoCash.
- **Transparent payment states:** a buyer-submitted reference stays pending until the seller checks their own wallet and confirms receipt.
- **Printable records:** buyer and seller can print or save a PDF after seller confirmation. It is labelled “Seller-confirmed payment record” and states that EcoCash has not independently verified it.

NyazuraMusika never requests an EcoCash PIN, transfers funds, holds a balance or reads SMS messages. There is no automatic peer-to-peer API integration in this build. Automated transfers and provider-verified receipts require EcoCash's approved API contract, developer credentials and a supported settlement route directly to each seller. Paynow's merchant collection flow must not be described as arbitrary wallet-to-wallet transfer.

## Run and configure

See [setup and activation](docs/SETUP.md), [build instructions](docs/BUILD.md) and [API contract](docs/API.md).

The service requires D1 `DB`, R2 `BUCKET` and all generated migrations. Google secrets belong on the server, never in the Android APK or GitHub. The app asks only for internet permission; the browser asks for camera/microphone permission when joining a live check.

## Validation and limitations

Automated checks cover Google signatures and claims, OAuth replay protection, native PKCE, roles, suspension, ownership, private call access, exact prices, duplicate purchase protection and receipt states. Android builds and price/phone tests run in GitHub Actions. The Google provider handoff, actual two-phone video, EcoCash app handoff and print dialog still need physical-device testing after configuration. No real financial transaction was made during development.

This is an early version built with AI assistance. Live-check inboxes refresh manually. Buyer inspection is the buyer's own statement; seller payment confirmation is the seller's own statement. Listings, records and stored photos remain until removed or cleaned up by the owner. Use the original EcoCash confirmation as the authoritative payment evidence.
