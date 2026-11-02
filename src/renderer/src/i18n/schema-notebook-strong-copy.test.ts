import { describe, expect, it } from 'vitest'

import { LOCALES } from '../../../shared/locale'
import de from '../../../shared/i18n/locales/de.json'
import es from '../../../shared/i18n/locales/es.json'
import fr from '../../../shared/i18n/locales/fr.json'
import ja from '../../../shared/i18n/locales/ja.json'
import ko from '../../../shared/i18n/locales/ko.json'
import ru from '../../../shared/i18n/locales/ru.json'
import zhHans from '../../../shared/i18n/locales/zh-Hans.json'
import zhHant from '../../../shared/i18n/locales/zh-Hant.json'

// The schema-notebook panel tells the reader what is and is not sent to the model. Those statements
// are limits, not tone: a translation that shortens them tells the reader they send less than they
// do. This suite is the guard for that, because a reviewer reading eight languages will eventually
// miss one (the first pass dropped two of four clauses from `categoricalNote` in six locales).
//
// Two checks run for every "must stay strong" key:
//   1. Sentence-count parity with the English source. Dropping a clause changes the count, in any
//      language, without needing a per-locale token list.
//   2. A per-locale token that carries the hard part of the statement (a ban, an absolute negative,
//      or the numeric limit). Softening the wording ("should not", "not recommended") keeps the
//      sentence count but fails this.
// English needs no catalog entry: the key is the English source text itself.
const TRANSLATED_LOCALES = LOCALES.filter((locale) => locale !== 'en')

const catalogs: Record<string, { renderer: Record<string, string> }> = {
  de,
  es,
  fr,
  ja,
  ko,
  ru,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant
}

const STRONG_KEYS: readonly {
  key: string
  // Locale → a substring the translation cannot lose without weakening the statement.
  mustKeep: Record<string, RegExp>
}[] = [
  {
    key: 'This tag cannot be removed. To work without patient data, create a new project.',
    mustKeep: {
      de: /nicht entfernt werden/,
      es: /no se puede quitar/,
      fr: /ne peut pas être retiré/,
      ja: /外せません/,
      ko: /제거할 수 없습니다/,
      ru: /нельзя снять/,
      'zh-Hans': /无法去除/,
      'zh-Hant': /無法移除/
    }
  },
  {
    key: 'This table contains patient data',
    mustKeep: {
      de: /enthält Patientendaten/,
      es: /contiene datos de pacientes/,
      fr: /contient des données patients/,
      ja: /患者データです/,
      ko: /환자 데이터입니다/,
      ru: /содержит данные пациентов/,
      'zh-Hans': /包含患者数据/,
      'zh-Hant': /包含患者資料/
    }
  },
  {
    key: 'This project contains patient data, so the tag cannot be removed.',
    mustKeep: {
      de: /kann nicht entfernt werden/,
      es: /no se puede quitar/,
      fr: /ne peut pas être retiré/,
      ja: /外すことはできません/,
      ko: /제거할 수 없습니다/,
      ru: /снять нельзя/,
      'zh-Hans': /无法去除/,
      'zh-Hant': /無法移除/
    }
  },
  {
    // The key that lost two clauses in six locales: default-off, logging, free-text exclusion and
    // the 12-category cap must all survive.
    key: 'Not sent by default. Sending is recorded. Free-text columns cannot be selected. A column with more than 12 categories can be selected, but only the 12 most frequent are sent, and the rest are shown as other values omitted.',
    mustKeep: {
      de: /Freitextspalten können nicht ausgewählt werden/,
      es: /no se pueden seleccionar/,
      fr: /ne peuvent pas être sélectionnées/,
      ja: /選べません/,
      ko: /선택할 수 없습니다/,
      ru: /выбрать нельзя/,
      'zh-Hans': /无法选择/,
      'zh-Hant': /無法選取/
    }
  },
  {
    key: "Rows for an individual patient (.head(), .tail(), .sample(), one person's values, row-by-row views) are never sent to the model.",
    mustKeep: {
      de: /werden nie an das Modell gesendet/,
      es: /nunca se envían/,
      fr: /ne sont jamais envoyées/,
      ja: /渡しません/,
      ko: /전송하지 않습니다/,
      ru: /никогда не передаются/,
      'zh-Hans': /不会发送/,
      'zh-Hant': /不會傳送/
    }
  },
  {
    key: 'Cells under 10 are hidden to protect privacy. Your local Notebook still shows the real numbers.',
    mustKeep: {
      de: /zeigt die echten Zahlen/,
      es: /cifras reales/,
      fr: /chiffres réels/,
      ja: /実数が表示されます/,
      ko: /실제 값이 표시됩니다/,
      ru: /видны реальные числа/,
      'zh-Hans': /显示真实数值/,
      'zh-Hant': /顯示真實數值/
    }
  },
  {
    key: 'Text returned to the model passes a masking check. Replaced values are pseudonymized.',
    mustKeep: {
      de: /pseudonymisiert/,
      es: /seudonimizan/,
      fr: /pseudonymisées/,
      ja: /仮名化済み/,
      ko: /가명 처리/,
      ru: /псевдонимизированы/,
      'zh-Hans': /假名替换/,
      'zh-Hant': /假名替換/
    }
  },
  {
    key: 'The table is analyzed in your local Notebook. The model receives only column names, types, row count, and synthetic samples generated from the schema.',
    mustKeep: {
      de: /ausschließlich/,
      es: /únicamente/,
      fr: /seulement/,
      ja: /だけです/,
      ko: /만 전달합니다/,
      ru: /исключительно/,
      'zh-Hans': /只会收到/,
      'zh-Hant': /只會收到/
    }
  },
  {
    key: 'Synthetic sample (not drawn from real rows)',
    mustKeep: {
      de: /nicht aus den echten Zeilen/,
      es: /no procede de las filas reales/,
      fr: /non dérivé des lignes réelles/,
      ja: /実データから作っていません/,
      ko: /실제 행에서 만들지 않음/,
      ru: /не из реальных строк/,
      'zh-Hans': /并非取自真实数据行/,
      'zh-Hant': /並非取自真實資料列/
    }
  },
  {
    // The other documented weakening: six locales dropped the Excel re-save remedy, leaving the
    // reader with a garbled file and no next step.
    key: 'Read as {{encoding}}. If the text is garbled, save the file again in Excel as "CSV UTF-8 (Comma delimited)".',
    mustKeep: {
      de: /in Excel erneut als/,
      es: /vuelva a guardar el archivo en Excel/,
      fr: /réenregistrez le fichier dans Excel/,
      ja: /Excel で.*保存し直して/,
      ko: /Excel에서.*다시 저장하세요/,
      ru: /сохраните файл в Excel заново/,
      'zh-Hans': /在 Excel 中另存为/,
      'zh-Hant': /在 Excel 中另存為/
    }
  },
  {
    key: 'Pre-send checks and restrictions help prevent sending direct identifiers such as names and patient IDs. This is not an absolute guarantee.',
    mustKeep: {
      de: /keine absolute Garantie/,
      es: /garantía absoluta/,
      fr: /pas une garantie absolue/,
      ja: /絶対保証ではありません/,
      ko: /절대적인 보장은 아닙니다/,
      ru: /абсолютная гарантия/,
      'zh-Hans': /绝对保证/,
      'zh-Hant': /絕對保證/
    }
  }
]

