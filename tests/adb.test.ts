import { describe, expect, it } from 'vitest'
import { collapseAdbWifiAliases, parseAdbDevices, parseMdnsServices } from '../src/main/adb'

describe('parseAdbDevices', () => {
  it('parses device rows and metadata', () => {
    const devices = parseAdbDevices(`List of devices attached
0a388e93 device usb:1-1 product:razor model:Nexus_7 device:flo
192.168.1.4:5555 offline
adb-123._adb-tls-connect._tcp device product:phone model:Pixel_8 device:akita
`)

    expect(devices).toMatchObject([
      { serial: '0a388e93', status: 'device', model: 'Nexus 7', transport: 'usb' },
      { serial: '192.168.1.4:5555', status: 'offline', transport: 'tcpip' },
      { serial: 'adb-123._adb-tls-connect._tcp', status: 'device', model: 'Pixel 8', transport: 'tcpip' }
    ])
  })
})

describe('collapseAdbWifiAliases', () => {
  it('collapses IP and _adb-tls-connect serials into one direct IP device', () => {
    const devices = parseAdbDevices(`List of devices attached
10.200.2.109:44241	device
adb-57051FDCQ0035X-dhruEr._adb-tls-connect._tcp.	device
`)
    const services = parseMdnsServices(`List of discovered mdns services
adb-57051FDCQ0035X-dhruEr	_adb-tls-connect._tcp.	10.200.2.109:44241
`)

    expect(collapseAdbWifiAliases(devices, services)).toMatchObject([
      {
        serial: 'adb-57051FDCQ0035X-dhruEr._adb-tls-connect._tcp.',
        connectionSerial: 'adb-57051FDCQ0035X-dhruEr._adb-tls-connect._tcp.',
        stableSerial: '57051FDCQ0035X',
        wirelessHost: '10.200.2.109:44241',
        displayName: '57051FDCQ0035X',
        transport: 'tcpip'
      }
    ])
  })

  it('uses the resolved IP as the launch target until ADB exposes the DNS serial', () => {
    const devices = parseAdbDevices(`List of devices attached
10.200.2.109:44241	device
`)
    const services = parseMdnsServices(`List of discovered mdns services
adb-57051FDCQ0035X-dhruEr	_adb-tls-connect._tcp.	10.200.2.109:44241
`)

    expect(collapseAdbWifiAliases(devices, services)).toMatchObject([
      {
        serial: 'adb-57051FDCQ0035X-dhruEr._adb-tls-connect._tcp.',
        connectionSerial: '10.200.2.109:44241',
        stableSerial: '57051FDCQ0035X',
        wirelessHost: '10.200.2.109:44241'
      }
    ])
  })
})

describe('parseMdnsServices', () => {
  it('parses adb mdns services', () => {
    const services = parseMdnsServices(`List of discovered mdns services
adb-14141FDF600081         _adb._tcp                 192.168.86.38:5555
studio-g@abc123            _adb-tls-pairing._tcp     192.168.86.39:55861
ADB WIFI Device            _adb-tls-connect._tcp     192.168.86.40:39123  extra
studio-2fDH1hAui1NZ        _adb-tls-pairing._tcp.    10.200.2.109:40625
`)

    expect(services).toEqual([
      { name: 'adb-14141FDF600081', type: '_adb._tcp', host: '192.168.86.38:5555' },
      { name: 'studio-g@abc123', type: '_adb-tls-pairing._tcp', host: '192.168.86.39:55861' },
      { name: 'ADB WIFI Device', type: '_adb-tls-connect._tcp', host: '192.168.86.40:39123' },
      { name: 'studio-2fDH1hAui1NZ', type: '_adb-tls-pairing._tcp', host: '10.200.2.109:40625' }
    ])
  })
})
