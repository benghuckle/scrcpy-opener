import { describe, expect, it } from 'vitest'
import { AppStore, migrateState } from '../src/main/store'
import { defaultScrcpySettings } from '../src/shared/types'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('migrateState', () => {
  it('fills defaults and preserves device records', () => {
    const state = migrateState({
      devices: {
        abc: {
          serial: 'abc',
          displayName: 'Phone',
          autoReconnect: true,
          overrides: { maxFps: 30 }
        }
      }
    })

    expect(state.version).toBe(1)
    expect(state.globalSettings.videoCodec).toBe('')
    expect(state.devices.abc.displayName).toBe('Phone')
    expect(state.devices.abc.autoReconnect).toBe(true)
    expect(state.devices.abc.overrides).toEqual({ maxFps: 30 })
  })

  it('remembers forgotten devices and does not upsert them during refresh', () => {
    const store = new AppStore(join(mkdtempSync(join(tmpdir(), 'scrcpy-opener-')), 'state.json'))
    store.forgetDevice('abc')
    store.upsertSeenDevice({
      serial: 'abc',
      status: 'device',
      displayName: 'Phone',
      model: 'Phone',
      remembered: false,
      running: false,
      autoReconnect: false
    })

    expect(store.getState().forgottenDevices).toEqual(['abc'])
    expect(store.getState().devices.abc).toBeUndefined()
  })

  it('can unforget devices after an explicit wireless add flow', () => {
    const store = new AppStore(join(mkdtempSync(join(tmpdir(), 'scrcpy-opener-')), 'state.json'))
    store.forgetDevice('abc')
    store.unforgetDevices(['abc'])
    store.upsertSeenDevice({
      serial: 'abc',
      status: 'device',
      displayName: 'Phone',
      model: 'Phone',
      remembered: false,
      running: false,
      autoReconnect: false
    })

    expect(store.getState().forgottenDevices).toEqual([])
    expect(store.getState().devices.abc.displayName).toBe('Phone')
  })

  it('replaces state through migration for imported settings', () => {
    const store = new AppStore(join(mkdtempSync(join(tmpdir(), 'scrcpy-opener-')), 'state.json'))
    store.replaceState({
      globalSettings: { ...defaultScrcpySettings, videoBitRate: '12M' },
      devices: {
        abc: {
          serial: 'abc',
          displayName: 'Imported Phone',
          autoReconnect: true,
          overrides: { maxSize: 1200 }
        }
      },
      rememberedWirelessHosts: ['10.0.0.2:5555']
    })

    const state = store.getState()
    expect(state.globalSettings.videoBitRate).toBe('12M')
    expect(state.globalSettings.videoCodec).toBe('')
    expect(state.devices.abc.displayName).toBe('Imported Phone')
    expect(state.devices.abc.overrides.maxSize).toBe(1200)
    expect(state.rememberedWirelessHosts).toEqual(['10.0.0.2:5555'])
  })
})
