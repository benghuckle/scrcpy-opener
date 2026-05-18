import { describe, expect, it } from 'vitest'
import { migrateState } from '../src/main/store'

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
    expect(state.globalSettings.videoCodec).toBe('h264')
    expect(state.devices.abc.displayName).toBe('Phone')
    expect(state.devices.abc.autoReconnect).toBe(true)
    expect(state.devices.abc.overrides).toEqual({ maxFps: 30 })
  })
})
