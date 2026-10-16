import { describe, expect, it } from 'vitest'

import { createI18nInstance, initializeI18nInstance } from './i18n/core'
import {
  OPERATOR_COMPANY_LEGAL_NAME,
  PRODUCT_DISPLAY_NAME,
  PRODUCT_DISPLAY_NAME_JA,
  localizedProductDisplayName,
  productNameIsPublic,
  replaceVisibleDevelopmentCode
} from './product-identity'

describe('product display name', () => {
  it('reads Baselio from config and uses katakana in Japanese', () => {
    expect(PRODUCT_DISPLAY_NAME).toBe('Baselio')
    expect(PRODUCT_DISPLAY_NAME_JA).toBe('ベースリオ')
    expect(OPERATOR_COMPANY_LEGAL_NAME).toBe('')
    expect(productNameIsPublic(PRODUCT_DISPLAY_NAME)).toBe(true)
    expect(productNameIsPublic('DRA')).toBe(false)
    expect(localizedProductDisplayName('ja')).toBe('ベースリオ')
    expect(localizedProductDisplayName('ja-JP')).toBe('ベースリオ')
    expect(localizedProductDisplayName('zh-Hans')).toBe('Baselio')
    expect(localizedProductDisplayName('en')).toBe('Baselio')
  })

  it('replaces a standalone development code without touching identifiers', () => {
    expect(replaceVisibleDevelopmentCode('Update DRA before archiving.', 'en')).toBe(
      'Update Baselio before archiving.'
    )
    expect(replaceVisibleDevelopmentCode('DRA デモ', 'ja')).toBe('ベースリオ デモ')
    expect(replaceVisibleDevelopmentCode('DRA_MEMBERSHIP_REQUIRED', 'ja')).toBe(
      'DRA_MEMBERSHIP_REQUIRED'
    )
    expect(replaceVisibleDevelopmentCode('Keep the .dra/ folder.', 'zh-Hans')).toBe(
      'Keep the .dra/ folder.'
    )
    expect(replaceVisibleDevelopmentCode("DRA's notebook", 'en')).toBe("Baselio's notebook")
  })

  it('applies the configured name after i18n resolves a catalog string', () => {
    const instance = createI18nInstance()
    initializeI18nInstance(instance, {
      locale: 'ja',
      namespaces: ['renderer'],
      defaultNamespace: 'renderer',
      resources: {
        ja: {
          renderer: {
            'DRA could not load projects. Retry to continue.':
              'DRA はプロジェクトを読み込めませんでした。再試行してください。'
          }
        },
        en: { renderer: {} }
      }
    })

    expect(instance.t('DRA could not load projects. Retry to continue.')).toBe(
      'ベースリオはプロジェクトを読み込めませんでした。再試行してください。'
    )
    expect(instance.t('DRA_MEMBERSHIP_REQUIRED')).toBe('DRA_MEMBERSHIP_REQUIRED')
  })
})
