# Build NyazuraMusika

## Android

Requirements: JDK 17, Android SDK platform 36, Build Tools 35.0.0 and Gradle wrapper 8.13. The checked-in wrapper checksum is verified in CI.

```bash
cd projects/nyazuramusika/android
bash gradlew --no-daemon testDebugUnitTest assembleDebug
```

The debug APK is `app/build/outputs/apk/debug/app-debug.apk`. The default API origin is `https://nyazuramusika.shagayabrian899.chatgpt.site`. A different HTTPS service can be used with `-PmarketApiOrigin=https://your-service.example`.

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