// Sentence terminators only: `.head()` must not read as a sentence, so a period only counts when it
// ends a clause (followed by whitespace or the end of the string).
const sentenceCount = (text: string): number =>
  (text.match(/。|[.!?](?=\s|$)/g) ?? []).length

describe('schema-notebook strong copy', () => {
  it('covers the statements this panel can assert', () => {
    // The review lists eleven "must stay strong" statements. Ten of them are rendered by this panel;
    // the eleventh — "This computer is not approved by the hospital…" — has no safe call site: the
    // main process answers `blocked: true` for both the mentor-pack refusal and the
    // PHI-without-approval refusal, with only free text to tell them apart, so the panel cannot
    // choose the right sentence yet. It needs a stable reason code from main first.
    // `encodingNotice` is added on top: it is one of the four translations that had already lost
    // part of its meaning (the Excel re-save remedy) before this ticket.
    expect(STRONG_KEYS).toHaveLength(11)
    expect(new Set(STRONG_KEYS.map((entry) => entry.key)).size).toBe(STRONG_KEYS.length)
  })

  it.each(STRONG_KEYS.flatMap((entry) => TRANSLATED_LOCALES.map((locale) => [locale, entry] as const)))(
    'keeps every clause of %s copy',
    (locale, entry) => {
      const catalog = catalogs[locale]
      expect(catalog, `missing catalog ${locale}`).toBeDefined()
      const translated = catalog!.renderer[entry.key]
      expect(translated, `${locale} is missing ${entry.key}`).toBeTypeOf('string')

      // Dropping a clause is the failure this guards. A translation may split one English sentence
      // into two (de/es/fr/ru do exactly that for the tag statement), but it must never merge or
      // drop one — which is how `categoricalNote` lost its last two clauses.
      expect(
        sentenceCount(translated!),
        `${locale} dropped a clause of "${entry.key}"`
      ).toBeGreaterThanOrEqual(sentenceCount(entry.key))
    }
  )

  it.each(STRONG_KEYS.flatMap((entry) => Object.entries(entry.mustKeep).map(([locale, token]) => [locale, entry.key, token] as const)))(
    'keeps the limiting wording in %s copy',
    (locale, key, token) => {
      expect(catalogs[locale]!.renderer[key]).toMatch(token)
    }
  )
})
