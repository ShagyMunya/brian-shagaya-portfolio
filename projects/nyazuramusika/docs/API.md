# Marketplace API

All application requests use HTTPS. Public endpoints do not require a session. Protected endpoints use `Authorization: Bearer <app-session>`.

| Method and path | Access | Purpose |
| --- | --- | --- |
| GET `/api/health` | Public | Check marketplace storage readiness. |
| GET `/api/categories` | Public | Read categories and supported price labels. |
| GET `/api/listings` | Public | Active goods; optional `q`, `category`, `location`, `limit` and `offset`. |
| GET `/api/listings/{id}` | Public | Read an available or sold listing. |
| GET `/api/images/{id}` | Public | Read a photo attached to a visible listing. |
| POST `/api/auth/exchange` | Code + verifier | Exchange a single-use, PKCE-bound browser sign-in code. |
| GET / PUT `/api/me` | Seller | Read or change the seller's public name and WhatsApp number. |
| GET `/api/my-listings` | Seller | Read the current seller's listings. |
| POST `/api/images` | Seller | Upload JPEG or PNG bytes, maximum 800,000 bytes. |
| POST `/api/listings` | Seller | Create a listing. |
| PUT `/api/listings/{id}` | Owner | Edit fields or set `active` / `sold` status. |
| DELETE `/api/listings/{id}` | Owner | Remove a listing from public views. |
| POST `/api/auth/logout` | Seller | Revoke the current app session. |

Listing fields are `title`, `description`, `price_minor`, `currency`, `category`, `condition`, `location`, optional `image_id`, and `status`. Prices must be positive integer minor units; for example, USD 19.99 is `1999`. IDs and seller ownership are always assigned by the server.

Errors return a JSON `error` message and an appropriate HTTP status. Mutations are not automatically retried by the app because a lost response does not prove that a write failed.
