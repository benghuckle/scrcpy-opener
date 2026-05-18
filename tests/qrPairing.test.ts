import { describe, expect, it } from 'vitest'
import { buildAdbWifiQrPayload, randomAdbToken } from '../src/main/appService'

describe('ADB Wi-Fi QR payload', () => {
  it('matches Android wireless debugging QR format', () => {
    expect(buildAdbWifiQrPayload('studio-abcdefghijkl', 'abcdefghijkl')).toBe(
      'WIFI:T:ADB;S:studio-abcdefghijkl;P:abcdefghijkl;;'
    )
  })

  it('uses alphanumeric tokens compatible with wireless debugging QR scanning', () => {
    expect(randomAdbToken(21)).toMatch(/^[A-Za-z0-9]{21}$/)
  })
})
