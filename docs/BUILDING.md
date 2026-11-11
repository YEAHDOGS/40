# Building and signing every platform

_Created by DOGS._

One script, `scripts/build.js`, builds every platform. GitHub Actions runs the same script, so a build
that works on your machine works in CI.

**Signing is always optional.** Each credential comes from (1) environment variables or (2) a
`.env` file in the project root (copy `.env.example`). If something is missing, you
get an unsigned build instead of an error.

## Where each platform can be built

| Target  | Command              | Build machine               | Output          |
| ------- | -------------------- | --------------------------- | --------------- |
| Web     | `pnpm build:web`     | any                         | `dist/web/`     |
| Windows | `pnpm build:desktop` | Windows                     | `dist/desktop/` |
| macOS   | `pnpm build:desktop` | macOS                       | `dist/desktop/` |
| Linux   | `pnpm build:desktop` | Linux                       | `dist/desktop/` |
| Android | `pnpm build:android` | any, with Android SDK + NDK | `dist/android/` |
| iOS     | `pnpm build:ios`     | macOS with Xcode            | `dist/ios/`     |

Desktop builds only target the OS you're on. Tauri can't cross-compile installers, so CI uses one
runner per OS. Extra arguments go straight to Tauri, for example a universal Mac build:

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
pnpm build:desktop --target universal-apple-darwin
```

## GitHub Actions

- `.github/workflows/ci.yml`: lint, test and web build on every push and PR.
- `.github/workflows/build.yml`: builds web, Windows, macOS, Linux, Android and iOS.
  - Runs when you push a tag (`git tag v0.0.1 && git push --tags`) or on demand from the
    **Actions** tab.
  - On tags it also drafts a GitHub Release with every installer attached.
  - On tags it also deploys the Worker, if `CLOUDFLARE_API_TOKEN` is set.

Add secrets under **Settings → Secrets and variables → Actions**. The names are the same as in
`.env.example`, with one difference per file-type credential: CI takes the file contents (or base64),
while local builds take a file path.

### Repository variables (not secret)

| Name                        | Used for                                          |
| --------------------------- | ------------------------------------------------- |
| `PUBLIC_API_URL`            | API URL baked into desktop/mobile apps            |
| `PUBLIC_REVENUECAT_WEB_KEY` | RevenueCat Web Billing public key (web + desktop) |

### Cloudflare (deploy on tag)

| Secret                  | How to get it                                                   |
| ----------------------- | --------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Dashboard → My Profile → API Tokens → "Edit Cloudflare Workers" |
| `CLOUDFLARE_ACCOUNT_ID` | Dashboard → Workers & Pages → right sidebar                     |

### Apple (macOS + iOS)

You need a paid Apple Developer account.

**App Store Connect API key.** Used for macOS notarization and iOS automatic signing.
Create it at App Store Connect → Users and Access → Integrations → App Store Connect API, with the
**Admin** or **App Manager** role.

| Secret             | Local `.env`         | Value                                            |
| ------------------ | -------------------- | ------------------------------------------------ |
| `APPLE_API_ISSUER` | same                 | Issuer ID (UUID at the top of the page)          |
| `APPLE_API_KEY`    | same                 | Key ID (10 characters)                           |
| `APPLE_API_KEY_P8` | `APPLE_API_KEY_PATH` | CI: full text of the `.p8` file. Local: its path |

**iOS team**

| Secret                   | Value                                                   |
| ------------------------ | ------------------------------------------------------- |
| `APPLE_DEVELOPMENT_TEAM` | 10-character Team ID (developer.apple.com → Membership) |

Without `APPLE_DEVELOPMENT_TEAM`, the iOS job runs an unsigned **simulator build**. That proves the
app compiles but produces no `.ipa`.

Manual iOS signing (instead of automatic): `IOS_CERTIFICATE` (base64 `.p12`),
`IOS_CERTIFICATE_PASSWORD`, `IOS_MOBILE_PROVISION` (base64 `.mobileprovision`).

**macOS desktop** (a "Developer ID Application" certificate, for distribution outside the Mac App Store)

| Secret                       | Value                                          |
| ---------------------------- | ---------------------------------------------- |
| `APPLE_CERTIFICATE`          | `base64 -i cert.p12` output                    |
| `APPLE_CERTIFICATE_PASSWORD` | the `.p12` export password                     |
| `APPLE_SIGNING_IDENTITY`     | e.g. `Developer ID Application: DOGS (TEAMID)` |

On your own Mac, if the certificate is already in your keychain, `APPLE_SIGNING_IDENTITY` alone is
enough. Notarization runs automatically when the API key values above are also set.

### Android

Create an upload key once and keep it safe. Losing it means you can't update your app.

```sh
keytool -genkey -v -keystore upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

| Secret                      | Local `.env`            | Value                                        |
| --------------------------- | ----------------------- | -------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | `ANDROID_KEYSTORE_PATH` | CI: `base64 -w0 upload.jks`. Local: path     |
| `ANDROID_KEYSTORE_PASSWORD` | same                    | keystore password                            |
| `ANDROID_KEY_ALIAS`         | same                    | `upload`                                     |
| `ANDROID_KEY_PASSWORD`      | same                    | key password (defaults to keystore password) |

Local Android builds also need `ANDROID_HOME` (the SDK) and `NDK_HOME` (an NDK inside it). Install
both from Android Studio → SDK Manager. Setup guide: <https://tauri.app/start/prerequisites/#android>

### Windows

Windows builds an NSIS `.exe` installer (`src/tauri/tauri.windows.conf.json`). For an `.msi` too, set
`"targets": ["nsis", "msi"]` there. MSI needs the Windows **VBScript** optional feature (Settings → System →
Optional features), which newer Windows versions turn off. Without it you get WiX error 2738.

Builds are unsigned by default. That works, but SmartScreen warns users on first install. To sign,
set `bundle.windows.signCommand` in `src/tauri/tauri.conf.json`, for example with Azure Trusted
Signing. Guide: <https://tauri.app/distribute/sign/windows/>

## Native project folders

The first Android/iOS build generates `src/tauri/gen/android` and `src/tauri/gen/apple`. CI generates
them fresh each time. Once you customize one (permissions, deep links, store settings), **commit
that folder** so CI uses your version instead of generating a new one.
