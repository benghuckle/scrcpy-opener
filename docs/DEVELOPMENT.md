# Development Guide

Scrcpy Opener is an Electron, React, TypeScript, and electron-vite app.

## Scripts

```bash
npm install
npm run dev
npm test
npm run build
npm run package
```

Useful scripts:

- `npm run dev` starts the Electron development app.
- `npm test` runs the Vitest test suite.
- `npm run build` type-checks and builds the Electron output.
- `npm run package` builds and packages the app with Electron Builder.
- `npm run package:win` builds Windows x64 and arm64 targets.
- `npm run vendor:download` downloads pinned adb and scrcpy binaries.

## Repository Layout

```text
src/main/          Electron main process, adb/scrcpy orchestration, persistence
src/preload/       Electron preload bridge
src/renderer/      React renderer app
src/shared/        Shared IPC channels and TypeScript types
tests/             Vitest unit tests
scripts/           Vendor binary download tooling
build/             App icons and Electron Builder assets
docs/              Project documentation
```

## Runtime Architecture

The main process owns device state and process control. It:

- resolves adb and scrcpy paths
- reads `adb devices -l`
- reads `adb mdns services`
- collapses Android wireless debugging mDNS aliases into stable device records
- resolves mDNS connect services to direct device IP endpoints for scrcpy launch
- pairs and connects wireless devices
- launches and stops scrcpy child processes
- stores global settings and per-device records
- broadcasts snapshots to the renderer over IPC

The renderer is a React UI over that state. It does not run adb or scrcpy
directly; it calls the preload bridge, which forwards requests to the main
process.

## Tool Resolution

The app resolves tools in this order:

1. user-configured adb/scrcpy paths
2. bundled vendor tools under `vendor/bin` in development or app resources in a
   packaged build
3. `adb` and `scrcpy` from `PATH`

Packaged builds should run `npm run vendor:download` before packaging so the app
ships with known tool versions. Bundling adb and scrcpy keeps deployment fast on
demo machines because operators do not need to prepare a separate Android
developer environment first.

## State

App state is persisted as JSON in Electron's `userData` directory. The store
tracks:

- global scrcpy settings
- remembered devices
- per-device display names
- per-device scrcpy overrides
- auto reconnect flags
- remembered wireless hosts
- forgotten devices
- optional custom tool paths

## Testing

Run:

```bash
npm test
```

The current tests cover command construction, ADB parsing, wireless QR payloads,
manual command parsing, and store migration/persistence behavior.

## Packaging Notes

Electron Builder configuration lives in `package.json`.

Current configured targets:

- macOS: `dmg`, `zip`
- Windows: `nsis`, `zip`

The app packages `vendor/bin` as an extra resource when vendor binaries are
present.

## Signing and Notarization

macOS and Windows signing are intentionally credential-driven. Do not commit
certificates, passwords, App Store Connect keys, or notary credentials.

The public `v0.1.0` macOS artifacts were built unsigned/unnotarized because no
paid Apple Developer Program `Developer ID Application` certificate or
notarization credentials were available at build time. Users may need to
right-click or Control-click the app and choose `Open` to bypass Gatekeeper.

### macOS

For public distribution outside the Mac App Store, use an Apple Developer
Program `Developer ID Application` certificate. An `Apple Development`
certificate is not sufficient for a public DMG/ZIP release.

The macOS build uses hardened runtime and `build/entitlements.mac.plist`, which
is required for a notarized Electron app.

Store notarization credentials once in the macOS keychain:

```bash
xcrun notarytool store-credentials "ScrcpyOpener" \
  --apple-id "APPLE_ID_EMAIL" \
  --team-id "APPLE_TEAM_ID" \
  --password "APP_SPECIFIC_PASSWORD"
```

Then package with the profile visible to Electron Builder:

```bash
APPLE_KEYCHAIN_PROFILE=ScrcpyOpener npm run package
```

After packaging, verify the stapled ticket:

```bash
xcrun stapler validate "release/mac-arm64/Scrcpy Opener.app"
spctl --assess --type execute --verbose "release/mac-arm64/Scrcpy Opener.app"
```

### Windows

Windows releases need an Authenticode code-signing certificate. For cross-builds
from macOS, provide a PFX/P12 certificate through Electron Builder's Windows
signing environment variables:

```bash
WIN_CSC_LINK="/absolute/path/to/windows-code-signing-cert.pfx" \
WIN_CSC_KEY_PASSWORD="CERT_PASSWORD" \
npm run package:win
```

For EV certificates that live on hardware tokens or cloud signing services, use
the provider's signing workflow and configure Electron Builder accordingly.

## Contributing

Keep changes focused and testable. For behavior changes, add or update Vitest
coverage around the command builder, ADB parsing, store migration, or service
logic where practical.

Before opening a pull request:

```bash
npm test
npm run build
```

If your change affects packaged app behavior, also verify a packaged build on
the target platform.
