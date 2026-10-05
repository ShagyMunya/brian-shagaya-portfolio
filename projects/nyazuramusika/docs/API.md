# NyazuraMusika API

JSON responses use `Cache-Control: no-store`. Errors use `{"error":"message"}`. All marketplace reads and writes require `Authorization: Bearer <app session>` from a verified Google sign-in. Public endpoints are limited to health and authentication. App tokens and codes are random; only hashes are stored. Account roles and suspension are checked in the database on every request.

## Authentication

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Storage health and whether Google is configured. |
| GET | `/api/auth/config` | Google configuration readiness. |
| GET | `/api/auth/google/start?challenge=...&state=...` | Start Google browser sign-in. Uses a separate browser-bound OAuth state, nonce and Google PKCE. |
| GET | `/api/auth/google/callback` | Validate callback cookie/state, exchange code on the server, verify Google JWT and show a short-lived Android return link. |
| POST | `/api/auth/exchange` | Exchange one-use app code with its Android verifier and state. Returns token, expiry and account. |
| POST | `/api/auth/logout` | Revoke current app session. |

The Google client secret stays on the server. Google JWT validation checks RS256 signature, issuer, audience, expiry, issued time, nonce, verified email and authorized party. Email, role or OpenAI identity headers sent by a client cannot create an account. Admin bootstrap applies only on first registration for configured authoritative Google emails.

## Accounts and goods

| Method | Path | Access |
| --- | --- | --- |
| GET / PUT | `/api/me` | Own Google account / profile. Profile updates cannot change role, status, identity or email. |
| POST | `/api/me/seller` | Register own active account as a seller with display name, WhatsApp and optional EcoCash receiving number. |
| GET | `/api/categories` | Any signed-in account. |
| GET | `/api/listings` | Signed-in search (`q`, `category`, `location`, `limit`, `offset`). Active Google seller/admin accounts only. |
| GET | `/api/listings/{id}` | Visible active/sold goods. |
| POST | `/api/listings` | Seller/admin with complete seller profile. |
| PUT / DELETE | `/api/listings/{id}` | Owning seller/admin. |
| GET | `/api/my-listings` | Own goods; seller/admin only. |
| POST | `/api/images` | Seller/admin JPEG or PNG upload, max 800 KB. |
| GET | `/api/images/{id}` | Signed-in photo of visible goods. |
| GET | `/api/favorites` | Own saved goods. |
| POST / DELETE | `/api/favorites/{listingId}` | Save/remove own shortlist entry. |

Money is stored in integer minor units. Listing status is `active`, `sold` or `removed`. Google email and EcoCash receiving number are not exposed in listing search responses. EcoCash receiving numbers are copied into private purchase records. Removed or suspended sellers' goods and photos are hidden.

## Admin

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/admin/overview` | Role, suspension and listing counts. |
| GET | `/api/admin/accounts` | Search/paginate accounts. |
| PUT | `/api/admin/accounts/{id}` | Set `role` (`user`, `seller`, `admin`) or `account_status` (`active`, `suspended`). |
| GET | `/api/admin/listings` | Search/paginate all goods. |
| PUT | `/api/admin/listings/{id}` | Moderate status. |

All admin endpoints require a current stored admin role. Account/listing changes are audited atomically. Admins cannot demote or suspend themselves. Suspension revokes all app sessions and pending app codes; restoring an account does not revive those sessions.

## Private live checks

| Method | Path | Purpose |
| --- | --- | --- |
| GET / POST | `/api/live-checks` | Own inbox / request a seller's available goods. |
| POST | `/api/live-checks/{id}/respond` | Seller accepts or declines. |
| POST | `/api/live-checks/{id}/ticket` | Participant creates a one-use browser join link. |
| GET | `/api/live-checks/open?ticket=...` | Consume ticket, create scoped browser cookie and redirect to the live room. |
| GET | `/api/live-checks/{id}/state` | Participant signaling state. |
| POST | `/api/live-checks/{id}/signals` | Buyer offer, seller answer or bounded ICE candidate. |
| GET | `/api/live-checks/{id}/ice` | STUN and optional short-lived TURN configuration. |
| POST | `/api/live-checks/{id}/end` | Participant ends call. |
| POST | `/api/live-checks/{id}/complete` | Buyer confirms their inspection after both offer and answer. |

Requests expire after 30 minutes, join tickets after two minutes, and browser sessions after 20 minutes. Browser cookies authenticate only their exact live check, depend on the parent app session and require same-origin writes. Admin status does not grant access to other people's calls. Video/audio are not stored. Inspection is buyer-reported, not an independent guarantee of goods or delivery.

## EcoCash purchase records

| Method | Path | Purpose |
| --- | --- | --- |
| GET / POST | `/api/orders` | Own purchases/sales / prepare purchase after buyer-confirmed inspection. |
| GET | `/api/orders/{id}` | Buyer/seller record. |
| POST | `/api/orders/{id}/report` | Buyer submits `payment_reference`; status becomes `buyer_reported`. |
| POST | `/api/orders/{id}/confirm` | Receiving seller sets `checked_wallet:true` after independently checking EcoCash; status becomes `seller_confirmed`. |
| POST | `/api/orders/{id}/cancel` | Cancel only an unpaid purchase. |
| GET | `/api/orders/{id}/receipt` | Seller-confirmed record; unavailable before seller confirmation. |

Preparing a purchase sends `live_check_id`, `client_request_id`, `expected_price_minor` and `expected_currency`. References are idempotent for the same buyer/check. Seller-confirmed references are unique for each recipient number. Amount, currency, names and recipient are snapshots; profile changes cannot redirect an existing purchase.

**No transfer API is connected.** The Android app opens EcoCash or the dialler and the buyer transfers money there. PIN/OTP/password fields are rejected by the payment/profile handlers. `provider_verified` is always `false` in this build. A buyer claim cannot produce a confirmed receipt. A seller-confirmed record is explicitly not an EcoCash-verified receipt.
