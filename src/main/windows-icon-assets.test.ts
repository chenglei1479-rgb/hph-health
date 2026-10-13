import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const projectRoot = process.env['WINDOWS_ICON_TEST_ROOT']
  ? resolve(process.env['WINDOWS_ICON_TEST_ROOT'])
  : resolve(__dirname, '../..')

type IcoEntry = {
  width: number
  height: number
  bitCount: number
  byteSize: number
  imageOffset: number
}

const APP_ICON_SIZES = [16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 128, 256]
const TRAY_ICON_SIZES = [16, 20, 24, 32, 40, 48, 64, 256]
const LIGHT_SMALL_FRAME_HASHES = {
  16: '77b2212664b48c5a40a005e123362e99f246586de24e88820606b0873425f1d2',
  20: '1bbd3d62a478c9edf7b22add9cb3739e4fecbd472c811f7c9c754c9a4e7fcb9e',
  24: '3370727feb206786056691651c99735fd206c7c031bc9f9d6e0cd188ff6aa844'
}
const DARK_SMALL_FRAME_HASHES = {
  16: 'dc8485993ef13fa9c91941abbf9c675c3779568a1e211c718a80de3183a7d9c2',
  20: 'a226f67a6014f0375af17372fdb3691d2bbf5bcf0706d68819c3802cb38a3ac5',
  24: '7ec444bf13db3575c4db867853cb04c04ab3984452f6a6cfe536ba44aed985d7'
}
const ICON_ASSETS = [
  {
    relativePath: 'build/icon.ico',
    expectedSizes: APP_ICON_SIZES,
    expectedSha256: '264ae20edd2f6be43164286b89f2f86a9601c858f181a3f5d37a73b3490b1794'
  },
  {
    relativePath: 'resources/icon-light.ico',
    expectedSizes: APP_ICON_SIZES,
    expectedSha256: '264ae20edd2f6be43164286b89f2f86a9601c858f181a3f5d37a73b3490b1794'
  },
  {
    relativePath: 'resources/icon-dark.ico',
    expectedSizes: APP_ICON_SIZES,
    expectedSha256: '336c5f30c65dc65f8500b9b93d0139ba7a291dec82632162dbc54b48ebdf4893'
  },
  {
    relativePath: 'resources/tray-light.ico',
    expectedSizes: TRAY_ICON_SIZES,
    expectedSha256: 'e74600b52ba9d6905a76ba256a75ad0266d2a6cdd23c0b79fc45ede6846f6dcb'
  },
  {
    relativePath: 'resources/tray-dark.ico',
    expectedSizes: TRAY_ICON_SIZES,
    expectedSha256: '5ddaa180a54d4f01738927da9546c0bb5f037b67420bbea93cf935c6bfda3180'
  }
]

const readIco = (
  relativePath: string
): { bytes: Buffer; reserved: number; type: number; entries: IcoEntry[] } => {
  const bytes = readFileSync(resolve(projectRoot, relativePath))
  const count = bytes.readUInt16LE(4)
  const entries = Array.from({ length: count }, (_, index) => {
    const offset = 6 + index * 16
    return {
      width: bytes[offset] || 256,
      height: bytes[offset + 1] || 256,
      bitCount: bytes.readUInt16LE(offset + 6),
      byteSize: bytes.readUInt32LE(offset + 8),
      imageOffset: bytes.readUInt32LE(offset + 12)
    }
  })

  return {
    bytes,
    reserved: bytes.readUInt16LE(0),
    type: bytes.readUInt16LE(2),
    entries
  }
}

describe('Windows icon assets', () => {
  it.each(ICON_ASSETS)('ships the approved multi-size ICO in $relativePath', (asset) => {
    const { bytes, reserved, type, entries } = readIco(asset.relativePath)
    const directoryEnd = 6 + entries.length * 16

    expect(reserved).toBe(0)
    expect(type).toBe(1)
    expect(entries.map(({ width }) => width).sort((a, b) => a - b)).toEqual(asset.expectedSizes)
    expect(entries.every(({ width, height }) => width === height)).toBe(true)
    expect(entries.every(({ bitCount }) => bitCount === 32)).toBe(true)
    expect(
      entries.every(
        ({ byteSize, imageOffset }) =>
          imageOffset >= directoryEnd && imageOffset + byteSize <= bytes.length
      )
    ).toBe(true)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.expectedSha256)
  })

  it('keeps the packaged default synchronized with the light icon', () => {
    expect(readFileSync(resolve(projectRoot, 'build/icon.ico'))).toEqual(
      readFileSync(resolve(projectRoot, 'resources/icon-light.ico'))
    )
  })

  it.each([
    { relativePath: 'build/icon.ico', expectedHashes: LIGHT_SMALL_FRAME_HASHES },
    { relativePath: 'resources/icon-light.ico', expectedHashes: LIGHT_SMALL_FRAME_HASHES },
    { relativePath: 'resources/icon-dark.ico', expectedHashes: DARK_SMALL_FRAME_HASHES }
  ])('keeps the dotted-ring mark recognizable in the small frames of $relativePath', (asset) => {
    const { bytes, entries } = readIco(asset.relativePath)
    const smallFrameHashes = Object.fromEntries(
      entries
        .filter(({ width }) => width in asset.expectedHashes)
        .map(({ width, byteSize, imageOffset }) => [
          width,
          createHash('sha256')
            .update(bytes.subarray(imageOffset, imageOffset + byteSize))
            .digest('hex')
        ])
    )

    expect(smallFrameHashes).toEqual(asset.expectedHashes)
  })
})
