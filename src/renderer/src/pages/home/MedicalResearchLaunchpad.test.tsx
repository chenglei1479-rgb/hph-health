// @vitest-environment jsdom
import { act, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { initI18n } from '../../i18n'
import { useSettingsStore } from '../../stores/settings-store'
import { CATEGORICAL_RELEASE_LIMIT } from '../../../../main/notebook/schema-only/categorical-release'
import { LOCALES } from '../../../../shared/locale'
import { HOME_CATEGORICAL_VALUE_LIMIT, MedicalResearchLaunchpad } from './MedicalResearchLaunchpad'

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
      'Pre-send checks and restrictions help prevent sending direct identifiers such as names and patient IDs. This is not an absolute guarantee.'
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
    expect(japanese.host.textContent).toContain('自分のデータを解析する')
    expect(japanese.host.textContent).toContain('学会抄録・論文の下書き')
    expect(
      japanese.host.querySelector('[data-testid="home-patient-data-note-text"]')?.textContent
    ).toBe(
      '氏名・患者IDなど直接識別子の送信を防ぐため、送信前チェックと制限があります。絶対保証ではありません。'
    )
    expect(
      japanese.host.querySelector('[data-testid="home-entry-mentor-prep"]')?.textContent
    ).not.toContain('指導医ミーティング用の一枚')
    expect(
      japanese.host.querySelector('[data-testid="home-entry-description-analyze-data"]')
        ?.textContent
    ).toBe('統計計画を確認し、表・図・コードを作成します。')
    expect(
      japanese.host.querySelector('[data-testid="home-entry-analyze-data"]')?.textContent
    ).not.toContain('再現可能な解析を実行します')
    expect(
      japanese.host.querySelector('[data-testid="home-entry-description-write-abstract"]')
        ?.textContent
    ).toContain('学会抄録・短い論文の草稿を作成し、確認します。')
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
    ).toBe('为防止发送姓名、患者编号等直接标识符，设有发送前检查与限制。这不是绝对保证。')
    expect(
      chinese.host.querySelector('[data-testid="home-entry-mentor-prep"]')?.textContent
    ).not.toContain('指导医师会议用的一页材料')
    expect(
      chinese.host.querySelector('[data-testid="home-entry-description-analyze-data"]')?.textContent
    ).toBe('确认统计方案后，生成表格、图形与代码。')
    expect(
      chinese.host.querySelector('[data-testid="home-entry-analyze-data"]')?.textContent
    ).not.toContain('确认统计计划后再运行可复现分析')
    expect(
      chinese.host.querySelector('[data-testid="home-entry-description-write-abstract"]')
        ?.textContent
    ).toContain('起草学会摘要或短篇论文，供人工复核。')
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

it('keeps the brief 28 footer and localizes details in every locale', async () => {
  expect(HOME_CATEGORICAL_VALUE_LIMIT).toBe(CATEGORICAL_RELEASE_LIMIT)
  for (const locale of LOCALES) {
    initI18n(locale)
    const { host, root } = await renderLaunchpad()
    try {
      expect(host.querySelectorAll('[data-testid="home-patient-data-note"]')).toHaveLength(1)
      expect(host.querySelector('[data-testid="home-patient-data-masking-note"]')).toBeNull()
      expect(host.querySelector('[data-testid="s34-disclaimer-research-design"]')).toBeNull()
      expect(host.querySelector('[data-testid="home-external-endpoints"]')).toBeNull()
      const cards = [...host.querySelectorAll('[data-home-entry]')]
      expect(cards).toHaveLength(3)
      for (const card of cards) {
        expect(card.className).toContain('min-w-0')
        expect(card.className).not.toContain('whitespace-nowrap')
      }
      if (locale !== 'ja') expect(host.textContent).not.toMatch(/[\u3040-\u30ff]/)
      await act(async () =>
        host.querySelector<HTMLButtonElement>('[data-testid="home-patient-data-details"]')!.click()
      )
      const panel = document.body.querySelector('[data-testid="home-patient-data-details-panel"]')
      expect(panel?.textContent).toContain(String(CATEGORICAL_RELEASE_LIMIT))
      expect(panel?.querySelector('[data-testid="s34-disclaimer-research-design"]')).not.toBeNull()
      if (locale !== 'ja') expect(panel?.textContent).not.toMatch(/[\u3040-\u30ff]/)
      await act(async () =>
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      )
    } finally {
      await act(async () => root.unmount())
    }
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
