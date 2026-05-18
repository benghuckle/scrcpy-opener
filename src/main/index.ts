import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { join } from 'node:path'
import { AppService } from './appService'
import { AppStore } from './store'
import { ipcChannels } from '../shared/ipc'

let mainWindow: BrowserWindow | null = null
let service: AppService

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    show: false,
    title: 'Scrcpy Opener',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle(ipcChannels.getSnapshot, () => service.getSnapshot())
  ipcMain.handle(ipcChannels.refreshDevices, () => service.refreshDevices())
  ipcMain.handle(ipcChannels.saveGlobalSettings, (_event, settings) => service.saveGlobalSettings(settings))
  ipcMain.handle(ipcChannels.saveToolPaths, (_event, paths) => service.saveToolPaths(paths))
  ipcMain.handle(ipcChannels.renameDevice, (_event, serial, displayName) => service.renameDevice(serial, displayName))
  ipcMain.handle(ipcChannels.forgetDevice, (_event, serial) => service.forgetDevice(serial))
  ipcMain.handle(ipcChannels.setDeviceAutoReconnect, (_event, serial, enabled) =>
    service.setDeviceAutoReconnect(serial, enabled)
  )
  ipcMain.handle(ipcChannels.saveDeviceOverrides, (_event, serial, overrides) =>
    service.saveDeviceOverrides(serial, overrides)
  )
  ipcMain.handle(ipcChannels.openScrcpy, (_event, serial) => service.openScrcpy(serial))
  ipcMain.handle(ipcChannels.stopScrcpy, (_event, serial) => service.stopScrcpy(serial))
  ipcMain.handle(ipcChannels.getCommandPreview, (_event, serial) => service.getCommandPreview(serial))
  ipcMain.handle(ipcChannels.runManualCommand, (_event, command) => service.runManualCommand(command))
  ipcMain.handle(ipcChannels.startQrPairing, () => service.startQrPairing())
  ipcMain.handle(ipcChannels.getQrPairing, (_event, id) => service.getQrPairing(id))
  ipcMain.handle(ipcChannels.cancelQrPairing, (_event, id) => service.cancelQrPairing(id))
  ipcMain.handle(ipcChannels.manualPair, (_event, request) => service.manualPair(request))
  ipcMain.handle(ipcChannels.legacyWirelessConnect, (_event, request) => service.legacyWirelessConnect(request))
  ipcMain.handle(ipcChannels.getDiagnostics, () => service.getDiagnostics())
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.scrcpyopener.app')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  service = new AppService(new AppStore())
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
