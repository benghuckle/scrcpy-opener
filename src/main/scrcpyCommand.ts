import type { CommandPreview, ScrcpySettings } from '../shared/types'

export function buildScrcpyCommand(
  executable: string,
  serial: string,
  displayName: string,
  settings: ScrcpySettings
): CommandPreview {
  const args = ['--serial', serial, `--window-title=${displayName}`]

  if (settings.videoCodec) {
    args.push(`--video-codec=${settings.videoCodec}`)
  }

  if (settings.videoBitRate.trim()) {
    args.push(`--video-bit-rate=${settings.videoBitRate.trim()}`)
  }
  if (settings.maxFps && settings.maxFps > 0) {
    args.push(`--max-fps=${settings.maxFps}`)
  }
  if (settings.maxSize && settings.maxSize > 0) {
    args.push(`--max-size=${settings.maxSize}`)
  }
  if (settings.windowWidth && settings.windowWidth > 0) {
    args.push(`--window-width=${settings.windowWidth}`)
  }
  if (settings.windowHeight && settings.windowHeight > 0) {
    args.push(`--window-height=${settings.windowHeight}`)
  }
  if (settings.stayAwake) {
    args.push('--stay-awake')
  }
  if (settings.keepActive) {
    args.push('--keep-active')
  }
  if (settings.alwaysOnTop) {
    args.push('--always-on-top')
  }
  if (settings.fullscreen) {
    args.push('--fullscreen')
  }
  if (settings.borderless) {
    args.push('--window-borderless')
  }
  if (!settings.lockAspectRatio) {
    args.push('--no-window-aspect-ratio-lock')
  }
  if (settings.lockOrientation || settings.captureOrientation !== 'default') {
    const orientation = settings.captureOrientation === 'default' ? '' : settings.captureOrientation
    args.push(`--capture-orientation=${settings.lockOrientation ? '@' : ''}${orientation}`)
  }
  if (settings.readOnly) {
    args.push('--no-control')
  }

  args.push(...parseExtraFlags(settings.extraFlags))

  return { executable, args }
}

export function mergeSettings(base: ScrcpySettings, overrides: Partial<ScrcpySettings>): ScrcpySettings {
  return { ...base, ...compactOverrides(overrides) }
}

export function compactOverrides(overrides: Partial<ScrcpySettings>): Partial<ScrcpySettings> {
  return Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined)) as Partial<ScrcpySettings>
}

export function parseExtraFlags(value: string): string[] {
  const args: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaped = false

  for (const char of value.trim()) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current)
        current = ''
      }
      continue
    }
    current += char
  }

  if (current) {
    args.push(current)
  }

  return args
}
