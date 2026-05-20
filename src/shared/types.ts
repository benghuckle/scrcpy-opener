export type DeviceStatus = 'device' | 'offline' | 'unauthorized' | 'unknown' | 'remembered'

export type VideoCodec = '' | 'h264' | 'h265' | 'av1'

export type ScrcpyOrientation = 'default' | '0' | '90' | '180' | '270' | 'flip0' | 'flip90' | 'flip180' | 'flip270'

export interface DeviceInfo {
  serial: string
  connectionSerial?: string
  stableSerial?: string
  wirelessHost?: string
  status: DeviceStatus
  displayName: string
  model?: string
  product?: string
  device?: string
  transport?: 'usb' | 'tcpip' | 'emulator' | 'unknown'
  lastSeenAt?: string
  remembered: boolean
  running: boolean
  autoReconnect: boolean
}

export interface ScrcpySettings {
  videoCodec: VideoCodec
  videoBitRate: string
  maxFps: number | null
  maxSize: number | null
  windowWidth: number | null
  windowHeight: number | null
  stayAwake: boolean
  keepActive: boolean
  alwaysOnTop: boolean
  fullscreen: boolean
  borderless: boolean
  lockAspectRatio: boolean
  captureOrientation: ScrcpyOrientation
  lockOrientation: boolean
  readOnly: boolean
  extraFlags: string
}

export interface DeviceRecord {
  serial: string
  connectionSerial?: string
  stableSerial?: string
  displayName: string
  model?: string
  product?: string
  device?: string
  transport?: DeviceInfo['transport']
  autoReconnect: boolean
  overrides: Partial<ScrcpySettings>
  lastSeenAt?: string
  wirelessHost?: string
}

export interface ToolPaths {
  adbPath: string | null
  scrcpyPath: string | null
}

export interface AppState {
  version: 1
  globalSettings: ScrcpySettings
  devices: Record<string, DeviceRecord>
  rememberedWirelessHosts: string[]
  forgottenDevices: string[]
  toolPaths: ToolPaths
}

export interface Diagnostics {
  adbPath: string
  scrcpyPath: string
  adbVersion: string
  scrcpyVersion: string
  platform: NodeJS.Platform
  bundledToolsAvailable: boolean
}

export interface CommandPreview {
  executable: string
  args: string[]
}

export interface ManualCommandResult {
  command: string
  executable: string | null
  args: string[]
  stdout: string
  stderr: string
  exitCode: number | null
  startedDetached: boolean
  error?: string
}

export interface PairingSession {
  id: string
  qrPayload: string
  qrDataUrl: string
  serviceName: string
  password: string
  status: 'waiting' | 'pairing' | 'connected' | 'failed' | 'cancelled'
  message: string
}

export interface ManualPairRequest {
  pairHost: string
  pairCode: string
  connectHost?: string
}

export interface LegacyWirelessRequest {
  serial: string
  host: string
  port: number
}

export interface LogEntry {
  id: string
  level: 'info' | 'warn' | 'error'
  message: string
  timestamp: string
}

export interface AppSnapshot {
  devices: DeviceInfo[]
  state: AppState
  logs: LogEntry[]
}

export interface AppApi {
  getSnapshot: () => Promise<AppSnapshot>
  refreshDevices: () => Promise<AppSnapshot>
  saveGlobalSettings: (settings: ScrcpySettings) => Promise<AppSnapshot>
  saveToolPaths: (paths: ToolPaths) => Promise<AppSnapshot>
  exportSettings: () => Promise<AppSnapshot>
  importSettings: () => Promise<AppSnapshot>
  renameDevice: (serial: string, displayName: string) => Promise<AppSnapshot>
  forgetDevice: (serial: string) => Promise<AppSnapshot>
  setDeviceAutoReconnect: (serial: string, enabled: boolean) => Promise<AppSnapshot>
  saveDeviceOverrides: (serial: string, overrides: Partial<ScrcpySettings>) => Promise<AppSnapshot>
  openScrcpy: (serial: string) => Promise<AppSnapshot>
  stopScrcpy: (serial: string) => Promise<AppSnapshot>
  getCommandPreview: (serial: string) => Promise<CommandPreview>
  runManualCommand: (command: string) => Promise<ManualCommandResult>
  startQrPairing: () => Promise<PairingSession>
  getQrPairing: (id: string) => Promise<PairingSession | null>
  cancelQrPairing: (id: string) => Promise<PairingSession>
  manualPair: (request: ManualPairRequest) => Promise<AppSnapshot>
  legacyWirelessConnect: (request: LegacyWirelessRequest) => Promise<AppSnapshot>
  getDiagnostics: () => Promise<Diagnostics>
  onSnapshot: (callback: (snapshot: AppSnapshot) => void) => () => void
}

export const defaultScrcpySettings: ScrcpySettings = {
  videoCodec: '',
  videoBitRate: '',
  maxFps: null,
  maxSize: null,
  windowWidth: null,
  windowHeight: null,
  stayAwake: false,
  keepActive: false,
  alwaysOnTop: false,
  fullscreen: false,
  borderless: false,
  lockAspectRatio: true,
  captureOrientation: 'default',
  lockOrientation: false,
  readOnly: false,
  extraFlags: ''
}

export const defaultAppState: AppState = {
  version: 1,
  globalSettings: defaultScrcpySettings,
  devices: {},
  rememberedWirelessHosts: [],
  forgottenDevices: [],
  toolPaths: {
    adbPath: null,
    scrcpyPath: null
  }
}
