# Usage Guide

This guide covers the main Scrcpy Opener workflows for demo operators and video
production setups.

## macOS First Launch

Current macOS release builds are unsigned and not notarized. On first launch,
macOS may block the app with a Gatekeeper warning because Apple cannot verify
the developer.

To open it:

1. Open the downloaded DMG or ZIP.
2. Move `Scrcpy Opener.app` to `Applications` if desired.
3. Right-click or Control-click `Scrcpy Opener.app`.
4. Choose `Open`.
5. Confirm the macOS security prompt.

Only bypass Gatekeeper for releases you downloaded from the official project
page and trust.

## Prepare Android Devices

On each Android device:

1. Enable Developer options.
2. Enable USB debugging.
3. For wireless use, enable Wireless debugging.
4. Accept the computer authorization prompt when it appears.

For the most stable live setup, prefer wired USB where possible. Wireless
debugging is useful when devices must be handled freely, mounted remotely, or
kept away from the production machine.

## Add Devices

### USB

Connect a device with USB, then click refresh. The device should appear in the
left device list with its ADB status.

If the status is `unauthorized`, unlock the device and accept the debugging
prompt.

### Wireless QR Pairing

1. Click `Add wireless`.
2. On the Android device, open `Developer options` > `Wireless debugging`.
3. Choose `Pair device with QR code`.
4. Scan the QR code shown in Scrcpy Opener.
5. Keep the Android wireless debugging screen open while pairing completes.

Scrcpy Opener will pair, connect, refresh the device list, and remember the
wireless device. When Android exposes an mDNS wireless debugging name, Scrcpy
Opener resolves it to the device's direct IP endpoint before launching scrcpy,
which is usually more stable for long-running capture.

### Manual Wireless Pairing

Use manual pairing when QR pairing is not available or when the device provides
a pairing code and host manually.

1. Click `Add wireless`.
2. Enter the pairing host, for example `192.168.1.20:37123`.
3. Enter the pairing code shown on the device.
4. Optionally enter a connect host if Android shows a separate connect address.
5. Click `Pair`.

### USB-Assisted Wireless

Use this mode for older ADB TCP/IP workflows:

1. Connect the device over USB.
2. Click `Add wireless`.
3. Select the USB device.
4. Enter the device IP address.
5. Click `Enable TCP/IP`.

The app runs the ADB TCP/IP setup and connects to port `5555`.

## Wireless mDNS Resolution

Android wireless debugging can expose devices through mDNS service names such as
`_adb-tls-connect._tcp`. Those names are useful for discovery, but they are not
always the best target for a live scrcpy capture window.

Scrcpy Opener discovers the mDNS service, maps it back to the Android device,
and connects to the direct device IP and port where possible. This keeps the
friendly remembered device identity in the app while giving scrcpy a more stable
connection target for event and OBS workflows.

## Name Devices for Capture

Select a device, edit `Device name`, and save it. The name is used as the
scrcpy window title.

For OBS and similar tools, use names that describe the source role rather than
the hardware model:

- `Stage Phone`
- `Presenter Tablet`
- `Checkout Demo`
- `Backup Android`

Stable names make it easier to build reusable capture scenes.

## Open a Scrcpy Window

Select a connected device and click `Open`. Scrcpy Opener launches scrcpy with:

- the selected ADB serial
- the configured window title
- global scrcpy defaults
- any per-device overrides
- any extra flags configured for that device

Click `Stop` to close the managed scrcpy process.

## Capture in OBS or Video Software

In OBS:

1. Add a `Window Capture` source.
2. Select the named scrcpy window.
3. Repeat for each demo device.
4. Lock the source once positioned.

If you change a device name, reopen the scrcpy window and update the matching
window capture source if your video software does not update it automatically.

## Scrcpy Settings

Global settings apply to all devices. Per-device settings can override global
defaults.

Available settings include:

- video codec: H.264, H.265, or AV1
- video bitrate
- max FPS
- max size
- window width and height
- stay awake
- keep active
- always on top
- fullscreen
- borderless window
- aspect-ratio lock
- capture orientation
- orientation lock
- read-only mode
- extra scrcpy flags

The command preview shows the exact scrcpy command that will be launched.

## Auto Reconnect

Enable `Auto reconnect` for devices that should recover automatically after a
USB or wireless interruption.

When enabled, Scrcpy Opener checks devices periodically. If a remembered device
comes back online and no managed scrcpy process is running, the app opens scrcpy
again using that device's saved settings.

If you manually stop a device, Scrcpy Opener suppresses relaunching until the
device disappears and comes back or auto reconnect is toggled again.

## Manual Command Window

The command window supports:

- `adb ...`
- `scrcpy ...`
- `clear`

It is intended for diagnostics and operator recovery. Arbitrary shell commands
are not supported.

## Diagnostics

Open the bottom panel and switch to `Diagnostics` to inspect:

- resolved adb path
- resolved scrcpy path
- adb version
- scrcpy version
- platform
- bundled tool availability

Use this when devices do not appear or scrcpy does not launch.

## Bundled Tools

Packaged builds can include adb and scrcpy inside the app. This is useful for
quick event deployment because each demo machine can run the same known tool
versions without separately installing Android platform-tools or scrcpy.

If bundled tools are unavailable, Scrcpy Opener can still use custom paths from
Global Settings or fall back to `adb` and `scrcpy` on `PATH`.
