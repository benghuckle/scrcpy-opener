import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ToolPaths } from '../shared/types'

export interface ResolvedToolPaths {
  adbPath: string
  scrcpyPath: string
}

export function getBundledToolPaths(): ResolvedToolPaths {
  const extension = process.platform === 'win32' ? '.exe' : ''
  const resources = process.resourcesPath || process.cwd()
  const platformDir = process.platform === 'darwin' ? `darwin-${process.arch}` : process.platform
  const candidateRoot = app.isPackaged ? join(resources, 'bin', platformDir) : join(process.cwd(), 'vendor', 'bin', platformDir)

  return {
    adbPath: join(candidateRoot, `adb${extension}`),
    scrcpyPath: join(candidateRoot, `scrcpy${extension}`)
  }
}

export function resolveToolPaths(custom: ToolPaths): ResolvedToolPaths {
  const bundled = getBundledToolPaths()
  return {
    adbPath: custom.adbPath || (existsSync(bundled.adbPath) ? bundled.adbPath : 'adb'),
    scrcpyPath: custom.scrcpyPath || (existsSync(bundled.scrcpyPath) ? bundled.scrcpyPath : 'scrcpy')
  }
}

export function bundledToolsAvailable(): boolean {
  const bundled = getBundledToolPaths()
  return existsSync(bundled.adbPath) && existsSync(bundled.scrcpyPath)
}
