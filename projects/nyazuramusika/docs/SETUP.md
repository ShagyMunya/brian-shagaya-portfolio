# Setup and activation

## 1. Make the service reachable

The existing shared service is deployed at `https://nyazuramusika.shagayabrian899.chatgpt.site` and is public. Marketplace reads and writes still require a valid Google-backed app session. Google credentials were configured and the service was successfully redeployed on 5 October 2026.

## 2. Connect Google

**Existing deployment:** its Google client ID and protected client secret are configured. A complete Google account login and Android return still require device testing. Start from **Sign in with Google** in the Android app; the callback URL below is registered in Google Cloud and is not a standalone login page. The steps below describe configuration for another deployment or a replacement Google client.

Create a Google Cloud project or select your existing project. Configure Google Auth Platform branding and the audience, then create an OAuth client of type **Web application**. This app uses a browser-to-server Google flow followed by a separate PKCE-protected handoff into Android.

Register this exact authorized redirect URI:

```text
https://nyazuramusika.shagayabrian899.chatgpt.site/api/auth/google/callback
```

Request only `openid email profile`. While Google is in testing mode, add the Google accounts you want to test as test users. Complete any Google publishing or domain verification requirements for your chosen audience and domain before a wider launch.

Set these server runtime variables and redeploy the saved service version:

| Variable | Value | Secret |
| --- | --- | --- |
| `MARKET_ORIGIN` | `https://nyazuramusika.shagayabrian899.chatgpt.site` | No |
| `GOOGLE_CLIENT_ID` | Your Web application client ID | No |
| `GOOGLE_CLIENT_SECRET` | Your Web application client secret | **Yes** |
| `ADMIN_GOOGLE_EMAILS` | Comma-separated Google owner emails | No |

Do not commit the client secret or put it in Android code. The owner allowlist grants admin only on the first Google registration, only for a verified Gmail or Google Workspace email; subsequent permissions come from the stored role and admin decisions. If the owner already registered as a user before configuration, an existing admin must promote that account through the supported account-management path.

Google identifies accounts by its stable `sub` claim. A matching email alone does not link an old ChatGPT account. Older accounts and goods are retained, but legacy sessions and legacy goods are excluded from the Google marketplace until an owner performs a deliberate migration.

## 3. Connect reliable live video

The app has private WebRTC signaling and Cloudflare's public STUN server. Some mobile networks and firewalls require TURN to establish a connection. Create a TURN key in Cloudflare Realtime, then configure:

| Variable | Value | Secret |
| --- | --- | --- |
| `TURN_KEY_ID` | Your Cloudflare TURN key ID | No |
| `TURN_API_TOKEN` | Token for that TURN key | **Yes** |

The service generates short-lived relay credentials only for the two authorized participants. A call link expires after two minutes and can be used once. The browser call session is restricted to one check and depends on the parent Android session. Suspension or sign-out revokes its API access. No video or audio recording is implemented.

TURN is an external service with its own account and usage terms. No account or paid service was created during development.

## 4. Test EcoCash direct transfers

A seller adds their own receiving number under Seller profile. The number is copied into each purchase so changing a profile cannot redirect an existing purchase.

The buyer inspects goods live, prepares the purchase, verifies the recipient, amount and currency, and completes the transfer in the official EcoCash Super App or *151#. The buyer submits the EcoCash reference. The seller checks their wallet independently and confirms receipt. Only then is a seller-confirmed record available to print or save as PDF.

A submitted reference, a screenshot or a “sent” button never marks a purchase as provider-verified. NyazuraMusika does not verify the ownership or registration of a receiving wallet; seller numbers are seller-supplied. Keep the original EcoCash transaction confirmation.

## 5. Automatic EcoCash integration remains pending

Obtain an approved developer account and the current API documentation from [EcoCash's developer portal](https://developers.ecocash.co.zw/). The public documentation available during this implementation did not establish the full third-party wallet-to-wallet transaction and settlement contract. No endpoint, PIN handling method or success response has been invented.

Before implementing automated transfers, confirm with the provider how each seller is onboarded as a recipient, how a buyer authorizes through EcoCash, which currencies are supported, how payment status is authenticated, how idempotency and reversal work, and whether funds settle directly to each seller. Server callbacks must verify the provider's documented signature and match the expected recipient, amount, currency and purchase. Pending or user-reported payments must remain unverified. Only a provider-confirmed transaction may produce a provider-verified receipt.

[Paynow's supported mobile collection flow](https://developers.paynow.co.zw/docs/paynow/initiate_mobile_transaction/) prompts the customer for a PIN through their handset. Its merchant integration is a separate settlement model, requiring an integration ID and key; it is not automatically equivalent to arbitrary peer-to-peer wallet transfers.

## Two-phone acceptance test

1. Install the APK on two Android 8+ phones. If Android reports a signature conflict with an older debug APK, uninstall that older APK first. Production releases need a stable owner-managed signing key.
2. Sign into the owner account and verify the admin dashboard. Sign into a second Google account and verify that it starts as a user.
3. Register a seller, save the WhatsApp and EcoCash receiving numbers, upload a photo and post goods.
4. Verify that a user cannot post goods, a seller cannot manage another seller's goods, and an admin can moderate a listing or suspend an account.
5. From the buyer account, save goods, request a live check, have the seller accept, and join from both phones. Confirm camera/microphone prompts, live video, audio, mute, end and inspection confirmation on Wi-Fi and mobile data.
6. Prepare an EcoCash purchase. During an agreed real test, check the recipient and currency in EcoCash itself. No development test has sent money.
7. Submit the reference and confirm that printing remains unavailable. Have the seller verify their wallet and confirm receipt; then print or save the clearly labelled PDF from both accounts.
8. Sign out, suspend and restore accounts. Old sessions must stay revoked after restoration. A live call cookie must not authenticate other API routes or a different room.
