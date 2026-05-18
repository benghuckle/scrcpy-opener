import { spawn } from 'node:child_process'
import type { ToolPaths, ManualCommandResult } from '../shared/types'
import { runCommand } from './exec'
import { resolveToolPaths } from './paths'
import { parseExtraFlags } from './scrcpyCommand'

const SCRCPY_LONG_RUNNING_FLAGS = new Set(['--help', '-h', '--version', '-v'])

export function parseManualCommand(command: string): { tool: 'adb' | 'scrcpy' | 'clear'; args: string[] } {
  const parts = parseExtraFlags(command)
  const tool = parts[0]?.toLowerCase()
  if (tool === 'clear') {
    return { tool: 'clear', args: [] }
  }
  if (tool !== 'adb' && tool !== 'scrcpy') {
    throw new Error('Only adb, scrcpy, and clear commands are supported.')
  }
  return { tool, args: parts.slice(1) }
}

export async function runManualCommand(command: string, toolPaths: ToolPaths): Promise<ManualCommandResult> {
  const trimmed = command.trim()
  if (!trimmed) {
    throw new Error('Enter a command.')
  }

  const parsed = parseManualCommand(trimmed)
  if (parsed.tool === 'clear') {
    return {
      command: trimmed,
      executable: null,
      args: [],
      stdout: '',
      stderr: '',
      exitCode: 0,
      startedDetached: false
    }
  }

  const resolved = resolveToolPaths(toolPaths)
  const executable = parsed.tool === 'adb' ? resolved.adbPath : resolved.scrcpyPath

  if (parsed.tool === 'scrcpy' && shouldStartDetached(parsed.args)) {
    const child = spawn(executable, parsed.args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    })
    child.unref()
    return {
      command: trimmed,
      executable,
      args: parsed.args,
      stdout: `Started scrcpy with PID ${child.pid ?? 'unknown'}.\n`,
      stderr: '',
      exitCode: 0,
      startedDetached: true
    }
  }

  try {
    const result = await runCommand(executable, parsed.args, undefined, 60000)
    return {
      command: trimmed,
      executable,
      args: parsed.args,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.code,
      startedDetached: false
    }
  } catch (error) {
    return {
      command: trimmed,
      executable,
      args: parsed.args,
      stdout: '',
      stderr: '',
      exitCode: null,
      startedDetached: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

function shouldStartDetached(args: string[]): boolean {
  return !args.some((arg) => SCRCPY_LONG_RUNNING_FLAGS.has(arg))
}
