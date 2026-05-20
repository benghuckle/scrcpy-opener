import { BrowserWindow, dialog } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import QRCode from 'qrcode'
import { collapseAdbWifiAliases, isAdbTlsConnectSerial, parseAdbDevices, parseMdnsServices } from './adb'
import { runCommand } from './exec'
import { runManualCommand } from './manualCommand'
import { bundledToolsAvailable, resolveToolPaths } from './paths'
import { buildScrcpyCommand, mergeSettings } from './scrcpyCommand'
import { AppStore } from './store'
import { ipcChannels } from '../shared/ipc'
import type {
  AppSnapshot,
  CommandPreview,
  DeviceInfo,
  Diagnostics,
  LegacyWirelessRequest,
  LogEntry,
  ManualPairRequest,
  PairingSession
} from '../shared/types'

interface ScrcpySession {
  child: ChildProcess
  intentionalStop: boolean
  reconnectAttempts: number
}

interface QrWatcher {
  timer: NodeJS.Timeout
  session: PairingSession
}

interface RefreshDevicesOptions {
  includeForgotten?: boolean
}

export class AppService {
  private readonly sessions = new Map<string, ScrcpySession>()
  private readonly logs: LogEntry[] = []
  private readonly qrWatchers = new Map<string, QrWatcher>()
  private readonly completedQrPairings = new Map<string, PairingSession>()
  private readonly suppressedAutoLaunch = new Set<string>()
  private readonly activeAutoReconnectDevices = new Set<string>()
  private readonly loggedWirelessHosts = new Set<string>()
  private autoReconnectCheckRunning = false
  private devices: DeviceInfo[] = []

  constructor(private readonly store: AppStore) {
    setInterval(() => {
      void this.checkAutoReconnectDevices()
    }, 5000)
  }

  async getSnapshot(): Promise<AppSnapshot> {
    if (this.devices.length === 0) {
      await this.refreshDevices()
    }
    return this.snapshot()
  }

  async refreshDevices(options: RefreshDevicesOptions = {}): Promise<AppSnapshot> {
    const { adbPath } = resolveToolPaths(this.store.getState().toolPaths)
    try {
      const [devicesResult, mdnsResult] = await Promise.allSettled([
        runCommand(adbPath, ['devices', '-l']),
        runCommand(adbPath, ['mdns', 'services'], undefined, 8000)
      ])
      if (devicesResult.status === 'rejected') {
        throw devicesResult.reason
      }
      const services = mdnsResult.status === 'fulfilled' ? parseMdnsServices(mdnsResult.value.stdout) : []
      const collapsed = collapseAdbWifiAliases(parseAdbDevices(devicesResult.value.stdout), services)
      if (options.includeForgotten) {
        this.store.unforgetDevices(collapsed.map((device) => device.serial))
      }
      const forgotten = new Set(this.store.getState().forgottenDevices)
      const seen = collapsed.filter((device) => !forgotten.has(device.serial))
      seen.filter((device) => device.status === 'device').forEach((device) => this.store.upsertSeenDevice(device))
      this.devices = this.mergeRememberedDevices(seen)
      return this.broadcast()
    } catch (error) {
      this.log('error', `Failed to refresh devices: ${formatError(error)}`)
      this.devices = this.mergeRememberedDevices([])
      return this.broadcast()
    }
  }

  saveGlobalSettings(settings: AppSnapshot['state']['globalSettings']): AppSnapshot {
    this.store.saveGlobalSettings(settings)
    return this.broadcast()
  }

  saveToolPaths(paths: AppSnapshot['state']['toolPaths']): AppSnapshot {
    this.store.saveToolPaths(paths)
    this.log('info', 'Saved adb/scrcpy tool paths')
    return this.broadcast()
  }

