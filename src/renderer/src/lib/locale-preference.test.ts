// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  applyHtmlLang,
  getStoredPreference,
  LANGUAGE_STORAGE_KEY,
  persistPreference,
  NEW_INSTALL_LANGUAGE_PREFERENCE,
  resolveInitialLocale,
  resolvePreference,
  systemLanguageTags
} from './locale-preference'

// navigator.languages is a read-only accessor in jsdom, so stub it per test.
const stubLanguages = (languages: string[] | undefined, language = 'en-US'): void => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages as readonly string[])
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(language)
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('systemLanguageTags', () => {
  it('returns the full prioritized list when present', () => {
    stubLanguages(['zh-TW', 'zh', 'en'])
    expect(systemLanguageTags()).toEqual(['zh-TW', 'zh', 'en'])
  })

  it('falls back to the single navigator.language when the list is unavailable', () => {
    stubLanguages(undefined, 'zh-CN')
    expect(systemLanguageTags()).toEqual(['zh-CN'])
  })

  it('falls back to the single language when the list is empty', () => {
    stubLanguages([], 'zh-HK')
    expect(systemLanguageTags()).toEqual(['zh-HK'])
  })
})

describe('stored preference', () => {
  it('is undefined before the user picks one and then paints Japanese', () => {
    expect(getStoredPreference()).toBeUndefined()
    expect(NEW_INSTALL_LANGUAGE_PREFERENCE).toBe('ja')
    expect(resolvePreference()).toBe('ja')
  })

  it('round-trips a persisted choice', () => {
    persistPreference('es')
    expect(getStoredPreference()).toBe('es')
    expect(resolvePreference()).toBe('es')
  })

  it('ignores a stored value that is not a known preference', () => {
    // A downgrade, a hand-edited value, or a locale we later dropped support for.
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh-CN')
    expect(getStoredPreference()).toBeUndefined()
    expect(resolvePreference()).toBe('ja')
  })

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })

    expect(getStoredPreference()).toBeUndefined()
    expect(() => persistPreference('zh-Hans')).not.toThrow()
  })
})

describe('resolveInitialLocale', () => {
  it('uses Japanese for a new install even when the device is not Japanese', () => {
    stubLanguages(['en-US'])
    expect(resolveInitialLocale()).toBe('ja')
    stubLanguages(['ko-KR', 'en'])
    expect(resolveInitialLocale()).toBe('ja')
    stubLanguages(['it-IT', 'vi-VN'])
    expect(resolveInitialLocale()).toBe('ja')
  })

  it('keeps Japanese for a ja device locale when detection is selected', () => {
    stubLanguages(['ja-JP', 'en-US'])
    persistPreference('system')
    expect(resolveInitialLocale()).toBe('ja')
  })

  it('detects Korean from the device when detection is selected', () => {
    stubLanguages(['ko-KR', 'ja', 'en'])
    persistPreference('system')
    expect(resolveInitialLocale()).toBe('ko')
  })

  it('detects Russian from the device when detection is selected', () => {
    stubLanguages(['ru-RU', 'ja', 'en'])
    persistPreference('system')
    expect(resolveInitialLocale()).toBe('ru')
  })

  it('detects German regional tags from the device', () => {
    stubLanguages(['de-AT', 'en'])
    persistPreference('system')
    expect(resolveInitialLocale()).toBe('de')
  })

  it('falls back to English when the selected device language is unsupported', () => {
    stubLanguages(['it-IT', 'vi-VN'])
    persistPreference('system')
    expect(resolveInitialLocale()).toBe('en')
  })

  it('detects French regional tags from the device', () => {
    stubLanguages(['fr-CA', 'en'])
    persistPreference('system')
    expect(resolveInitialLocale()).toBe('fr')
  })

  it('detects Spanish regional tags from the device', () => {
    stubLanguages(['es-MX', 'en'])
    persistPreference('system')
    expect(resolveInitialLocale()).toBe('es')
  })

  it('honors an explicit stored choice over the device language', () => {
    stubLanguages(['zh-TW'])
    persistPreference('en')
    expect(resolveInitialLocale()).toBe('en')
  })

  it('re-detects when the stored choice is system', () => {
    stubLanguages(['zh-CN'])
    persistPreference('system')
    expect(resolveInitialLocale()).toBe('zh-Hans')
  })
})

describe('applyHtmlLang', () => {
  it('writes a valid BCP-47 tag onto the document element', () => {
    applyHtmlLang('zh-Hant')
    expect(document.documentElement.lang).toBe('zh-Hant')
    applyHtmlLang('en')
    expect(document.documentElement.lang).toBe('en')
    applyHtmlLang('fr')
    expect(document.documentElement.lang).toBe('fr')
    applyHtmlLang('de')
    expect(document.documentElement.lang).toBe('de')
    applyHtmlLang('es')
    expect(document.documentElement.lang).toBe('es')
  })
})
