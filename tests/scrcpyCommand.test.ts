import { describe, expect, it } from 'vitest'
import { defaultScrcpySettings } from '../src/shared/types'
import { buildScrcpyCommand, parseExtraFlags } from '../src/main/scrcpyCommand'

describe('buildScrcpyCommand', () => {
  it('omits codec and bitrate when defaults are unset', () => {
    const command = buildScrcpyCommand('/bin/scrcpy', 'abc123', 'Desk Phone', defaultScrcpySettings)

    expect(command.args).not.toContain('--video-codec=')
    expect(command.args).not.toContain('--video-bit-rate=')
  })

  it('builds explicit serial and title plus selected flags', () => {
    const command = buildScrcpyCommand('/bin/scrcpy', 'abc123', 'Desk Phone', {
      ...defaultScrcpySettings,
      videoCodec: 'h265',
      videoBitRate: '12M',
      maxFps: 30,
      maxSize: 1600,
      windowWidth: 540,
      windowHeight: 960,
      stayAwake: true,
      keepActive: true,
      alwaysOnTop: true,
      fullscreen: true,
      borderless: true,
      lockAspectRatio: false,
      captureOrientation: '90',
      lockOrientation: true,
      readOnly: true,
      extraFlags: '--render-fit=letterbox --push-target="/sdcard/Movies"'
    })

    expect(command.executable).toBe('/bin/scrcpy')
    expect(command.args).toEqual([
      '--serial',
      'abc123',
      '--window-title=Desk Phone',
      '--video-codec=h265',
      '--video-bit-rate=12M',
      '--max-fps=30',
      '--max-size=1600',
      '--window-width=540',
      '--window-height=960',
      '--stay-awake',
      '--keep-active',
      '--always-on-top',
      '--fullscreen',
      '--window-borderless',
      '--no-window-aspect-ratio-lock',
      '--capture-orientation=@90',
      '--no-control',
      '--render-fit=letterbox',
      '--push-target=/sdcard/Movies'
    ])
  })

  it('locks to the initial capture orientation when no explicit orientation is selected', () => {
    const command = buildScrcpyCommand('/bin/scrcpy', 'abc123', 'Desk Phone', {
      ...defaultScrcpySettings,
      lockOrientation: true
    })

    expect(command.args).toContain('--capture-orientation=@')
  })
})

describe('parseExtraFlags', () => {
  it('splits shell-like quoted flags without invoking a shell', () => {
    expect(parseExtraFlags('--foo "bar baz" --x=y')).toEqual(['--foo', 'bar baz', '--x=y'])
  })
})