  async exportSettings(): Promise<AppSnapshot> {
    const targetWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = await dialog.showSaveDialog(targetWindow, {
      title: 'Export Scrcpy Opener Settings',
      defaultPath: 'scrcpy-opener-settings.json',
      filters: [{ name: 'JSON Settings', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) {
      return this.snapshot()
    }

    await writeFile(result.filePath, `${JSON.stringify(this.store.getState(), null, 2)}\n`, 'utf8')
    this.log('info', `Exported settings to ${result.filePath}`)
    return this.broadcast()
  }

  async importSettings(): Promise<AppSnapshot> {
    const targetWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(targetWindow, {
      title: 'Import Scrcpy Opener Settings',
      properties: ['openFile'],
      filters: [{ name: 'JSON Settings', extensions: ['json'] }]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return this.snapshot()
    }

    const filePath = result.filePaths[0]
    const raw = JSON.parse(await readFile(filePath, 'utf8')) as Partial<AppSnapshot['state']>
    this.store.replaceState(raw)
    this.devices = this.mergeRememberedDevices(this.devices)
    this.log('info', `Imported settings from ${filePath}`)
    return this.broadcast()
  }

  renameDevice(serial: string, displayName: string): AppSnapshot {
    this.store.renameDevice(serial, displayName)
    this.devices = this.mergeRememberedDevices(this.devices)
    return this.broadcast()
  }

  forgetDevice(serial: string): AppSnapshot {
    this.stopScrcpy(serial)
    this.store.forgetDevice(serial)
    this.log('info', `Forgot device ${serial}`)
    this.devices = this.devices.filter((device) => device.serial !== serial)
    return this.broadcast()
  }

  setDeviceAutoReconnect(serial: string, enabled: boolean): AppSnapshot {
    this.store.setDeviceAutoReconnect(serial, enabled)
    if (enabled) {
      this.suppressedAutoLaunch.delete(serial)
      void this.checkAutoReconnectDevices()
    }
    this.devices = this.mergeRememberedDevices(this.devices)
    return this.broadcast()
  }

  saveDeviceOverrides(serial: string, overrides: AppSnapshot['state']['devices'][string]['overrides']): AppSnapshot {
    this.store.saveDeviceOverrides(serial, overrides)
    return this.broadcast()
  }

  getCommandPreview(serial: string): Promise<CommandPreview> {
    return this.createScrcpyCommand(serial)
  }

  runManualCommand(command: string) {
    return runManualCommand(command, this.store.getState().toolPaths)
  }

  async openScrcpy(serial: string): Promise<AppSnapshot> {
    await this.launchScrcpy(serial, false)
    return this.broadcast()
  }

  stopScrcpy(serial: string): AppSnapshot {
    const session = this.sessions.get(serial)
    if (session) {
      session.intentionalStop = true
      forceKillProcess(session.child)
      this.sessions.delete(serial)
      this.suppressedAutoLaunch.add(serial)
      this.log('info', `Stopped scrcpy for ${serial}`)
    }
    return this.broadcast()
  }

  async startQrPairing(): Promise<PairingSession> {
    const id = randomUUID()
    const password = randomAdbToken(12)
    const serviceName = `studio-${randomAdbToken(12)}`
    const qrPayload = buildAdbWifiQrPayload(serviceName, password)
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 320 })
    const session: PairingSession = {
      id,
      qrPayload,
      qrDataUrl,
      serviceName,
      password,
      status: 'waiting',
      message: 'Scan this from Developer options > Wireless debugging > Pair device with QR code.'
    }

    const timer = setInterval(() => {
      void this.pollQrPairing(id)
    }, 1000)
    this.qrWatchers.set(id, { timer, session })
    this.log('info', `Started QR pairing session ${serviceName}`)
    return session
  }

  getQrPairing(id: string): PairingSession | null {
    return this.qrWatchers.get(id)?.session ?? this.completedQrPairings.get(id) ?? null
  }

  cancelQrPairing(id: string): PairingSession {
    const watcher = this.qrWatchers.get(id)
    if (!watcher) {
      throw new Error('Pairing session not found')
    }
    clearInterval(watcher.timer)
    watcher.session.status = 'cancelled'
    watcher.session.message = 'QR pairing cancelled.'
    this.completedQrPairings.set(id, watcher.session)
    this.qrWatchers.delete(id)
    return watcher.session
  }

  async manualPair(request: ManualPairRequest): Promise<AppSnapshot> {
    const { adbPath } = resolveToolPaths(this.store.getState().toolPaths)
    const pair = await runCommand(adbPath, ['pair', request.pairHost, request.pairCode], undefined, 30000)
    if (pair.code !== 0) {
      throw new Error(pair.stderr || pair.stdout || 'adb pair failed')
    }
    this.log('info', `Paired wireless device at ${request.pairHost}`)
    if (request.connectHost) {
      await this.connectWirelessHost(request.connectHost)
    }
    return this.refreshDevices({ includeForgotten: true })
  }

  async legacyWirelessConnect(request: LegacyWirelessRequest): Promise<AppSnapshot> {
    const { adbPath } = resolveToolPaths(this.store.getState().toolPaths)
    const tcpip = await runCommand(adbPath, ['-s', request.serial, 'tcpip', String(request.port)], undefined, 20000)
    if (tcpip.code !== 0) {
      throw new Error(tcpip.stderr || tcpip.stdout || 'adb tcpip failed')
    }
    await this.connectWirelessHost(`${request.host}:${request.port}`)
    return this.refreshDevices({ includeForgotten: true })
  }

  async getDiagnostics(): Promise<Diagnostics> {
    const paths = resolveToolPaths(this.store.getState().toolPaths)
    const [adb, scrcpy] = await Promise.allSettled([
      runCommand(paths.adbPath, ['version']),
      runCommand(paths.scrcpyPath, ['--version'])
    ])
    return {
      adbPath: paths.adbPath,
      scrcpyPath: paths.scrcpyPath,
      adbVersion: adb.status === 'fulfilled' ? adb.value.stdout.trim() || adb.value.stderr.trim() : formatError(adb.reason),
      scrcpyVersion:
        scrcpy.status === 'fulfilled' ? scrcpy.value.stdout.trim() || scrcpy.value.stderr.trim() : formatError(scrcpy.reason),
      platform: process.platform,
      bundledToolsAvailable: bundledToolsAvailable()
    }
  }

  private async connectWirelessHost(host: string): Promise<void> {
    const { adbPath } = resolveToolPaths(this.store.getState().toolPaths)
    const connect = await runCommand(adbPath, ['connect', host], undefined, 20000)
    if (connect.code !== 0 || /failed|unable|cannot/i.test(connect.stdout + connect.stderr)) {
      throw new Error(connect.stderr || connect.stdout || 'adb connect failed')
    }
    this.store.rememberWirelessHost(host)
    if (!this.loggedWirelessHosts.has(host)) {
      this.loggedWirelessHosts.add(host)
      this.log('info', `Connected wireless device at ${host}`)
    }
  }

  private async pollQrPairing(id: string): Promise<void> {
    const watcher = this.qrWatchers.get(id)
    if (!watcher || watcher.session.status !== 'waiting') {
      return
    }
    const { adbPath } = resolveToolPaths(this.store.getState().toolPaths)
    try {
      const result = await runCommand(adbPath, ['mdns', 'services'], undefined, 8000)
      const service = findPairingService(result.stdout, watcher.session.serviceName)
      if (!service) {
        return
      }
      watcher.session.status = 'pairing'
      watcher.session.message = `Pairing with ${service.host}`
      const pair = await runCommand(adbPath, ['pair', service.host, watcher.session.password], undefined, 30000)
      if (pair.code !== 0) {
        throw new Error(pair.stderr || pair.stdout || 'adb pair failed')
      }
      watcher.session.message = 'Pairing succeeded. Waiting for wireless connect service...'
      const connectHost = await this.waitForQrConnectHost(adbPath, service.host)
      await this.connectWirelessHost(connectHost)
      clearInterval(watcher.timer)
      watcher.session.status = 'connected'
      watcher.session.message = `Device paired and connected at ${connectHost}.`
      this.completedQrPairings.set(id, watcher.session)
      this.qrWatchers.delete(id)
      this.log('info', `QR paired and connected device via ${service.name}`)
      await this.refreshDevices({ includeForgotten: true })
    } catch (error) {
      watcher.session.status = 'failed'
      watcher.session.message = formatError(error)
      clearInterval(watcher.timer)
      this.completedQrPairings.set(id, watcher.session)
      this.qrWatchers.delete(id)
      this.log('error', `QR pairing failed: ${formatError(error)}`)
    }
  }

  private async waitForQrConnectHost(adbPath: string, pairingHost: string): Promise<string> {
    const pairingAddress = pairingHost.split(':')[0]
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const result = await runCommand(adbPath, ['mdns', 'services'], undefined, 8000)
      const services = parseMdnsServices(result.stdout).filter((entry) => entry.type === '_adb-tls-connect._tcp')
      const sameAddress = services.find((entry) => entry.host.startsWith(`${pairingAddress}:`))
      const service = sameAddress ?? services[0]
      if (service) {
        return service.host
      }
      await delay(1000)
    }
    throw new Error('Paired, but no _adb-tls-connect._tcp service appeared. Keep Wireless debugging open and try manual connect.')
  }

  private async launchScrcpy(serial: string, reconnect: boolean): Promise<void> {
    const existing = this.sessions.get(serial)
    if (existing) {
      return
    }
    const command = await this.createScrcpyCommand(serial)
    const child = spawn(command.executable, command.args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const session: ScrcpySession = {
      child,
      intentionalStop: false,
      reconnectAttempts: reconnect ? 1 : 0
    }
    this.sessions.set(serial, session)
    this.log('info', `Opened scrcpy for ${serial}`)

    child.stderr.on('data', (chunk) => this.log('warn', `scrcpy ${serial}: ${String(chunk).trim()}`))
    child.on('error', (error) => {
      this.sessions.delete(serial)
      this.log('error', `scrcpy failed for ${serial}: ${formatError(error)}`)
      this.scheduleReconnect(serial, session)
    })
    child.on('close', (code) => {
      this.sessions.delete(serial)
      if (!session.intentionalStop) {
        this.log('warn', `scrcpy exited for ${serial} with code ${code ?? 'unknown'}`)
        this.scheduleReconnect(serial, session)
      }
      this.broadcast()
    })
  }

  private async checkAutoReconnectDevices(): Promise<void> {
    if (this.autoReconnectCheckRunning) {
      return
    }
    this.autoReconnectCheckRunning = true
    try {
      await this.refreshDevices()
      const state = this.store.getState()
      const currentActive = new Set<string>()

      for (const [serial, record] of Object.entries(state.devices)) {
        if (!record.autoReconnect) {
          this.activeAutoReconnectDevices.delete(serial)
          this.suppressedAutoLaunch.delete(serial)
          continue
        }

        let device = this.devices.find((entry) => entry.serial === serial)
        let active = device?.status === 'device'

        if (!active && isAdbTlsConnectSerial(serial)) {
          active = await this.connectRememberedWirelessDevice(serial)
          if (active) {
            await this.refreshDevices()
            device = this.devices.find((entry) => entry.serial === serial)
          }
        }

        if (!active) {
          this.activeAutoReconnectDevices.delete(serial)
          this.suppressedAutoLaunch.delete(serial)
          continue
        }

        currentActive.add(serial)
        const becameActive = !this.activeAutoReconnectDevices.has(serial)
        if (becameActive) {
          this.suppressedAutoLaunch.delete(serial)
        }

        if (!this.sessions.has(serial) && !this.suppressedAutoLaunch.has(serial)) {
          this.log('info', `Auto reconnect opening scrcpy for ${record.displayName || device?.displayName || serial}`)
          await this.launchScrcpy(serial, true)
        }
      }

      this.activeAutoReconnectDevices.clear()
      currentActive.forEach((serial) => this.activeAutoReconnectDevices.add(serial))
    } catch (error) {
      this.log('warn', `Auto reconnect check failed: ${formatError(error)}`)
      this.broadcast()
    } finally {
      this.autoReconnectCheckRunning = false
    }
  }

  private async connectRememberedWirelessDevice(serial: string): Promise<boolean> {
    const { adbPath } = resolveToolPaths(this.store.getState().toolPaths)
    const servicesResult = await runCommand(adbPath, ['mdns', 'services'], undefined, 8000)
    const service = parseMdnsServices(servicesResult.stdout).find((entry) => `${entry.name}._adb-tls-connect._tcp.` === serial)
    if (!service) {
      return false
    }
    await this.connectWirelessHost(service.host)
    return true
  }

  private scheduleReconnect(serial: string, session: ScrcpySession): void {
    const device = this.store.getState().devices[serial]
    if (!device?.autoReconnect || session.intentionalStop) {
      return
    }
    const nextAttempt = session.reconnectAttempts + 1
    const delay = Math.min(30000, 1000 * 2 ** Math.min(nextAttempt, 5))
    this.log('info', `Auto reconnect for ${serial} in ${Math.round(delay / 1000)}s`)
    setTimeout(async () => {
      await this.refreshDevices()
      const available = this.devices.some((deviceInfo) => deviceInfo.serial === serial && deviceInfo.status === 'device')
      if (available && !this.sessions.has(serial)) {
        void this.launchScrcpy(serial, true)
      }
    }, delay)
  }

  private async createScrcpyCommand(serial: string): Promise<CommandPreview> {
    const state = this.store.getState()
    const paths = resolveToolPaths(state.toolPaths)
    const record = state.devices[serial]
    const device = this.devices.find((entry) => entry.serial === serial)
    const targetSerial = await this.resolveScrcpyTargetSerial(serial)
    const displayName = record?.displayName || device?.displayName || serial
    const settings = mergeSettings(state.globalSettings, record?.overrides ?? {})
    return buildScrcpyCommand(paths.scrcpyPath, targetSerial, displayName, settings)
  }

  private async resolveScrcpyTargetSerial(serial: string): Promise<string> {
    const device = this.devices.find((entry) => entry.serial === serial)
    if (!isAdbTlsConnectSerial(serial)) {
      return device?.connectionSerial || serial
    }
    const { adbPath } = resolveToolPaths(this.store.getState().toolPaths)
    const servicesResult = await runCommand(adbPath, ['mdns', 'services'], undefined, 8000)
    const service = parseMdnsServices(servicesResult.stdout).find((entry) => `${entry.name}._adb-tls-connect._tcp.` === serial)
    if (service) {
      await this.connectWirelessHost(service.host)
      await this.refreshDevices()
    }
    return this.devices.find((entry) => entry.serial === serial)?.connectionSerial || serial
  }

  private mergeRememberedDevices(seen: DeviceInfo[]): DeviceInfo[] {
    const state = this.store.getState()
    const seenBySerial = new Map(seen.map((device) => [device.serial, device]))
    const merged = new Map<string, DeviceInfo>()

    for (const device of seen) {
      const record = state.devices[device.serial]
      merged.set(device.serial, {
        ...device,
        displayName: record?.displayName || device.displayName,
        remembered: Boolean(record),
        lastSeenAt: record?.lastSeenAt,
        running: this.sessions.has(device.serial),
        autoReconnect: record?.autoReconnect ?? false
      })
    }

    for (const [serial, record] of Object.entries(state.devices)) {
      if (!seenBySerial.has(serial)) {
        merged.set(serial, {
          serial,
          status: 'remembered',
          displayName: record.displayName,
          model: record.model,
          product: record.product,
          device: record.device,
          transport: record.transport,
          lastSeenAt: record.lastSeenAt,
          remembered: true,
          running: this.sessions.has(serial),
          autoReconnect: record.autoReconnect
        })
      }
    }

    return [...merged.values()].sort((a, b) => a.displayName.localeCompare(b.displayName))
  }

  private snapshot(): AppSnapshot {
    this.devices = this.mergeRememberedDevices(this.devices)
    return {
      devices: this.devices,
      state: this.store.getState(),
      logs: [...this.logs]
    }
  }

  private broadcast(): AppSnapshot {
    const snapshot = this.snapshot()
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(ipcChannels.snapshot, snapshot)
    })
    return snapshot
  }

  private log(level: LogEntry['level'], message: string): void {
    this.logs.unshift({
      id: randomUUID(),
      level,
      message,
      timestamp: new Date().toISOString()
    })
    this.logs.splice(100)
  }
}

export function randomAdbToken(length: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = randomBytes(length)
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('')
}

export function buildAdbWifiQrPayload(serviceName: string, password: string): string {
  return `WIFI:T:ADB;S:${serviceName};P:${password};;`
}

function findPairingService(output: string, serviceName: string) {
  const services = parseMdnsServices(output).filter((entry) => entry.type === '_adb-tls-pairing._tcp')
  return services.find((entry) => entry.name === serviceName) ?? services[0]
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function forceKillProcess(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }
  child.kill('SIGKILL')
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
    }
  }, 300)
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
