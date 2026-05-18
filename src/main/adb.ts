import type { DeviceInfo } from '../shared/types'

const detailPattern = /(\S+):([^\s]+)/g

export function parseAdbDevices(output: string): DeviceInfo[] {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial = '', status = 'unknown', ...details] = line.split(/\s+/)
      const detailText = details.join(' ')
      const fields = Object.fromEntries([...detailText.matchAll(detailPattern)].map((match) => [match[1], match[2]]))

      return {
        serial,
        connectionSerial: serial,
        stableSerial: stableDeviceSerial(serial),
        status: normalizeStatus(status),
        displayName: fields.model?.replace(/_/g, ' ') || serial,
        model: fields.model?.replace(/_/g, ' '),
        product: fields.product,
        device: fields.device,
        transport: inferTransport(serial, detailText),
        remembered: false,
        running: false,
        autoReconnect: false
      }
    })
}

export interface MdnsService {
  name: string
  type: string
  host: string
}

export function collapseAdbWifiAliases(devices: DeviceInfo[], services: MdnsService[]): DeviceInfo[] {
  const connectServices = services.filter((service) => service.type === '_adb-tls-connect._tcp')
  const byHost = new Map(connectServices.map((service) => [service.host, service]))
  const byDnsSerial = new Map(connectServices.map((service) => [toAdbTlsConnectSerial(service.name), service]))
  const result: DeviceInfo[] = []
  const consumedSerials = new Set<string>()

  for (const device of devices) {
    const service = byHost.get(device.serial)
    if (!service) {
      if (!consumedSerials.has(device.serial) && isAdbTlsConnectSerial(device.serial)) {
        const dnsService = byDnsSerial.get(device.serial)
        result.push({
          ...device,
          serial: device.serial,
          connectionSerial: device.serial,
          stableSerial: stableDeviceSerial(device.serial),
          wirelessHost: dnsService?.host,
          displayName: device.model || stableDeviceSerial(device.serial) || dnsService?.name || device.serial,
          transport: 'tcpip'
        })
      } else if (!consumedSerials.has(device.serial)) {
        result.push({
          ...device,
          connectionSerial: device.connectionSerial || device.serial,
          stableSerial: device.stableSerial || stableDeviceSerial(device.serial)
        })
      }
      continue
    }

    const dnsSerial = toAdbTlsConnectSerial(service.name)
    const alias = devices.find((candidate) => candidate.serial === dnsSerial)
    if (alias) {
      consumedSerials.add(dnsSerial)
    }
    consumedSerials.add(device.serial)

    result.push({
      ...alias,
      ...device,
      serial: dnsSerial,
      connectionSerial: alias?.serial || dnsSerial,
      stableSerial: stableDeviceSerial(dnsSerial),
      wirelessHost: service.host,
      displayName: alias?.model || device.model || stableDeviceSerial(dnsSerial) || service.name,
      model: alias?.model || device.model,
      product: alias?.product || device.product,
      device: alias?.device || device.device,
      transport: 'tcpip'
    })
  }

  return result
}

export function isAdbTlsConnectSerial(serial: string): boolean {
  return serial.includes('._adb-tls-connect._tcp')
}

export function toAdbTlsConnectSerial(serviceName: string): string {
  return `${serviceName}._adb-tls-connect._tcp.`
}

export function stableDeviceSerial(serial: string): string | undefined {
  const match = serial.match(/^adb-([A-Za-z0-9]+)(?:-[^.]+)?\._adb-tls-connect\._tcp\.?$/)
  return match?.[1]
}

export function parseMdnsServices(output: string): MdnsService[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.toLowerCase().startsWith('list of'))
    .map(parseMdnsServiceLine)
    .filter((service): service is MdnsService => Boolean(service))
}

function parseMdnsServiceLine(line: string): MdnsService | null {
  const parts = line.split(/\s+/)
  const typeIndex = parts.findIndex((part) => part.startsWith('_adb') && part.includes('._tcp'))
  const host = parts.find((part) => /^[^\s:]+:\d+$/.test(part))
  if (typeIndex <= 0 || !host) {
    return null
  }
  return {
    name: parts.slice(0, typeIndex).join(' '),
    type: normalizeMdnsType(parts[typeIndex]),
    host
  }
}

function normalizeMdnsType(type: string): string {
  return type.replace(/\.local\.?$/, '').replace(/\.$/, '')
}

function normalizeStatus(status: string): DeviceInfo['status'] {
  if (status === 'device' || status === 'offline' || status === 'unauthorized') {
    return status
  }
  return 'unknown'
}

function inferTransport(serial: string, details: string): DeviceInfo['transport'] {
  if (serial.startsWith('emulator-')) {
    return 'emulator'
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(serial) || serial.includes('._adb-tls-connect._tcp')) {
    return 'tcpip'
  }
  if (details.includes('usb:')) {
    return 'usb'
  }
  return 'unknown'
}
