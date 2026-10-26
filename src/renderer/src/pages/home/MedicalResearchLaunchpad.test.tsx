// @vitest-environment jsdom
import { act, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { dialogFooterClassName } from '../../components/ui/dialog-chrome'
import { initI18n } from '../../i18n'
import { useSettingsStore } from '../../stores/settings-store'
import { CATEGORICAL_RELEASE_LIMIT } from '../../../../main/notebook/schema-only/categorical-release'
import { LOCALES } from '../../../../shared/locale'
import { S34_2_RESEARCH_DESIGN_CHECKLIST } from '../../../../shared/s34-disclaimers'
import {
  HOME_CATEGORICAL_OMISSION,
  HOME_CATEGORICAL_VALUE_LIMIT,
  MedicalResearchLaunchpad,
  SHOW_HOME_PATIENT_DATA_MASKING_NOTE
} from './MedicalResearchLaunchpad'

afterEach(() => {
  vi.useRealTimers()
  initI18n('en')
})

const renderLaunchpad = async (
  select = vi.fn(),
  props: Partial<ComponentProps<typeof MedicalResearchLaunchpad>> = {}
): Promise<{
  host: HTMLDivElement
  root: ReturnType<typeof createRoot>
  select: typeof select
}> => {
  const host = document.createElement('div')
  const root = createRoot(host)
  await act(async () =>
    root.render(<MedicalResearchLaunchpad onSelectWorkflow={select} {...props} />)
  )
  return { host, root, select }
}

it('shows three primary entries in order and keeps the six research entries behind one home control', async () => {
  initI18n('en')
  const { host, root, select } = await renderLaunchpad()
  try {
    expect(host.querySelector('[data-testid="entry-step-1"]')?.textContent).toContain('Step 1')
    expect(host.textContent).toContain('Project setup')
    const step2 = host.querySelector('[data-testid="entry-step-2"]')
    expect(step2?.textContent).toContain('Step 2')
    expect(step2?.textContent).toContain('Choose where to begin')
    expect(step2?.textContent).toContain('Prepare to consult your supervising doctor')
    expect(step2?.textContent).toContain('Analyze your own data')
    expect(step2?.textContent).toContain('Prepare a conference abstract or paper')
    expect(host.querySelector('[data-testid="home-patient-data-note-text"]')?.textContent).toBe(
      'Pre-send checks and restrictions help prevent direct identifiers such as names and patient IDs from being sent. This is not an absolute guarantee.'
    )
    expect(
      host.querySelector('[data-testid="home-patient-data-masking-note"]')?.textContent
    ).toContain(
      'Analysis results are masking-checked before sending, and outputs containing individual rows are not sent.'
    )
    expect(host.querySelector('[data-testid="home-patient-data-details"]')?.textContent).toBe(
      'Details'
    )
    expect(step2?.textContent).not.toContain('Choose a deliverable')
    expect(host.textContent).not.toContain('Special requirements')
    expect(host.querySelector('[data-testid="research-data-flow"]')).toBeNull()
    expect(host.querySelector('[data-testid="export-statistician-package"]')).toBeNull()
    expect(
      [...host.querySelectorAll('[data-home-entry]')].map((card) =>
        card.getAttribute('data-home-entry')
      )
    ).toEqual(['mentor-prep', 'analyze-data', 'write-abstract'])
    expect(host.textContent).not.toContain('Aggregated results only; source data is not included')
    expect(host.textContent).toContain('This pack does not load patient data.')
    expect(host.textContent).toContain(
      'Do not paste individual patient data. Keep the consultation to the study design and a summary of aggregate results.'
    )
    expect(host.querySelector('[data-testid="continue-project"]')).toBeNull()
    expect(host.textContent).not.toContain('Continue a project')
    expect(host.querySelector('[data-testid="delete-local-copies"]')).toBeNull()
    expect(host.querySelector('[data-testid="delete-device-patient-data"]')).toBeNull()
    expect(host.querySelector('[data-testid="open-fictional-sample"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="research-entry-novelty"]')).toBeNull()
    const toggle = host.querySelector<HTMLButtonElement>('[data-testid="start-from-step"]')
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    expect(toggle?.textContent).toContain(
      'Start from a step (literature, planning, analysis, and more)'
    )
    expect(host.querySelector('[data-testid="export-raw-data"]')).toBeNull()
    expect(host.querySelector('[data-testid="export-notebook"]')).toBeNull()
    expect(host.querySelector('[data-testid="export-chat"]')).toBeNull()

    const primary = ['mentor-prep', 'analyze-data', 'write-abstract'].map((id) =>
      host.querySelector<HTMLButtonElement>(`[data-testid="home-entry-${id}"]`)
    )
    expect(primary.every((button) => button?.disabled)).toBe(true)

    await act(async () => host.querySelector<HTMLButtonElement>('button')!.click())
    expect(primary.every((button) => button && !button.disabled)).toBe(true)
    await act(async () => primary[0]!.click())
    await act(async () => primary[1]!.click())
    await act(async () => primary[2]!.click())
    await act(async () => toggle!.click())
    const entries = [
      'novelty',
      'evidence',
      'protocol',
      'analysis',
      'manuscript',
      'academic-english'
    ].map((id) => host.querySelector<HTMLButtonElement>(`[data-testid="research-entry-${id}"]`))
    expect(entries).toHaveLength(6)
    expect(toggle?.getAttribute('aria-expanded')).toBe('true')
    expect(entries.every((button) => button && !button.disabled)).toBe(true)
    const analysisStep = host.querySelector<HTMLButtonElement>(
      '[data-testid="research-entry-analysis"]'
    )
    await act(async () => analysisStep!.click())
    await act(async () => entries[1]!.click())
    expect(select.mock.calls.map(([workflow]) => workflow)).toEqual([
      'mentor-pack',
      'analysis',
      'writing-pack',
      'analysis',
      'evidence'
    ])
    expect(analysisStep?.textContent).toContain('Data analysis')
    expect(document.body.querySelector('[data-testid="statistician-export-dialog"]')).toBeNull()
    expect(document.body.textContent).not.toContain('個体データ')
    expect(select.mock.calls[0][1].length).toBeGreaterThan(0)
  } finally {
    await act(async () => root.unmount())
  }
})

it('follows the language switcher for pack copy instead of forcing Japanese', async () => {
  initI18n('ja')
  const japanese = await renderLaunchpad()
  try {
    expect(japanese.host.textContent).toContain('ステップから始める（文献・計画・解析など）')
    expect(japanese.host.textContent).toContain('指導医と相談する準備')
    expect(japanese.host.textContent).toContain('自分のデータを分析する')
    expect(japanese.host.textContent).toContain('学会抄録・論文を準備する')
    expect(
      japanese.host.querySelector('[data-testid="home-patient-data-note-text"]')?.textContent
    ).toBe(
      '氏名・患者IDなど直接識別子の送信を防ぐため、送信前チェックと制限があります。絶対保証ではありません。'
    )
    expect(
      japanese.host.querySelector('[data-testid="home-patient-data-masking-note"]')?.textContent
    ).toContain('解析結果は送信前にマスキングチェックを行い、個別の行を含む出力は送信しません。')
    expect(japanese.host.textContent).toContain('データの解析は「自分のデータを分析する」から。')
    expect(japanese.host.textContent).not.toContain('データ監査・統計相談資料')
    expect(japanese.host.textContent).toContain('英語論文の執筆')
    expect(japanese.host.textContent).not.toContain('英文学術写作')
    expect(
      japanese.host.querySelector('[data-testid="home-entry-description-mentor-prep"]')?.textContent
    ).toBe(
      '倫理審査前の開題コミュニケーション向け。研究の問い・デザイン・次回指導医に確認すべき点まで。承認番号の強制入力なし。データの解析は「自分のデータを分析する」から。'
    )
    expect(
      japanese.host.querySelector('[data-testid="home-entry-mentor-prep"]')?.textContent
    ).not.toContain('指導医ミーティング用の一枚')
    expect(
      japanese.host.querySelector('[data-testid="home-entry-description-analyze-data"]')
        ?.textContent
    ).toBe(
      '仮名化済みのCSVをアップロードし、変数と欠損を確認します。統計計画の承認後、再現可能な表・図・コードを作成します。'
    )
    expect(
      japanese.host.querySelector('[data-testid="home-entry-analyze-data"]')?.textContent
    ).not.toContain('再現可能な解析を実行します')
    expect(
      japanese.host.querySelector('[data-testid="home-entry-description-write-abstract"]')
        ?.textContent
    ).toContain('英語論文の執筆')
    expect(
      japanese.host.querySelector('[data-testid="home-entry-write-abstract"]')?.textContent
    ).not.toContain('締め切り向けの短い原稿')
    expect(
      japanese.host.querySelector('[data-testid="home-patient-data-details"]')?.textContent
    ).toBe('詳しく')
    expect(japanese.host.textContent).not.toContain('プロジェクトを続ける')
    expect(japanese.host.querySelector('[data-testid="continue-project"]')).toBeNull()
    expect(japanese.host.textContent).not.toContain('統計資料の書き出し')
    expect(japanese.host.textContent).not.toContain('指導医相談資料')
    expect(japanese.host.textContent).toContain('このパックは患者データを読み込みません。')
    expect(japanese.host.textContent).toContain(
      '患者の個別データを貼り付けないでください。相談は研究デザインと集計結果の要約にとどめてください。'
    )
    expect(japanese.host.textContent).not.toContain(
      '締め切り向けの短い原稿。倫理番号と AI 利用の確認あり。'
    )
    expect(
      japanese.host.querySelector('[data-testid="research-use-disclaimer"]')?.textContent
    ).toContain('架空データのみを使用してください。')
    expect(japanese.host.textContent).not.toContain('内部テスト版')
  } finally {
    await act(async () => japanese.root.unmount())
  }

  initI18n('zh-Hans')
  const chinese = await renderLaunchpad()
  try {
    expect(chinese.host.textContent).toContain('从步骤开始（文献、计划、分析等）')
    expect(chinese.host.textContent).toContain('准备与指导医师咨询')
    expect(chinese.host.textContent).toContain('分析自己的数据')
    expect(chinese.host.textContent).toContain('准备学会摘要或论文')
    expect(
      chinese.host.querySelector('[data-testid="home-patient-data-note-text"]')?.textContent
    ).toBe('为防止发送姓名、患者ID等直接标识符，设有发送前检查和限制。这并非绝对保证。')
    expect(
      chinese.host.querySelector('[data-testid="home-patient-data-masking-note"]')?.textContent
    ).toContain('分析结果在发送前会做脱敏检查，含单个病例行的输出不会发送。')
    expect(chinese.host.textContent).toContain('数据分析请从「分析自己的数据」开始。')
    expect(chinese.host.textContent).not.toContain('数据审计与统计咨询包')
    expect(chinese.host.textContent).toContain('英语论文撰写')
    expect(chinese.host.textContent).not.toContain('英文学术写作')
    expect(
      chinese.host.querySelector('[data-testid="home-entry-description-mentor-prep"]')?.textContent
    ).toBe(
      '用于伦理审查前的开题沟通：研究问题、设计和下次要向指导医师确认的事项。不强制填写批准号。数据分析请从「分析自己的数据」开始。'
    )
    expect(
      chinese.host.querySelector('[data-testid="home-entry-mentor-prep"]')?.textContent
    ).not.toContain('指导医师会议用的一页材料')
    expect(
      chinese.host.querySelector('[data-testid="home-entry-description-analyze-data"]')?.textContent
    ).toBe('上传匿名化 CSV，检查变量与缺失值，确认统计方案后生成可复现的表格、图表和代码。')
    expect(
      chinese.host.querySelector('[data-testid="home-entry-analyze-data"]')?.textContent
    ).not.toContain('确认统计计划后再运行可复现分析')
    expect(
      chinese.host.querySelector('[data-testid="home-entry-description-write-abstract"]')
        ?.textContent
    ).toContain('英语论文撰写')
    expect(
      chinese.host.querySelector('[data-testid="home-entry-write-abstract"]')?.textContent
    ).not.toContain('面向截止日期的短稿')
    expect(
      chinese.host.querySelector('[data-testid="home-patient-data-details"]')?.textContent
    ).toBe('详细')
    expect(chinese.host.textContent).not.toContain('继续项目')
    expect(chinese.host.querySelector('[data-testid="continue-project"]')).toBeNull()
    expect(chinese.host.textContent).not.toContain('仅汇总结果，不含原始数据')
    expect(chinese.host.textContent).toContain('此交付包不读取患者数据。')
    expect(chinese.host.textContent).not.toContain('ステップから始める')
    expect(chinese.host.textContent).not.toContain('指導医と相談する準備')
    expect(chinese.host.textContent).not.toContain('このパックは患者データを読み込みません。')
    expect(
      chinese.host.querySelector('[data-testid="research-use-disclaimer"]')?.textContent
    ).toContain('请仅使用虚构数据。')
    expect(chinese.host.textContent).not.toContain('内部测试版')
  } finally {
    await act(async () => chinese.root.unmount())
  }

  initI18n('de')
  const german = await renderLaunchpad()
  try {
    expect(german.host.textContent).toContain(
      'Mit einem Schritt beginnen (Literatur, Planung, Analyse und mehr)'
    )
    expect(german.host.textContent).not.toContain('ステップから始める')
    expect(german.host.textContent).not.toContain('このパックは患者データを読み込みません。')
    expect(
      german.host.querySelector('[data-testid="research-use-disclaimer"]')?.textContent
    ).toContain('Verwenden Sie nur fiktive Daten.')
  } finally {
    await act(async () => german.root.unmount())
  }
})

it('keeps the entry cards and secondary row aligned without a continue-project section', async () => {
  initI18n('en')
  const english = await renderLaunchpad()
  try {
    expect(english.host.querySelector('[data-testid="continue-project"]')).toBeNull()
    expect(english.host.querySelector('[data-testid="recent-projects-toggle"]')).toBeNull()
    expect(english.host.textContent).not.toContain('Continue a project')
    expect(english.host.textContent).not.toContain('No recent projects yet.')
    const entries = english.host.querySelector('[data-testid="home-primary-entries"]')
    expect(entries?.className).toContain('lg:grid-cols-3')
    const note = english.host.querySelector('[data-testid="home-patient-data-note"]')
    expect(note?.parentElement).toBe(entries?.parentElement)
    expect(entries?.nextElementSibling).toBe(note)
    expect(note?.className).toContain('w-full')
    expect(note?.className).toContain('min-w-0')
    expect(note?.className).toContain('text-left')
    expect(note?.className).toContain('text-xs')
    expect(note?.className).toContain('text-text-300')
    expect(note?.className).not.toContain('border')
    expect(note?.className).not.toContain('shadow-card')
    expect(note?.querySelector('svg')).toBeNull()
    const entry = english.host.querySelector('[data-testid="home-entry-analyze-data"]')
    expect(entry?.className).toContain('w-full')
    expect(entry?.className).toContain('min-w-0')
    expect(entry?.className).toContain('rounded-2xl')
    expect(entry?.className).toContain('shadow-card')
    expect(entry?.className).not.toContain('border')
    const sample = english.host.querySelector<HTMLButtonElement>(
      '[data-testid="open-fictional-sample"]'
    )
    const expander = english.host.querySelector<HTMLButtonElement>(
      '[data-testid="start-from-step"]'
    )
    const secondary = english.host.querySelector('[data-testid="home-secondary-actions"]')
    expect(secondary?.className).toContain('w-full')
    expect(secondary?.contains(sample)).toBe(true)
    expect(secondary?.contains(expander)).toBe(true)
    expect(sample?.className).toContain('w-full')
    expect(sample?.className).not.toContain('shadow-card')
    expect(expander?.className).not.toContain('shadow-card')
    expect(expander?.className).toContain('w-full')
    expect(sample?.textContent).toContain('No model call and no API key.')
    const disclaimer = english.host.querySelector('[data-testid="research-use-disclaimer"]')
    expect(disclaimer?.className).toContain('w-full')
    expect(disclaimer?.className).toContain('bg-bg-200')
    expect(disclaimer?.textContent).toContain('Use fictional data only.')
    expect(disclaimer?.textContent).toContain('Do not upload identifiable patient information.')
    expect(english.host.querySelector('[data-testid="prerelease-banner"]')).toBeNull()
    expect(english.host.querySelector('[data-testid="delete-local-copies"]')).toBeNull()
    expect(english.host.querySelector('[data-testid="delete-device-patient-data"]')).toBeNull()
  } finally {
    await act(async () => english.root.unmount())
  }

  initI18n('ja')
  const japanese = await renderLaunchpad()
  try {
    expect(japanese.host.querySelector('[data-testid="continue-project"]')).toBeNull()
    expect(japanese.host.textContent).not.toContain('プロジェクトを続ける')
    expect(japanese.host.textContent).toContain('モデルは呼ばず、API キーも要りません。')
  } finally {
    await act(async () => japanese.root.unmount())
  }

  initI18n('zh-Hans')
  const simplified = await renderLaunchpad()
  try {
    expect(simplified.host.querySelector('[data-testid="continue-project"]')).toBeNull()
    expect(simplified.host.textContent).not.toContain('继续项目')
    expect(simplified.host.textContent).toContain('不调用模型，也不需要 API 密钥。')
    expect(simplified.host.textContent).not.toContain('3日前')
  } finally {
    await act(async () => simplified.root.unmount())
  }

  initI18n('zh-Hant')
  const traditional = await renderLaunchpad()
  try {
    expect(traditional.host.querySelector('[data-testid="continue-project"]')).toBeNull()
    expect(traditional.host.textContent).not.toContain('繼續專案')
    expect(traditional.host.textContent).toContain('不呼叫模型，也不需要 API 金鑰。')
    expect(
      traditional.host.querySelector('[data-testid="research-use-disclaimer"]')?.textContent
    ).toContain('請僅使用虛構資料。')
    expect(traditional.host.textContent).not.toContain('內部測試版')
  } finally {
    await act(async () => traditional.root.unmount())
  }
})

it('shows the masking sentence in Japanese and explains the real category cap', async () => {
  expect(SHOW_HOME_PATIENT_DATA_MASKING_NOTE).toBe(true)
  expect(HOME_CATEGORICAL_VALUE_LIMIT).toBe(CATEGORICAL_RELEASE_LIMIT)
  expect(HOME_CATEGORICAL_OMISSION).toBe('他 N 種類は省略')
  initI18n('ja')
  const { host, root } = await renderLaunchpad()
  try {
    expect(host.textContent).toContain('個別の行を含む出力は送信しません。')
    const details = host.querySelector<HTMLButtonElement>(
      '[data-testid="home-patient-data-details"]'
    )
    expect(details?.textContent).toBe('詳しく')
    await act(async () => details!.click())
    const panel = document.body.querySelector('[data-testid="home-patient-data-details-panel"]')
    expect(panel?.textContent).toContain(String(CATEGORICAL_RELEASE_LIMIT))
    expect(panel?.textContent).toContain('他 N 種類は省略')
    expect(panel?.className).not.toContain('border')
  } finally {
    await act(async () => root.unmount())
  }
})

it('shows the §34.2 ① research-design checklist verbatim on the mentor-prep card in every locale', async () => {
  for (const locale of LOCALES) {
    initI18n(locale)
    const { host, root } = await renderLaunchpad()
    try {
      const disclaimers = host.querySelectorAll('[data-testid="s34-disclaimer-research-design"]')
      expect(disclaimers, locale).toHaveLength(1)
      expect(disclaimers[0]?.textContent, locale).toBe(S34_2_RESEARCH_DESIGN_CHECKLIST)
      const mentorCard = host.querySelector('[data-testid="home-entry-mentor-prep"]')
      expect(mentorCard?.parentElement?.contains(disclaimers[0]!), locale).toBe(true)
      for (const otherEntryId of ['analyze-data', 'write-abstract'] as const) {
        expect(
          host.querySelector(`[data-testid="home-entry-${otherEntryId}"]`)?.textContent,
          locale
        ).not.toContain(S34_2_RESEARCH_DESIGN_CHECKLIST)
      }
    } finally {
      await act(async () => root.unmount())
    }
  }
})

it('keeps the primary row on one card track and overflow-safe without dropping the mentor note', async () => {
  initI18n('ja')
  const { host, root } = await renderLaunchpad()
  try {
    // Three columns share the card track at lg; the mentor §34.2 note owns the second track, so the
    // cards stay one height instead of each column sizing itself from its own Japanese copy.
    const grid = host.querySelector('[data-testid="home-primary-entries"]')
    expect(grid?.className).toContain('lg:grid-cols-3')
    expect(grid?.className).toContain('lg:grid-rows-[auto_auto]')
    const columns = [...host.querySelectorAll('[data-home-entry]')].map(
      (card) => card.parentElement
    )
    expect(columns).toHaveLength(3)
    for (const column of columns) {
      expect(column?.className).toContain('min-w-0')
      expect(column?.className).toContain('lg:row-span-2')
      expect(column?.className).toContain('lg:grid-rows-subgrid')
    }

    // The disclaimer still hangs under the mentor-prep column only.
    const mentorColumn = columns[0]
    const disclaimer = mentorColumn?.querySelector('[data-testid="s34-disclaimer-research-design"]')
    expect(disclaimer?.textContent).toBe(S34_2_RESEARCH_DESIGN_CHECKLIST)
    expect(mentorColumn?.querySelector('[data-testid="home-entry-mentor-prep"]')).not.toBeNull()
    for (const otherColumn of columns.slice(1)) {
      expect(
        otherColumn?.querySelector('[data-testid="s34-disclaimer-research-design"]')
      ).toBeNull()
    }

    // Long Japanese copy may wrap inside a column, never widen the row.
    for (const entryId of ['mentor-prep', 'analyze-data', 'write-abstract'] as const) {
      const card = host.querySelector(`[data-testid="home-entry-${entryId}"]`)
      expect(card?.className).toContain('min-w-0')
      expect(card?.className).not.toContain('whitespace-nowrap')
      const description = host.querySelector(`[data-testid="home-entry-description-${entryId}"]`)
      expect(description?.className).toContain('min-w-0')
      expect(description?.className).toContain('[overflow-wrap:anywhere]')
    }
    const expanderLabel = host.querySelector('[data-testid="start-from-step"] span')
    expect(expanderLabel?.className).toContain('min-w-0')
    expect(expanderLabel?.className).toContain('[overflow-wrap:anywhere]')

    // #63 must stay fixed: the shared footer no longer forces every button label to wrap.
    expect(dialogFooterClassName).not.toContain('[&_button]:whitespace-normal')
    expect(dialogFooterClassName).not.toContain('overflow-wrap')
  } finally {
    await act(async () => root.unmount())
  }
})

it('renders Home when a legacy preset has no seed invite status', async () => {
  const previous = useSettingsStore.getState().seedInvite
  // Simulate an untyped preset from before seed invites existed.
  useSettingsStore.setState({ seedInvite: undefined as unknown as typeof previous })
  let rendered: Awaited<ReturnType<typeof renderLaunchpad>> | undefined
  try {
    rendered = await renderLaunchpad()
    expect(rendered.host.querySelector('[data-testid="entry-step-1"]')).not.toBeNull()
    expect(rendered.host.textContent).not.toContain('先生が登録した事業者')
  } finally {
    if (rendered) await act(async () => rendered!.root.unmount())
    useSettingsStore.setState({ seedInvite: previous })
  }
})
