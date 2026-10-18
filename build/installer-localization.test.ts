import { readFileSync, readdirSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { load } from 'js-yaml'

const root = resolve(__dirname, '..')
const read = (path: string): string => readFileSync(join(root, path), 'utf8')
const require = createRequire(import.meta.url)
const { computeLicensePage } = require('app-builder-lib/out/targets/nsis/nsisLicense')
const { LangConfigurator } = require('app-builder-lib/out/targets/nsis/nsisLang')
const config = load(read('electron-builder.yml')) as {
  nsis: Record<string, unknown>
  dmg: { license: null }
}
const strings = read('build/installer-strings.nsh')
const entries = [...strings.matchAll(/^LangString (\w+) (\d+) "(.*)"$/gm)]
const translations = new Map<string, Map<string, string>>()
for (const [, key, lcid, text] of entries) {
  const values = translations.get(key) ?? new Map<string, string>()
  expect(values.has(lcid)).toBe(false)
  values.set(lcid, text)
  translations.set(key, values)
}

const tokens = (text: string): string[] =>
  [...text.matchAll(/\$\([^)]+\)|\$\{[^}]+\}|\$(?!\\)[A-Za-z_][\w]*/g)]
    .map(([token]) => token)
    .sort()

describe('NSIS localization integration', () => {
  it('provides all three languages and retains every runtime path/error token', () => {
    expect(translations.size).toBe(38)
    for (const values of translations.values()) {
      expect([...values.keys()].sort()).toEqual(['1033', '1041', '2052'])
      for (const text of values.values()) {
        expect(text.trim()).not.toBe('')
        expect(text).not.toContain('MedResearch Agent')
        expect(tokens(text)).toEqual(tokens(values.get('1033')!))
      }
    }
    for (const path of [
      'build/installer.nsh',
      'build/installer-license.nsh',
      'build/installer-strings.nsh'
    ]) {
      expect(readFileSync(join(root, path)).subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
    }
  })

  it('resolves every custom visible message through LangString and retains retry targets', () => {
    const source = read('build/installer.nsh')
    const lines = source.split('\n').filter((line) => /^\s*(MessageBox|DetailPrint)\b/.test(line))
    expect(lines.filter((line) => line.trimStart().startsWith('MessageBox'))).toHaveLength(14)
    for (const line of lines) {
      const key = line.match(/"\$\((\w+)\)"/)?.[1]
      expect(key, line).toBeDefined()
      expect(translations.has(key!), line).toBe(true)
    }
    expect(source.match(/IDRETRY ensureExistingUninstallerIsWritable_retry/g)).toHaveLength(2)
    expect(source).toContain('StrCpy $baselioMessageBackup "${BACKUP}"')
    expect(source).toContain('StrCpy $baselioMessageDir "${DIR}"')
    expect(source).toContain('StrCpy $baselioMessageFolder "${FOLDER}"')
    const denied = translations.get('BaselioUpdateAccessDenied')!.get('1033')!
    expect(denied).toContain('$INSTDIR\\${UNINSTALL_FILENAME}')
    expect(denied).toContain('$R1')
    const selector = read('build/installer-license.nsh')
    expect(config.nsis.displayLanguageSelector).toBe(true)
    expect(selector).toContain('GetUserDefaultUILanguage()')
    expect(selector).toContain('StrCpy $LANGUAGE 1033')
  })

  it('keeps NSIS Unicode license files out of the DMG SLA encoding path', async () => {
    const { addLicenseToDmg } = require('dmg-builder/out/dmgLicense')
    expect(config.dmg.license).toBeNull()
    // This is the real DMG license resolver. An accidental return to convention discovery
    // tries to read the resources list and fails before a slow native DMG build.
    const packager = {
      get resourceList(): never {
        throw new Error('DMG must not auto-discover the NSIS license files')
      }
    }
    expect(await addLicenseToDmg(packager, config.dmg.license)).toBeNull()
  })

  it('makes the installed electron-builder select a complete original license per language', async () => {
    const resources = mkdtempSync(join(tmpdir(), 'baselio-licenses-'))
    try {
      for (const name of readdirSync(join(root, 'build')).filter((name) =>
        name.startsWith('license_')
      )) {
        copyFileSync(join(root, 'build', name), join(resources, name))
      }
      const macros = new Map<string, string[]>()
      await computeLicensePage(
        {
          buildResourcesDir: resources,
          resourceList: Promise.resolve(readdirSync(resources)),
          getResource: async (custom: string | undefined) => {
            expect(custom).toBeUndefined()
            return null
          }
        },
        config.nsis,
        { macro: (name: string, body: string[]) => macros.set(name, body) },
        new LangConfigurator(config.nsis).langs
      )
      const output = macros.get('licensePage')!.join('\n')
      const original = readFileSync(join(root, 'LICENSE'))
      for (const [lcid, language] of [
        [1041, 'ja_JP'],
        [2052, 'zh_CN'],
        [1033, 'en_US']
      ]) {
        expect(output).toContain(
          `LicenseLangString MUILicense ${lcid} "${join(resources, `license_${language}.txt`)}"`
        )
        const license = readFileSync(join(resources, `license_${language}.txt`))
        expect(license.subarray(-original.length)).toEqual(original)
      }
      expect(output).toContain('!insertmacro MUI_PAGE_LICENSE "$(MUILicense)"')
      expect(read('build/license_ja_JP.txt')).toContain(
        'Baselio（ベースリオ）は Apache License 2.0 で配布されています。以下は正文（英語）です。'
      )
    } finally {
      rmSync(resources, { recursive: true, force: true })
    }
  })
})
