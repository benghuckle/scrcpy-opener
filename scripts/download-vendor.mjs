import { createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs'
import { chmod, cp, readdir } from 'node:fs/promises'
import { get } from 'node:https'
import { basename, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const SCRCPY_VERSION = 'v4.0'
const PLATFORM_TOOLS_VERSION = '37.0.0'
const root = resolve(import.meta.dirname, '..')
const cacheDir = join(root, 'vendor', 'cache')
const binRoot = join(root, 'vendor', 'bin')

const targets = {
  darwin: {
    platformTools: `https://dl.google.com/android/repository/platform-tools_r${PLATFORM_TOOLS_VERSION}-darwin.zip`,
    scrcpyArm64: `https://github.com/Genymobile/scrcpy/releases/download/${SCRCPY_VERSION}/scrcpy-macos-aarch64-${SCRCPY_VERSION}.tar.gz`,
    scrcpyX64: `https://github.com/Genymobile/scrcpy/releases/download/${SCRCPY_VERSION}/scrcpy-macos-x86_64-${SCRCPY_VERSION}.tar.gz`
  },
  win32: {
    platformTools: `https://dl.google.com/android/repository/platform-tools_r${PLATFORM_TOOLS_VERSION}-windows.zip`,
    scrcpy: `https://github.com/Genymobile/scrcpy/releases/download/${SCRCPY_VERSION}/scrcpy-win64-${SCRCPY_VERSION}.zip`
  }
}

async function main() {
  mkdirSync(cacheDir, { recursive: true })
  await prepareMac('arm64')
  await prepareMac('x64')
  await prepareWindows()
  console.log('Vendor binaries prepared in vendor/bin')
}

async function prepareMac(arch) {
  const out = join(binRoot, `darwin-${arch}`)
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  const platformTools = await download(targets.darwin.platformTools)
  const scrcpy = await download(arch === 'arm64' ? targets.darwin.scrcpyArm64 : targets.darwin.scrcpyX64)
  const temp = join(cacheDir, `mac-${arch}`)
  rmSync(temp, { recursive: true, force: true })
  mkdirSync(temp, { recursive: true })
  await run('unzip', ['-q', platformTools, '-d', temp])
  await run('tar', ['-xzf', scrcpy, '-C', temp])
  await cp(join(temp, 'platform-tools', 'adb'), join(out, 'adb'))
  const scrcpyDir = (await readdir(temp)).find((entry) => entry.startsWith('scrcpy-macos-'))
  if (!scrcpyDir) throw new Error('Missing extracted scrcpy directory')
  await cp(join(temp, scrcpyDir), out, { recursive: true })
  await chmod(join(out, 'adb'), 0o755)
  await chmod(join(out, 'scrcpy'), 0o755)
}

async function prepareWindows() {
  const out = join(binRoot, 'win32')
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  const scrcpy = await download(targets.win32.scrcpy)
  const temp = join(cacheDir, 'win32')
  rmSync(temp, { recursive: true, force: true })
  mkdirSync(temp, { recursive: true })
  await run('unzip', ['-q', scrcpy, '-d', temp])
  const scrcpyDir = (await readdir(temp)).find((entry) => entry.startsWith('scrcpy-win64-'))
  if (!scrcpyDir) throw new Error('Missing extracted scrcpy directory')
  await cp(join(temp, scrcpyDir), out, { recursive: true })
}

function download(url, fileName = basename(new URL(url).pathname)) {
  const filePath = join(cacheDir, fileName)
  if (existsSync(filePath)) {
    return Promise.resolve(filePath)
  }
  return new Promise((resolveDownload, reject) => {
    const file = createWriteStream(filePath)
    get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close()
        rmSync(filePath, { force: true })
        download(response.headers.location, fileName).then(resolveDownload, reject)
        return
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed ${response.statusCode}: ${url}`))
        return
      }
      response.pipe(file)
      file.on('finish', () => file.close(() => resolveDownload(filePath)))
    }).on('error', reject)
  })
}

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolveRun()
      else reject(new Error(`${command} exited with ${code}`))
    })
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
