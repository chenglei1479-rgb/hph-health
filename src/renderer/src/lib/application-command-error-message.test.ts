import { afterEach, describe, expect, it } from 'vitest'

import { i18next } from '@/i18n'
import ja from '../../../shared/i18n/locales/ja.json'
import {
  APPLICATION_COMMAND_ERROR_CODES,
  ApplicationCommandError,
  isApplicationCommandErrorCode,
  type ApplicationCommandErrorCode
} from '../../../shared/application-command-contract'
import {
  localizeApplicationCommandCode,
  localizeApplicationCommandError
} from './application-command-error-message'
import { errorNoticeDetail } from './error-detail'

const translate = i18next.t.bind(i18next)
const ALL_CODES: ApplicationCommandErrorCode[] = [...APPLICATION_COMMAND_ERROR_CODES]

const switchLanguage = async (language: string): Promise<void> => {
  await i18next.changeLanguage(language)
}

afterEach(async () => switchLanguage('en'))

// The Japanese catalog is the source of truth for "is this the translated key?", so the assertions
// below fail if a key is missing from the catalog instead of silently accepting English source text.
const isJapaneseCopy = (copy: string, code: string): boolean =>
  Object.values(ja.renderer).some((value) => value.replace('{{code}}', code) === copy)

describe('localizeApplicationCommandError', () => {
  it.each(ALL_CODES)(
    'localizes the %s code into Japanese copy that carries the diagnostic code',
    async (code) => {
      await switchLanguage('ja')
      const copy = localizeApplicationCommandError(
        new ApplicationCommandError(code, 'Settings could not be loaded.'),
        translate
      )

      expect(copy).toBeDefined()
      expect(isJapaneseCopy(copy!, code)).toBe(true)
      expect(copy).toContain(code)
      // The English internals never reach the doctor, and the class name never leads the notice.
      expect(copy).not.toContain('Settings could not be loaded.')
      expect(copy!.startsWith('ApplicationCommandError')).toBe(false)
    }
  )

  it('maps a known code to its reviewed Japanese sentence', async () => {
    await switchLanguage('ja')
    const code = 'command-unavailable'

    expect(localizeApplicationCommandCode(code, translate)).toBe(
      ja.renderer[
        'The app is not connected to its backend right now. Wait a moment, then retry. (Code: {{code}})'
      ].replace('{{code}}', code)
    )
  })

  it('falls back to operable Japanese copy plus the code for an unknown code', async () => {
    await switchLanguage('ja')
    const code = 'future-command-code'

    const copy = localizeApplicationCommandCode(code, translate)

    expect(copy).toContain(`（コード: ${code}）`)
    expect(isJapaneseCopy(copy, code)).toBe(true)
    expect(copy).not.toMatch(/^The app could not/)
    expect(copy.startsWith('ApplicationCommandError')).toBe(false)
  })

  it('treats a serialized unknown code from the class as a command failure', async () => {
    await switchLanguage('ja')
    const envelope = {
      code: 'future-command-code',
      name: 'ApplicationCommandError',
      message: 'Something internal failed.'
    }

    expect(localizeApplicationCommandError(envelope, translate)).toContain('future-command-code')
  })

  it('localizes the plain envelope that survives contextBridge', async () => {
    await switchLanguage('ja')
    const code = 'session-size-limit'

    const copy = localizeApplicationCommandError(
      { code, message: 'Session exceeds the configured size limit.' },
      translate
    )

    expect(isJapaneseCopy(copy!, code)).toBe(true)
    expect(copy).toContain(code)
  })

  it('keeps readable English copy in the English locale', async () => {
    const code = 'command-failed'
    const copy = localizeApplicationCommandCode(code, translate)

    expect(copy).toBe(
      `The app could not finish that action. Retry. If it keeps failing, reload the app. (Code: ${code})`
    )
    expect(copy).toContain(code)
    expect(copy).not.toContain('ApplicationCommandError')
    // English is not forced to Japanese.
    expect(isJapaneseCopy(copy, code)).toBe(false)
  })

  it('never renders the exception class name in any locale', async () => {
    for (const language of ['de', 'es', 'fr', 'ja', 'ko', 'ru', 'zh-Hans', 'zh-Hant', 'en']) {
      await switchLanguage(language)
      for (const code of APPLICATION_COMMAND_ERROR_CODES) {
        const copy = localizeApplicationCommandError(
          new ApplicationCommandError(code, 'Internal failure.'),
          translate
        )
        expect(copy, `${language}:${code}`).toBeDefined()
        expect(copy!.startsWith('ApplicationCommandError:'), `${language}:${code}`).toBe(false)
        expect(copy, `${language}:${code}`).toContain(code)
      }
      const unknown = localizeApplicationCommandCode('future-command-code', translate)
      expect(unknown, language).not.toContain('ApplicationCommandError')
    }
  })

  it('leaves values that are not command failures untouched', () => {
    // Node reports filesystem failures through `code` too; their detail stays as-is.
    expect(localizeApplicationCommandError(new Error('EACCES: permission denied'), translate)).toBe(
      undefined
    )
    expect(
      localizeApplicationCommandError({ code: 'EACCES', message: 'permission denied' }, translate)
    ).toBe(undefined)
    expect(localizeApplicationCommandError('plain string', translate)).toBeUndefined()
    expect(localizeApplicationCommandError(null, translate)).toBeUndefined()
    expect(localizeApplicationCommandError({ code: 'command-failed' }, translate)).toBeUndefined()
  })

  it('exposes every contract code through the mapper', () => {
    expect(APPLICATION_COMMAND_ERROR_CODES.every(isApplicationCommandErrorCode)).toBe(true)
    for (const code of APPLICATION_COMMAND_ERROR_CODES) {
      expect(localizeApplicationCommandCode(code, translate)).toContain(code)
    }
  })
})

describe('errorNoticeDetail', () => {
  it('prefers localized command copy and falls back to the raw detail otherwise', async () => {
    await switchLanguage('ja')

    const localized = errorNoticeDetail(
      new ApplicationCommandError('command-unavailable', 'Backend unavailable.'),
      translate
    )
    expect(localized).toContain('（コード: command-unavailable）')
    expect(localized).not.toContain('Backend unavailable.')

    expect(errorNoticeDetail(new Error('EACCES: permission denied'), translate)).toBe(
      'EACCES: permission denied'
    )
    expect(errorNoticeDetail('a string detail', translate)).toBe('a string detail')
    expect(errorNoticeDetail(undefined, translate)).toBeUndefined()
  })
})
