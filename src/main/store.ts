import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { defaultAppState, defaultScrcpySettings, type AppState, type DeviceInfo } from '../shared/types'

export class AppStore {
  private state: AppState
  private readonly filePath: string

  constructor(filePath = join(app.getPath('userData'), 'state.json')) {
    this.filePath = filePath
    this.state = this.load()
  }

  getState(): AppState {
    return structuredClone(this.state)
  }

  saveGlobalSettings(settings: AppState['globalSettings']): AppState {
    this.state.globalSettings = { ...defaultScrcpySettings, ...settings }
    return this.persist()
  }

  saveToolPaths(paths: AppState['toolPaths']): AppState {
    this.state.toolPaths = {
      adbPath: paths.adbPath?.trim() || null,
      scrcpyPath: paths.scrcpyPath?.trim() || null
    }
    return this.persist()
  }

  replaceState(raw: Partial<AppState>): AppState {
    this.state = migrateState(raw)
    return this.persist()
  }

  upsertSeenDevice(device: DeviceInfo): void {
    if (this.state.forgottenDevices.includes(device.serial)) {
      return
    }
    const existing = this.state.devices[device.serial]
    this.state.devices[device.serial] = {
      serial: device.serial,
      connectionSerial: device.connectionSerial || device.serial,
      stableSerial: device.stableSerial,
      displayName: existing?.displayName || device.model || device.serial,
      model: device.model || existing?.model,
      product: device.product || existing?.product,
      device: device.device || existing?.device,
      transport: device.transport || existing?.transport,
      autoReconnect: existing?.autoReconnect ?? false,
      overrides: existing?.overrides ?? {},
      lastSeenAt: new Date().toISOString(),
      wirelessHost: existing?.wirelessHost
    }
  }

  renameDevice(serial: string, displayName: string): AppState {
    this.ensureDevice(serial)
    this.state.devices[serial].displayName = displayName.trim() || serial
    return this.persist()
  }

  forgetDevice(serial: string): AppState {
    delete this.state.devices[serial]
    if (!this.state.forgottenDevices.includes(serial)) {
      this.state.forgottenDevices.push(serial)
    }
    return this.persist()
  }

  setDeviceAutoReconnect(serial: string, enabled: boolean): AppState {
    this.ensureDevice(serial)
    this.unforgetDevice(serial)
    this.state.devices[serial].autoReconnect = enabled
    return this.persist()
  }

  saveDeviceOverrides(serial: string, overrides: AppState['devices'][string]['overrides']): AppState {
    this.ensureDevice(serial)
    this.unforgetDevice(serial)
    this.state.devices[serial].overrides = overrides
    return this.persist()
  }

  rememberWirelessHost(host: string): void {
    if (!this.state.rememberedWirelessHosts.includes(host)) {
      this.state.rememberedWirelessHosts.push(host)
      this.persist()
    }
  }

  unforgetDevices(serials: string[]): void {
    const serialSet = new Set(serials)
    this.state.forgottenDevices = this.state.forgottenDevices.filter((entry) => !serialSet.has(entry))
    this.persist()
  }

  private ensureDevice(serial: string): void {
    this.unforgetDevice(serial)
    if (!this.state.devices[serial]) {
      this.state.devices[serial] = {
        serial,
        displayName: serial,
        autoReconnect: false,
        overrides: {}
      }
    }
  }

  private unforgetDevice(serial: string): void {
    this.state.forgottenDevices = this.state.forgottenDevices.filter((entry) => entry !== serial)
  }

  private load(): AppState {
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<AppState>
      return migrateState(raw)
    } catch {
      return structuredClone(defaultAppState)
    }
  }

  private persist(): AppState {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, `${JSON.stringify(this.state, null, 2)}\n`)
    return this.getState()
  }
}

export function migrateState(raw: Partial<AppState>): AppState {
  return {
    version: 1,
    globalSettings: { ...defaultScrcpySettings, ...raw.globalSettings },
    devices: Object.fromEntries(
      Object.entries(raw.devices ?? {}).map(([serial, device]) => [
        serial,
        {
          serial,
          connectionSerial: device.connectionSerial,
          stableSerial: device.stableSerial,
          displayName: device.displayName || serial,
          model: device.model,
          product: device.product,
          device: device.device,
          transport: device.transport,
          autoReconnect: device.autoReconnect ?? false,
          overrides: device.overrides ?? {},
          lastSeenAt: device.lastSeenAt,
          wirelessHost: device.wirelessHost
        }
      ])
    ),
    rememberedWirelessHosts: raw.rememberedWirelessHosts ?? [],
    forgottenDevices: raw.forgottenDevices ?? [],
    toolPaths: {
      adbPath: raw.toolPaths?.adbPath ?? null,
      scrcpyPath: raw.toolPaths?.scrcpyPath ?? null
    }
  }
}
