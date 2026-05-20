import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity,
  Cable,
  Check,
  ChevronDown,
  ChevronUp,
  Terminal,
  MonitorUp,
  Play,
  QrCode,
  RefreshCw,
  Settings,
  Square,
  Trash2,
  Wifi
} from 'lucide-react'
import './styles.css'
import { defaultScrcpySettings, type AppSnapshot, type DeviceInfo, type ManualCommandResult, type PairingSession, type ScrcpySettings, type ToolPaths } from '../../shared/types'

const emptySnapshot: AppSnapshot = {
  devices: [],
  state: {
    version: 1,
    globalSettings: defaultScrcpySettings,
    devices: {},
    rememberedWirelessHosts: [],
    forgottenDevices: [],
    toolPaths: { adbPath: null, scrcpyPath: null }
  },
  logs: []
}

function App(): JSX.Element {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(emptySnapshot)
  const [selectedSerial, setSelectedSerial] = useState<string | null>(null)
  const [showGlobal, setShowGlobal] = useState(false)
  const [showWireless, setShowWireless] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const unsubscribe = window.scrcpyOpener.onSnapshot((next) => {
      setSnapshot(next)
      setSelectedSerial((current) => current ?? next.devices[0]?.serial ?? null)
    })
    void window.scrcpyOpener.getSnapshot().then((next) => {
      setSnapshot(next)
      setSelectedSerial(next.devices[0]?.serial ?? null)
    })
    return unsubscribe
  }, [])

  const selectedDevice = useMemo(
    () => snapshot.devices.find((device) => device.serial === selectedSerial) ?? snapshot.devices[0] ?? null,
    [selectedSerial, snapshot.devices]
  )

  async function run(action: () => Promise<AppSnapshot> | Promise<unknown>): Promise<void> {
    setBusy(true)
    try {
      const result = await action()
      if (isSnapshot(result)) {
        setSnapshot(result)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="toolbar">
        <div className="brand">
          <MonitorUp size={20} />
          <div>
            <strong>Scrcpy Opener</strong>
            <span>{snapshot.devices.length} devices</span>
          </div>
        </div>
        <div className="toolbar-actions">
          <button className="icon-button" title="Refresh devices" disabled={busy} onClick={() => run(window.scrcpyOpener.refreshDevices)}>
            <RefreshCw size={18} />
          </button>
          <button className="command-button" onClick={() => setShowWireless(true)}>
            <Wifi size={17} />
            Add wireless
          </button>
          <button className="command-button" onClick={() => setShowTerminal(true)}>
            <Terminal size={17} />
            Command
          </button>
          <button className="icon-button" title="Global settings" onClick={() => setShowGlobal(true)}>
            <Settings size={18} />
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="device-list" aria-label="Devices">
          {snapshot.devices.length === 0 ? (
            <div className="empty-state">
              <Cable size={30} />
              <strong>No devices found</strong>
              <span>Connect USB, pair wireless debugging, or refresh after starting adb.</span>
            </div>
          ) : (
            snapshot.devices.map((device) => (
              <DeviceRow
                key={device.serial}
                device={device}
                selected={device.serial === selectedDevice?.serial}
                onSelect={() => setSelectedSerial(device.serial)}
                onOpen={() => run(() => window.scrcpyOpener.openScrcpy(device.serial))}
                onStop={() => run(() => window.scrcpyOpener.stopScrcpy(device.serial))}
              />
            ))
          )}
        </section>

        <section className="detail-panel">
          {selectedDevice ? (
            <DeviceDetail
              device={selectedDevice}
              snapshot={snapshot}
              onSnapshot={setSnapshot}
              onRun={run}
            />
          ) : (
            <div className="empty-state large">
              <MonitorUp size={42} />
              <strong>Select a device</strong>
              <span>Device controls and scrcpy options appear here.</span>
            </div>
          )}
        </section>
      </main>

      <BottomPanel snapshot={snapshot} />

      {showGlobal && (
        <GlobalSettingsModal snapshot={snapshot} onClose={() => setShowGlobal(false)} onSnapshot={setSnapshot} onRun={run} />
      )}

      {showWireless && (
        <WirelessModal
          onClose={() => setShowWireless(false)}
          onSnapshot={setSnapshot}
          onRun={run}
          devices={snapshot.devices}
        />
      )}

      {showTerminal && <CommandWindow onClose={() => setShowTerminal(false)} />}
    </div>
  )
}

function BridgeError(): JSX.Element {
  return (
    <div className="bridge-error">
      <strong>Scrcpy Opener could not load its Electron bridge.</strong>
      <span>Restart the dev server. If this persists, check the preload build output.</span>
    </div>
  )
}

function GlobalSettingsModal({
  snapshot,
  onClose,
  onSnapshot,
  onRun
}: {
  snapshot: AppSnapshot
  onClose: () => void
  onSnapshot: (snapshot: AppSnapshot) => void
  onRun: (action: () => Promise<AppSnapshot> | Promise<unknown>) => Promise<void>
}): JSX.Element {
  const [paths, setPaths] = useState<ToolPaths>(snapshot.state.toolPaths)

  useEffect(() => setPaths(snapshot.state.toolPaths), [snapshot.state.toolPaths])

  return (
    <Modal title="Global Settings" onClose={onClose}>
      <div className="modal-stack">
        <section>
          <h2>Import / export</h2>
          <p className="helper-text">Move global defaults, device names, device overrides, auto reconnect settings, and tool paths between installs.</p>
          <div className="form-actions split-actions">
            <button className="command-button" onClick={() => onRun(window.scrcpyOpener.importSettings)}>
              Import settings
            </button>
            <button className="command-button" onClick={() => onRun(window.scrcpyOpener.exportSettings)}>
              Export settings
            </button>
          </div>
        </section>
        <section>
          <h2>Tool paths</h2>
          <div className="settings-grid">
            <label>
              adb path
              <input value={paths.adbPath ?? ''} onChange={(event) => setPaths((current) => ({ ...current, adbPath: event.target.value }))} placeholder="Bundled adb or PATH fallback" />
            </label>
            <label>
              scrcpy path
              <input value={paths.scrcpyPath ?? ''} onChange={(event) => setPaths((current) => ({ ...current, scrcpyPath: event.target.value }))} placeholder="Bundled scrcpy or PATH fallback" />
            </label>
          </div>
          <div className="form-actions">
            <button
              className="command-button"
              onClick={() =>
                onRun(async () => {
                  const next = await window.scrcpyOpener.saveToolPaths(paths)
                  onSnapshot(next)
                  return next
                })
              }
            >
              <Check size={16} />
              Save paths
            </button>
          </div>
        </section>
        <section>
          <h2>Scrcpy defaults</h2>
          <p className="helper-text">Defaults apply to all newly added devices. You can override them per device from the device panel.</p>
          <SettingsForm
            settings={snapshot.state.globalSettings}
            resetKey="global"
            autoSave
            onSave={(settings) => onRun(() => window.scrcpyOpener.saveGlobalSettings(settings)).then(() => undefined)}
          />
        </section>
      </div>
    </Modal>
  )
}

function DeviceRow({
  device,
  selected,
  onSelect,
  onOpen,
  onStop
}: {
  device: DeviceInfo
  selected: boolean
  onSelect: () => void
  onOpen: () => void
  onStop: () => void
}): JSX.Element {
  return (
    <button className={`device-row ${selected ? 'selected' : ''}`} onClick={onSelect}>
      <div className="device-main">
        <strong>{device.displayName}</strong>
        <span>{device.serial}</span>
      </div>
      <div className="device-meta">
        <span className={`status ${device.status}`}>{formatDeviceStatus(device.status)}</span>
        <span>{device.transport ?? 'unknown'}</span>
      </div>
      <div className="row-actions" onClick={(event) => event.stopPropagation()}>
        {device.running ? (
          <button className="icon-button compact" title="Stop scrcpy" onClick={onStop}>
            <Square size={15} />
          </button>
        ) : (
          <button className="icon-button compact" title="Open scrcpy" disabled={device.status !== 'device'} onClick={onOpen}>
            <Play size={15} />
          </button>
        )}
      </div>
    </button>
  )
}

function DeviceDetail({
  device,
  snapshot,
  onSnapshot,
  onRun
}: {
  device: DeviceInfo
  snapshot: AppSnapshot
  onSnapshot: (snapshot: AppSnapshot) => void
  onRun: (action: () => Promise<AppSnapshot> | Promise<unknown>) => Promise<void>
}): JSX.Element {
  const record = snapshot.state.devices[device.serial]
  const overrides = record?.overrides ?? {}
  const [name, setName] = useState(device.displayName)
  const [editingName, setEditingName] = useState(false)
  const [command, setCommand] = useState('')

  useEffect(() => {
    setName(device.displayName)
    setEditingName(false)
  }, [device.serial])

  useEffect(() => {
    if (!editingName) {
      setName(device.displayName)
    }
  }, [device.displayName, editingName])

  useEffect(() => {
    void window.scrcpyOpener.getCommandPreview(device.serial).then((preview) => {
      setCommand([preview.executable, ...preview.args.map(quoteArg)].join(' '))
    })
  }, [device.serial, device.displayName, snapshot.state])

  return (
    <div className="detail-content">
      <div className="detail-heading">
        <div>
          <h1>{device.displayName}</h1>
          <p>{device.model || device.product || device.serial}</p>
        </div>
        <div className="detail-actions">
          {device.running ? (
            <button className="command-button danger" onClick={() => onRun(() => window.scrcpyOpener.stopScrcpy(device.serial))}>
              <Square size={16} />
              Stop
            </button>
          ) : (
            <button className="command-button primary" disabled={device.status !== 'device'} onClick={() => onRun(() => window.scrcpyOpener.openScrcpy(device.serial))}>
              <Play size={16} />
              Open
            </button>
          )}
          <button className="icon-button" title="Forget device" onClick={() => onRun(() => window.scrcpyOpener.forgetDevice(device.serial))}>
            <Trash2 size={17} />
          </button>
        </div>
      </div>

      <div className="fields-grid">
        <label>
          Device name
          <div className="inline-edit">
            <input
              value={name}
              onFocus={() => setEditingName(true)}
              onChange={(event) => {
                setEditingName(true)
                setName(event.target.value)
              }}
            />
            <button
              className="icon-button"
              title="Save name"
              onClick={() =>
                onRun(async () => {
                  const next = await window.scrcpyOpener.renameDevice(device.serial, name)
                  setEditingName(false)
                  return next
                })
              }
            >
              <Check size={16} />
            </button>
          </div>
        </label>
      </div>
      <div className="auto-connect-row">
        <label className="toggle-line">
          <input
            type="checkbox"
            checked={device.autoReconnect}
            onChange={(event) => onRun(() => window.scrcpyOpener.setDeviceAutoReconnect(device.serial, event.target.checked))}
          />
          Auto reconnect
        </label>
      </div>

      <div className="command-preview">{command}</div>

      <p className="helper-text">Device overrides apply only to this device.</p>
      <SettingsForm
        settings={{ ...defaultScrcpySettings, ...snapshot.state.globalSettings, ...overrides }}
        resetKey={`device:${device.serial}`}
        autoSave
        onSave={async (settings) => {
          const next = await window.scrcpyOpener.saveDeviceOverrides(device.serial, settings)
          onSnapshot(next)
        }}
      />
    </div>
  )
}

function SettingsForm({
  settings,
  resetKey,
  autoSave = false,
  onSave
}: {
  settings: ScrcpySettings
  resetKey: string
  autoSave?: boolean
  onSave: (settings: ScrcpySettings) => Promise<void>
}): JSX.Element {
  const [draft, setDraft] = useState(settings)
  useEffect(() => setDraft(settings), [resetKey])

  const set = <K extends keyof ScrcpySettings>(key: K, value: ScrcpySettings[K]): void => {
    setDraft((current) => {
      const next = { ...current, [key]: value }
      if (autoSave) {
        void onSave(next)
      }
      return next
    })
  }

  return (
    <form
      className="settings-form"
      onSubmit={(event) => {
        event.preventDefault()
        void onSave(draft)
      }}
    >
      <div className="settings-grid">
        <label>
          Codec
          <select value={draft.videoCodec} onChange={(event) => set('videoCodec', event.target.value as ScrcpySettings['videoCodec'])}>
            <option value="">Default</option>
            <option value="h264">H.264</option>
            <option value="h265">H.265</option>
            <option value="av1">AV1</option>
          </select>
        </label>
        <label>
          Bit rate
          <input value={draft.videoBitRate} onChange={(event) => set('videoBitRate', event.target.value)} placeholder="8M" />
        </label>
        <NumberField label="Max FPS" value={draft.maxFps} onChange={(value) => set('maxFps', value)} />
        <NumberField label="Max size" value={draft.maxSize} onChange={(value) => set('maxSize', value)} />
        <NumberField label="Window width" value={draft.windowWidth} onChange={(value) => set('windowWidth', value)} />
        <NumberField label="Window height" value={draft.windowHeight} onChange={(value) => set('windowHeight', value)} />
        <label>
          Orientation
          <select value={draft.captureOrientation} onChange={(event) => set('captureOrientation', event.target.value as ScrcpySettings['captureOrientation'])}>
            <option value="default">Default</option>
            <option value="0">0°</option>
            <option value="90">90° clockwise</option>
            <option value="180">180°</option>
            <option value="270">270° clockwise</option>
            <option value="flip0">Flip 0°</option>
            <option value="flip90">Flip 90°</option>
            <option value="flip180">Flip 180°</option>
            <option value="flip270">Flip 270°</option>
          </select>
        </label>
        <Toggle
          className="full-row"
          label="Lock orientation"
          checked={draft.lockOrientation}
          onChange={(value) => set('lockOrientation', value)}
        />
      </div>
      <div className="toggles">
        <Toggle label="Stay awake" checked={draft.stayAwake} onChange={(value) => set('stayAwake', value)} />
        <Toggle label="Keep active" checked={draft.keepActive} onChange={(value) => set('keepActive', value)} />
        <Toggle label="Always on top" checked={draft.alwaysOnTop} onChange={(value) => set('alwaysOnTop', value)} />
        <Toggle label="Fullscreen" checked={draft.fullscreen} onChange={(value) => set('fullscreen', value)} />
        <Toggle label="Borderless" checked={draft.borderless} onChange={(value) => set('borderless', value)} />
        <Toggle label="Lock aspect ratio" checked={draft.lockAspectRatio} onChange={(value) => set('lockAspectRatio', value)} />
        <Toggle label="Read only" checked={draft.readOnly} onChange={(value) => set('readOnly', value)} />
      </div>
      <label>
        Extra flags
        <input value={draft.extraFlags} onChange={(event) => set('extraFlags', event.target.value)} placeholder="--turn-screen-off --render-fit=letterbox" />
      </label>
      {!autoSave && (
        <div className="form-actions">
          <button className="command-button primary" type="submit">
            <Check size={16} />
            Save settings
          </button>
        </div>
      )}
    </form>
  )
}

function WirelessModal({
  onClose,
  onSnapshot,
  onRun,
  devices
}: {
  onClose: () => void
  onSnapshot: (snapshot: AppSnapshot) => void
  onRun: (action: () => Promise<AppSnapshot> | Promise<unknown>) => Promise<void>
  devices: DeviceInfo[]
}): JSX.Element {
  const [pairing, setPairing] = useState<PairingSession | null>(null)
  const pairingRef = useRef<PairingSession | null>(null)
  const closeAfterConnectedRef = useRef(false)
  const [pairHost, setPairHost] = useState('')
  const [pairCode, setPairCode] = useState('')
  const [connectHost, setConnectHost] = useState('')
  const [legacySerial, setLegacySerial] = useState(devices.find((device) => device.status === 'device')?.serial ?? '')
  const [legacyHost, setLegacyHost] = useState('')

  useEffect(() => {
    pairingRef.current = pairing
  }, [pairing])

  useEffect(() => {
    let mounted = true
    void window.scrcpyOpener.startQrPairing().then((next) => {
      if (mounted) {
        setPairing(next)
      }
    })
    return () => {
      mounted = false
      if (closeAfterConnectedRef.current) {
        return
      }
      const current = pairingRef.current
      if (current && current.status !== 'connected' && current.status !== 'failed' && current.status !== 'cancelled') {
        void window.scrcpyOpener.cancelQrPairing(current.id).catch(() => undefined)
      }
    }
  }, [])

  useEffect(() => {
    if (!pairing || pairing.status === 'failed' || pairing.status === 'cancelled') {
      return undefined
    }

    async function poll(): Promise<void> {
      const current = pairingRef.current
      if (!current || closeAfterConnectedRef.current) {
        return
      }
      const next = await window.scrcpyOpener.getQrPairing(current.id)
      if (!next) {
        return
      }
      setPairing(next)
      if (next.status === 'connected') {
        closeAfterConnectedRef.current = true
        const snapshot = await window.scrcpyOpener.refreshDevices()
        onSnapshot(snapshot)
        onClose()
      }
    }

    void poll()
    const timer = setInterval(() => {
      void poll()
    }, 1000)
    return () => clearInterval(timer)
  }, [onClose, onSnapshot, pairing?.id, pairing?.status])

  function closeWirelessModal(): void {
    const current = pairingRef.current
    if (current && current.status !== 'connected' && current.status !== 'failed' && current.status !== 'cancelled') {
      void window.scrcpyOpener.cancelQrPairing(current.id).catch(() => undefined)
    }
    onClose()
  }

  return (
    <Modal title="Add Wireless Device" onClose={closeWirelessModal}>
      <div className="wireless-layout">
        <section>
          <h2><QrCode size={17} /> QR pairing</h2>
          {pairing ? (
            <div className="qr-panel">
              <img src={pairing.qrDataUrl} alt="ADB wireless debugging QR code" />
              <p>{pairing.message}</p>
            </div>
          ) : (
            <div className="qr-panel">
              <div className="qr-placeholder">Preparing QR code...</div>
            </div>
          )}
        </section>
        <section>
          <h2><Wifi size={17} /> Manual pair</h2>
          <input value={pairHost} onChange={(event) => setPairHost(event.target.value)} placeholder="Pair host, e.g. 192.168.1.20:37123" />
          <input value={pairCode} onChange={(event) => setPairCode(event.target.value)} placeholder="Pairing code" />
          <input value={connectHost} onChange={(event) => setConnectHost(event.target.value)} placeholder="Connect host, optional" />
          <button
            className="command-button primary"
            onClick={() =>
              onRun(async () => {
                const next = await window.scrcpyOpener.manualPair({ pairHost, pairCode, connectHost: connectHost || undefined })
                onSnapshot(next)
                onClose()
                return next
              })
            }
          >
            Pair
          </button>
        </section>
        <section>
          <h2><Cable size={17} /> USB-assisted wireless</h2>
          <select value={legacySerial} onChange={(event) => setLegacySerial(event.target.value)}>
            <option value="">Select USB device</option>
            {devices.filter((device) => device.status === 'device').map((device) => (
              <option key={device.serial} value={device.serial}>{device.displayName}</option>
            ))}
          </select>
          <input value={legacyHost} onChange={(event) => setLegacyHost(event.target.value)} placeholder="Device IP, e.g. 192.168.1.20" />
          <button
            className="command-button"
            disabled={!legacySerial || !legacyHost}
            onClick={() =>
              onRun(() => window.scrcpyOpener.legacyWirelessConnect({ serial: legacySerial, host: legacyHost, port: 5555 }))
            }
          >
            Enable TCP/IP
          </button>
        </section>
      </div>
    </Modal>
  )
}

function BottomPanel({ snapshot }: { snapshot: AppSnapshot }): JSX.Element {
  const [tab, setTab] = useState<'logs' | 'diagnostics'>('logs')
  const [expanded, setExpanded] = useState(false)
  const [height, setHeight] = useState(170)
  const [diagnostics, setDiagnostics] = useState<string | null>(null)
  const logEndRef = React.useRef<HTMLDivElement | null>(null)

  function startResize(event: React.PointerEvent<HTMLDivElement>): void {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = height
    const onMove = (moveEvent: PointerEvent): void => {
      const nextHeight = Math.min(360, Math.max(90, startHeight + startY - moveEvent.clientY))
      setHeight(nextHeight)
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  useEffect(() => {
    if (tab === 'diagnostics') {
      void window.scrcpyOpener.getDiagnostics().then((value) => setDiagnostics(JSON.stringify(value, null, 2)))
    }
  }, [tab, snapshot.logs.length])

  useEffect(() => {
    if (tab === 'logs') {
      logEndRef.current?.scrollIntoView({ block: 'end' })
    }
  }, [snapshot.logs, tab])

  const logs = [...snapshot.logs].reverse()

  return (
    <footer
      className={`bottom-panel ${expanded ? 'expanded' : 'collapsed'}`}
      style={expanded ? { '--panel-height': `${height}px` } as React.CSSProperties : undefined}
    >
      {expanded && <div className="panel-resize-handle" title="Resize panel" onPointerDown={startResize} />}
      <div className="panel-tabs">
        <button className="panel-toggle" title={expanded ? 'Collapse panel' : 'Expand panel'} onClick={() => setExpanded((value) => !value)}>
          {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
        <button className={tab === 'logs' ? 'active' : ''} onClick={() => { setTab('logs'); setExpanded(true) }}>
          <Terminal size={15} />
          Logs
        </button>
        <button className={tab === 'diagnostics' ? 'active' : ''} onClick={() => { setTab('diagnostics'); setExpanded(true) }}>
          <Activity size={15} />
          Diagnostics
        </button>
      </div>
      {expanded && tab === 'logs' ? (
        <div className="panel-body log-panel">
          {logs.length === 0 ? (
            <span className="panel-empty">No logs yet.</span>
          ) : (
            logs.map((log) => (
              <div key={log.id} className={`log-entry ${log.level}`}>
                <time>{formatLogTime(log.timestamp)}</time>
                <strong>{log.level}</strong>
                <span>{log.message}</span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      ) : expanded ? (
        <pre className="panel-body diagnostics-panel">{diagnostics ?? 'Loading diagnostics...'}</pre>
      ) : null}
    </footer>
  )
}

function formatLogTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

interface TerminalLine {
  id: string
  kind: 'command' | 'stdout' | 'stderr' | 'error' | 'meta'
  text: string
}

function CommandWindow({ onClose }: { onClose: () => void }): JSX.Element {
  const [command, setCommand] = useState('adb devices -l')
  const [running, setRunning] = useState(false)
  const [lines, setLines] = useState<TerminalLine[]>([
    {
      id: crypto.randomUUID(),
      kind: 'meta',
      text: 'Manual console ready. Supported commands: adb ..., scrcpy ..., clear.'
    }
  ])

  async function submit(event?: React.FormEvent): Promise<void> {
    event?.preventDefault()
    const trimmed = command.trim()
    if (!trimmed || running) {
      return
    }
    if (trimmed.toLowerCase() === 'clear') {
      setLines([])
      setCommand('')
      return
    }
    setRunning(true)
    setLines((current) => [...current, { id: crypto.randomUUID(), kind: 'command', text: `$ ${trimmed}` }])
    try {
      const result = await window.scrcpyOpener.runManualCommand(trimmed)
      setLines((current) => [...current, ...formatManualResult(result)])
    } catch (error) {
      setLines((current) => [
        ...current,
        { id: crypto.randomUUID(), kind: 'error', text: error instanceof Error ? error.message : String(error) }
      ])
    } finally {
      setRunning(false)
      setCommand('')
    }
  }

  return (
    <Modal title="Command Window" onClose={onClose}>
      <div className="terminal-window">
        <div className="terminal-output" aria-live="polite">
          {lines.length === 0 ? (
            <span className="terminal-line meta">Cleared.</span>
          ) : (
            lines.map((line) => (
              <pre key={line.id} className={`terminal-line ${line.kind}`}>{line.text}</pre>
            ))
          )}
        </div>
        <form className="terminal-input-row" onSubmit={(event) => void submit(event)}>
          <span>$</span>
          <input
            autoFocus
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="adb devices -l"
          />
          <button className="command-button primary" disabled={running} type="submit">
            <Terminal size={16} />
            Run
          </button>
        </form>
        <div className="terminal-hints">
          <button type="button" onClick={() => setCommand('adb devices -l')}>adb devices</button>
          <button type="button" onClick={() => setCommand('adb mdns services')}>adb mdns</button>
          <button type="button" onClick={() => setCommand('scrcpy --version')}>scrcpy version</button>
          <button type="button" onClick={() => setCommand('scrcpy --serial ')}>scrcpy serial</button>
        </div>
      </div>
    </Modal>
  )
}

function formatManualResult(result: ManualCommandResult): TerminalLine[] {
  if (result.command.toLowerCase() === 'clear') {
    return []
  }
  const lines: TerminalLine[] = []
  if (result.error) {
    lines.push({ id: crypto.randomUUID(), kind: 'error', text: result.error })
    return lines
  }
  if (result.stdout) {
    lines.push({ id: crypto.randomUUID(), kind: 'stdout', text: result.stdout.trimEnd() })
  }
  if (result.stderr) {
    lines.push({ id: crypto.randomUUID(), kind: 'stderr', text: result.stderr.trimEnd() })
  }
  lines.push({
    id: crypto.randomUUID(),
    kind: 'meta',
    text: result.startedDetached ? 'scrcpy started in a separate process.' : `Exited with code ${result.exitCode ?? 'unknown'}.`
  })
  return lines
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }): JSX.Element {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <h1>{title}</h1>
          <button className="icon-button" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }): JSX.Element {
  return (
    <label>
      {label}
      <input type="number" min="0" value={value ?? ''} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)} />
    </label>
  )
}

function Toggle({
  label,
  checked,
  className,
  onChange
}: {
  label: string
  checked: boolean
  className?: string
  onChange: (value: boolean) => void
}): JSX.Element {
  return (
    <label className={`toggle-line${className ? ` ${className}` : ''}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  )
}

function quoteArg(value: string): string {
  return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value
}

function formatDeviceStatus(status: DeviceInfo['status']): string {
  if (status === 'device') {
    return 'connected'
  }
  if (status === 'remembered') {
    return 'saved'
  }
  return status
}

function isSnapshot(value: unknown): value is AppSnapshot {
  return Boolean(value && typeof value === 'object' && 'devices' in value && 'state' in value)
}

createRoot(document.getElementById('root')!).render(window.scrcpyOpener ? <App /> : <BridgeError />)
