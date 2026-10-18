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
  16: 'b03f7879b3404572ed985fb76622d031e0e67096a15a65cef06a6672205bd77e',
  20: '4afde27d581a2b196c121b346fe2580772a4149aeab6819d6fe7985e9c81d5cf',
  24: 'f86c3ddf59c0a3928e094c135ce1fcae4765f0165c06e45669d122a09d19469f',
  32: 'b259175cfbb069e84be476cf69b3510ffcd15cbb954298df9f0e24c780faf447'
}
const DARK_SMALL_FRAME_HASHES = {
  16: 'b03f7879b3404572ed985fb76622d031e0e67096a15a65cef06a6672205bd77e',
  20: '4afde27d581a2b196c121b346fe2580772a4149aeab6819d6fe7985e9c81d5cf',
  24: 'f86c3ddf59c0a3928e094c135ce1fcae4765f0165c06e45669d122a09d19469f',
  32: 'b259175cfbb069e84be476cf69b3510ffcd15cbb954298df9f0e24c780faf447'
}
const ICON_ASSETS = [
  {
    relativePath: 'build/icon.ico',
    expectedSizes: APP_ICON_SIZES,
    expectedSha256: '29888f2d5e69c5099ba26aeaf5231688656407ab5b6f41c5104a572ea5686451'
  },
  {
    relativePath: 'resources/icon-light.ico',
    expectedSizes: APP_ICON_SIZES,
    expectedSha256: '29888f2d5e69c5099ba26aeaf5231688656407ab5b6f41c5104a572ea5686451'
  },
  {
    relativePath: 'resources/icon-dark.ico',
    expectedSizes: APP_ICON_SIZES,
    expectedSha256: '29888f2d5e69c5099ba26aeaf5231688656407ab5b6f41c5104a572ea5686451'
  },
  {
    relativePath: 'resources/tray-light.ico',
    expectedSizes: TRAY_ICON_SIZES,
    expectedSha256: '111df86c206becf2851b2a0c1415e08eabcc524be6cad4817cae1e85815889ae'
  },
  {
    relativePath: 'resources/tray-dark.ico',
    expectedSizes: TRAY_ICON_SIZES,
    expectedSha256: '111df86c206becf2851b2a0c1415e08eabcc524be6cad4817cae1e85815889ae'
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
  ])('keeps the Baselio b mark recognizable in the small frames of $relativePath', (asset) => {
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
