import { describe, expect, it } from 'vitest'
import { parseManualCommand } from '../src/main/manualCommand'

describe('parseManualCommand', () => {
  it('allows adb and preserves quoted args', () => {
    expect(parseManualCommand('adb shell "pm list packages"')).toEqual({
      tool: 'adb',
      args: ['shell', 'pm list packages']
    })
  })

  it('allows scrcpy commands', () => {
    expect(parseManualCommand('scrcpy --serial abc123 --video-codec=h265')).toEqual({
      tool: 'scrcpy',
      args: ['--serial', 'abc123', '--video-codec=h265']
    })
  })

  it('rejects shell commands', () => {
    expect(() => parseManualCommand('rm -rf vendor')).toThrow('Only adb, scrcpy, and clear commands are supported.')
  })
})
