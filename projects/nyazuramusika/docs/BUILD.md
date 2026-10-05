# Build NyazuraMusika

## Android

Requirements: JDK 17, Android SDK platform 36, Build Tools 35.0.0 and Gradle wrapper 8.13. The checked-in wrapper checksum is verified in CI.

```bash
cd projects/nyazuramusika/android
bash gradlew --no-daemon testDebugUnitTest assembleDebug
```

The debug APK is `app/build/outputs/apk/debug/app-debug.apk`. The default API origin is `https://nyazuramusika.shagayabrian899.chatgpt.site`. A different HTTPS service can be used with `-PmarketApiOrigin=https://your-service.example`.

The current downloadable APK is version **1.1.1**, built and tested in [GitHub Actions run 37283315638](https://github.com/ShagyMunya/brian-shagaya-portfolio/actions/runs/37283315638). Its SHA-256 is `fb0e93b2c6a19f094423a36e33ecdab33aa79913cdb8f74efeb94eaaee6aba69`.

Its signing key differs from the previous 1.1.0 test APK, so an upgrade over that installation is rejected by Android. Save any unfinished form details, uninstall the previous test app, install this APK and sign in again.

GitHub Actions builds the APK on Android source changes. The repository download is updated after a successful build. Debug builds are for testing; a changing CI debug signing key can require uninstalling the previous test APK. Use an owner-managed release signing key for ongoing distribution.

## Service

Use the retained pnpm lockfile and package versions. Configure D1 `DB` and R2 `BUCKET`. Apply all generated SQL migrations in order; never rewrite migrations that have already been deployed. The service uses Vinext and builds to Cloudflare Workers output.

```bash
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
node tests/marketplace.mjs
pnpm build
```

The isolated tests use real local D1 and R2 through Miniflare, generated migrations and locally signed Google test JWTs. They do not contact Google or EcoCash and do not write production goods or move money. Server deployment packaging is handled by the existing Sites workflow.

See [setup and activation](SETUP.md) for Google OAuth, public service access and TURN configuration. Runtime secrets are configured on the service. They are not stored in the APK or repository.
