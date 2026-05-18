import { contextBridge, ipcRenderer } from 'electron'
import { ipcChannels } from '../shared/ipc'
import type { AppApi, AppSnapshot } from '../shared/types'

const api: AppApi = {
  getSnapshot: () => ipcRenderer.invoke(ipcChannels.getSnapshot),
  refreshDevices: () => ipcRenderer.invoke(ipcChannels.refreshDevices),
  saveGlobalSettings: (settings) => ipcRenderer.invoke(ipcChannels.saveGlobalSettings, settings),
  saveToolPaths: (paths) => ipcRenderer.invoke(ipcChannels.saveToolPaths, paths),
  renameDevice: (serial, displayName) => ipcRenderer.invoke(ipcChannels.renameDevice, serial, displayName),
  forgetDevice: (serial) => ipcRenderer.invoke(ipcChannels.forgetDevice, serial),
  setDeviceAutoReconnect: (serial, enabled) => ipcRenderer.invoke(ipcChannels.setDeviceAutoReconnect, serial, enabled),
  saveDeviceOverrides: (serial, overrides) => ipcRenderer.invoke(ipcChannels.saveDeviceOverrides, serial, overrides),
  openScrcpy: (serial) => ipcRenderer.invoke(ipcChannels.openScrcpy, serial),
  stopScrcpy: (serial) => ipcRenderer.invoke(ipcChannels.stopScrcpy, serial),
  getCommandPreview: (serial) => ipcRenderer.invoke(ipcChannels.getCommandPreview, serial),
  runManualCommand: (command) => ipcRenderer.invoke(ipcChannels.runManualCommand, command),
  startQrPairing: () => ipcRenderer.invoke(ipcChannels.startQrPairing),
  getQrPairing: (id) => ipcRenderer.invoke(ipcChannels.getQrPairing, id),
  cancelQrPairing: (id) => ipcRenderer.invoke(ipcChannels.cancelQrPairing, id),
  manualPair: (request) => ipcRenderer.invoke(ipcChannels.manualPair, request),
  legacyWirelessConnect: (request) => ipcRenderer.invoke(ipcChannels.legacyWirelessConnect, request),
  getDiagnostics: () => ipcRenderer.invoke(ipcChannels.getDiagnostics),
  onSnapshot: (callback: (snapshot: AppSnapshot) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: AppSnapshot): void => callback(snapshot)
    ipcRenderer.on(ipcChannels.snapshot, listener)
    return () => ipcRenderer.removeListener(ipcChannels.snapshot, listener)
  }
}

contextBridge.exposeInMainWorld('scrcpyOpener', api)
