# NyazuraMusika

A native Android marketplace for buying and selling goods around Nyazura. Built for local sellers and WhatsApp contact between buyers and sellers.

## What works

- Browse shared listings without signing in.
- Search by goods, category and collection area, with paginated results.
- Sign in with ChatGPT to open a seller account.
- Save a public seller name and international WhatsApp number.
- Choose a product photo using Android's system picker.
- Post goods with a title, description, price, currency, category, condition and area.
- Edit your own listings, mark goods as sold, make them available again or remove them.
- Open a prefilled WhatsApp message to the seller.

Listings and photos are stored in a shared service rather than on a single phone. No sample listings are published as real goods. USD, ZiG and ZAR are labels for seller-entered prices; the app does not convert currencies or process payments.

## Download the Android APK

[Download NyazuraMusika.apk](downloads/NyazuraMusika.apk?raw=true). This is the compiled debug build for testing.

The marketplace service is currently an owner-private preview. Public activation is required before local buyers and sellers can reach it from the Android app.

## Android app

Open `android/` as the project in Android Studio. The app supports Android 8.0 (API 26) and later. Build with JDK 17, Android SDK 36, Android Gradle Plugin 8.13.2 and the supplied Gradle 8.13 wrapper.

```sh
cd android
./gradlew testDebugUnitTest assembleDebug
```

On Windows, run `gradlew.bat testDebugUnitTest assembleDebug` in the `android` directory.

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. The repository's **Build NyazuraMusika Android** GitHub Actions workflow creates an APK artifact too. A debug APK is suitable for testing; a Play Store release needs your own signing key and release preparation.

The configured marketplace origin is `https://nyazuramusika.shagayabrian899.chatgpt.site`. To use a different HTTPS service, build with `-PmarketApiOrigin=https://your-service.example`.

## Seller sign-in

The Android app opens the system browser for ChatGPT sign-in. After signing in, tap **Return to NyazuraMusika** and finish your public seller profile. Buyers do not need accounts.

The handoff uses a two-minute, single-use authorization code bound to an app-generated PKCE verifier and state. App bearer sessions expire after 30 days, are stored encrypted with Android Keystore, and are revoked server-side when sign-out reaches the service. The app does not contain a service credential, password, API secret or signing key.

## Shared service

`service/` contains the marketplace API, D1 schema and migrations, R2 photo storage, and the browser sign-in return page. The server checks ownership for every listing change and photo attachment. Queries use prepared statements, money is stored as integer minor units, request bodies have size limits, and writes are rate limited.

This service uses Sites' dispatch-owned ChatGPT identity headers. Do not expose an untrusted proxy that lets clients set those headers. A self-hosted fork must replace that integration with a verified identity provider rather than trusting arbitrary header values.

## First version

This is an initial marketplace implementation created with AI assistance. It arranges purchases through WhatsApp and does not include checkout, delivery tracking, seller verification, ratings, automatic password recovery or an operator moderation dashboard. Test the complete sign-in and posting flow on your Android device before inviting sellers. Listing removal hides goods from the market; account and stored-photo deletion currently requires the project owner.
