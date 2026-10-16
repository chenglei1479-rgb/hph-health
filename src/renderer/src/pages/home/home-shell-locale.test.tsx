// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import { useLocaleStore } from '@/stores/locale-store'
import {
  variableDefinitionCopy,
  variableDefinitionWarningText
} from '@/pages/variable-definition/copy'
import { VariableDefinitionEntry } from '@/pages/variable-definition/VariableDefinitionEntry'
import { EthicsWritingNotice } from '@/pages/writing-safeguards/EthicsWritingNotice'
import { writingSafeguardsCopy } from '@/pages/writing-safeguards/copy'
import { WritingSafeguardsEntry } from '@/pages/writing-safeguards/WritingSafeguardsEntry'
import { resolveLocaleFromTags, type Locale } from '../../../../shared/locale'
import {
  ETHICS_WRITING_REMINDER,
  ethicsWritingReminder
} from '../../../../shared/writing-safeguards/ethics-approval'

const JAPANESE_CORNERS = [
  '変数定義表',
  '執筆時の確認',
  'マスキングチェック',
  '倫理審査の承認番号が未入力です'
]

describe('home shell locale', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
    useLocaleStore.setState({ preference: 'en', locale: 'en' })
  })

  it('resolves zh-CN to Simplified Chinese and falls back to English', () => {
    expect(resolveLocaleFromTags(['zh-CN'])).toBe('zh-Hans')
    expect(variableDefinitionCopy('zh-CN').open).toBe('变量定义表')
    expect(writingSafeguardsCopy('zh-CN').open).toBe('撰写时的确认')
    expect(variableDefinitionCopy('zh-CN').maskingCheck).toBe('脱敏检查')
    expect(variableDefinitionCopy('zh-CN').maskingCheckNote).toContain('已假名化')
    expect(variableDefinitionCopy('zh-CN').missingKey).toContain('API 密钥')
    expect(variableDefinitionCopy('zh-CN').missingKey).not.toContain('API キー')
    expect(
      variableDefinitionWarningText('zh-CN', {
        code: 'dropped-identifier',
        name: 'カルテ番号',
        message: '「カルテ番号」は直接識別子（カルテ番号）のため、収集テンプレートから除きました。'
      })
    ).toBe('「カルテ番号」是直接标识符（病历号），已从采集模板中移除。')
    expect(
      variableDefinitionWarningText('zh-Hans', {
        code: 'raw-date',
        name: '入院日',
        message: '「入院日」は暦日です。'
      })
    ).toContain('日历日期')
    expect(
      variableDefinitionWarningText('zh-Hans', {
        code: 'raw-date',
        name: '入院日',
        message: '「入院日」は暦日です。'
      })
    ).not.toContain('暦日')
    expect(variableDefinitionCopy('zh-CN').maskingCheckNote).not.toContain('マスキングチェック')
    expect(ethicsWritingReminder('', 'zh-CN').message).toContain('尚未填写伦理审查批准号')
    expect(ethicsWritingReminder('', 'zh-CN').blocking).toBe(false)

    expect(variableDefinitionCopy('zh-CN')).toEqual(variableDefinitionCopy('zh-Hans'))
    expect(writingSafeguardsCopy('ja').open).toBe('執筆時の確認')
    expect(variableDefinitionCopy('ja').maskingCheck).toBe('マスキングチェック')
    expect(ethicsWritingReminder('', 'ja').message).toBe(ETHICS_WRITING_REMINDER)

    for (const locale of ['en', 'de', 'es', 'fr', 'ko', 'ru', 'zh-Hans', 'zh-Hant'] as const) {
      expect(variableDefinitionCopy(locale).open).not.toBe('変数定義表')
      expect(writingSafeguardsCopy(locale).open).not.toBe('執筆時の確認')
      expect(variableDefinitionCopy(locale).maskingCheckNote).not.toContain('マスキングチェック')
      expect(ethicsWritingReminder('', locale).message).not.toBe(ETHICS_WRITING_REMINDER)
      expect(ethicsWritingReminder('', locale).blocking).toBe(false)
    }

    expect(variableDefinitionCopy('pt-BR').open).toBe(variableDefinitionCopy('en').open)
    expect(writingSafeguardsCopy('pt-BR').open).toBe('Checks while writing')
    expect(ethicsWritingReminder('', 'pt-BR').message).toBe(ethicsWritingReminder('', 'en').message)
    expect(writingSafeguardsCopy('pt-BR').open).not.toBe('執筆時の確認')
  })

  it('shows Chinese corner labels when the UI locale is zh-CN, then follows the switcher', async () => {
    const simplified: Locale = resolveLocaleFromTags(['zh-CN'])
    useLocaleStore.setState({ preference: simplified, locale: simplified })
    window.api = {
      projects: { list: async () => [] },
      writingSafeguards: {
        getEthicsApproval: async () => ({ approvalNumber: '' }),
        setEthicsApproval: async (request: { approvalNumber: string }) => ({
          approvalNumber: request.approvalNumber
        })
      }
    } as unknown as Window['api']

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(
        <>
          <VariableDefinitionEntry />
          <WritingSafeguardsEntry />
          <EthicsWritingNotice open approvalNumber="" />
        </>
      )
    })

    expect(container.textContent).toContain('变量定义表')
    expect(container.textContent).toContain('撰写时的确认')
    expect(container.textContent).toContain('尚未填写伦理审查批准号')
    for (const japanese of JAPANESE_CORNERS) {
      expect(container.textContent).not.toContain(japanese)
    }

    const openVariable = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === '变量定义表'
    )
    expect(openVariable).toBeTruthy()
    await act(async () => {
      openVariable?.click()
    })
    expect(container.textContent).toContain('脱敏检查')
    expect(container.textContent).toContain('已假名化')
    expect(container.textContent).not.toContain('仮名化済み')

    const openWriting = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === '撰写时的确认'
    )
    expect(openWriting).toBeTruthy()
    await act(async () => {
      openWriting?.click()
    })
    expect(container.textContent).toContain('伦理审查批准号')
    expect(container.textContent).toContain('AI 使用披露')
    expect(container.textContent).toContain('导出文稿')
    expect(container.textContent).toContain('加入利益冲突声明')
    const declaration = container.querySelector('textarea[aria-label="披露草稿"]')
    expect(declaration).toBeInstanceOf(HTMLTextAreaElement)
    if (declaration instanceof HTMLTextAreaElement) {
      expect(declaration.value).toContain('在准备文稿时')
      expect(declaration.value).not.toContain('原稿の作成にあたり')
      expect(declaration.value).not.toContain('著者は DRA の無償提供を受けた')
      expect(container.textContent).toContain('【运营公司名称（未设置）】')
      expect(container.textContent).toContain('无偿获得了Baselio')
      expect(container.textContent).not.toContain('免费获得了 DRA')
    }
    const feature = container.querySelector('input[aria-label="使用的功能"]')
    expect(feature).toBeInstanceOf(HTMLInputElement)
    if (feature instanceof HTMLInputElement) {
      expect(feature.value).toBe('文献检索与整理')
      expect(feature.value).not.toContain('文献の検索')
    }
    const begin = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === '开始撰写'
    )
    expect(begin).toBeTruthy()
    expect(begin?.hasAttribute('disabled')).toBe(false)
    await act(async () => {
      begin?.click()
    })
    const reminders = [...container.querySelectorAll('[data-ethics-writing-reminder]')]
    expect(reminders.length).toBeGreaterThan(0)
    for (const reminder of reminders) {
      expect(reminder.textContent).toContain('可以继续撰写')
      expect(reminder.textContent).not.toContain('執筆は続けられます')
    }

    await act(async () => {
      useLocaleStore.setState({ preference: 'ja', locale: 'ja' })
    })
    expect(container.textContent).toContain('変数定義表')
    expect(container.textContent).toContain('執筆時の確認')
    expect(container.textContent).toContain('マスキングチェック')
    expect(container.textContent).toContain('仮名化済み')
    expect(container.textContent).toContain('倫理審査の承認番号が未入力です')
    const japaneseDeclaration = container.querySelector('textarea[aria-label="開示の下書き"]')
    expect(japaneseDeclaration).toBeInstanceOf(HTMLTextAreaElement)
    if (japaneseDeclaration instanceof HTMLTextAreaElement) {
      expect(japaneseDeclaration.value).toContain('原稿の作成にあたり')
    }

    await act(async () => {
      useLocaleStore.setState({ preference: 'en', locale: 'en' })
    })
    expect(container.textContent).toContain('Variable definition table')
    expect(container.textContent).toContain('Checks while writing')
    expect(container.textContent).toContain('passes through the masking check')
    expect(container.textContent).toContain('marked as pseudonymized')
    expect(container.textContent).toContain('The ethics approval number is missing')
    expect(container.textContent).not.toContain('変数定義表')
    expect(container.textContent).not.toContain('執筆時の確認')

    await act(async () => {
      useLocaleStore.setState({ preference: 'fr', locale: 'fr' })
    })
    expect(container.textContent).toContain('Table de variables')
    expect(container.textContent).toContain('Vérifications pendant la rédaction')
    expect(container.textContent).not.toContain('Variable definition table')
    expect(container.textContent).not.toContain('変数定義表')
  })
})
