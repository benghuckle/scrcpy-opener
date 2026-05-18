# Scrcpy Opener

A simple Mac and Windows Electron app for managing ADB devices and opening named scrcpy windows.

## Development

```bash
npm install
npm run dev
```

## Vendor binaries

The app is designed to package bundled `adb` and `scrcpy` binaries. Download pinned vendor tools before packaging:

```bash
npm run vendor:download
```

The script downloads scrcpy `v4.0` and Android platform-tools `37.0.0` into `vendor/bin`, which is ignored by git and included as Electron Builder `extraResources`.

## Features

- connected and remembered ADB device list
- friendly device names
- per-device scrcpy open/stop controls
- per-device auto reconnect
- global scrcpy defaults and per-device overrides
- manual and QR wireless debugging pairing
- USB-assisted wireless debugging
- command preview, diagnostics, and process logs
