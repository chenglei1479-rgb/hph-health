// @vitest-environment jsdom
import { act, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { initI18n } from '../../i18n'
import { MedicalResearchLaunchpad } from './MedicalResearchLaunchpad'

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
  const openProject = vi.fn()
  const { host, root, select } = await renderLaunchpad(vi.fn(), {
    recentProjects: [{ id: 'study-1', name: 'Lung cohort' }],
    onOpenProject: openProject
  })
  try {
    expect(host.querySelector('[data-testid="entry-step-1"]')?.textContent).toContain('Step 1')
    expect(host.textContent).toContain('Project setup')
    const step2 = host.querySelector('[data-testid="entry-step-2"]')
    expect(step2?.textContent).toContain('Step 2')
    expect(step2?.textContent).toContain('Choose where to begin')
    expect(step2?.textContent).toContain('Prepare to consult your supervising doctor')
    expect(step2?.textContent).toContain('Analyze data')
    expect(step2?.textContent).toContain('Write an abstract or paper')
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
    expect(host.querySelector('[data-testid="continue-project-study-1"]')?.textContent).toContain(
      'Lung cohort'
    )
    expect(host.querySelector('[data-testid="delete-local-copies"]')).not.toBeNull()
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
    const continueProject = host.querySelector<HTMLButtonElement>(
      '[data-testid="continue-project-study-1"]'
    )
    expect(continueProject?.disabled).toBe(false)

    await act(async () => host.querySelector<HTMLButtonElement>('button')!.click())
    expect(primary.every((button) => button && !button.disabled)).toBe(true)
    await act(async () => primary[0]!.click())
    await act(async () => primary[1]!.click())
    await act(async () => primary[2]!.click())
    await act(async () => continueProject?.click())
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
    await act(async () => entries[1]!.click())
    expect(select.mock.calls.map(([workflow]) => workflow)).toEqual([
      'mentor-pack',
      'analysis',
      'writing-pack',
      'evidence'
    ])
    expect(openProject).toHaveBeenCalledWith('study-1')
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
    expect(japanese.host.textContent).toContain('データを分析')
    expect(japanese.host.textContent).toContain('抄録・論文を書く')
    expect(japanese.host.textContent).toContain('プロジェクトを続ける')
    expect(japanese.host.textContent).not.toContain('統計資料の書き出し')
    expect(japanese.host.textContent).not.toContain('指導医相談資料')
    expect(japanese.host.textContent).toContain('このパックは患者データを読み込みません。')
    expect(japanese.host.textContent).toContain(
      '患者の個別データを貼り付けないでください。相談は研究デザインと集計結果の要約にとどめてください。'
    )
    expect(japanese.host.textContent).toContain(
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
    expect(chinese.host.textContent).toContain('数据分析')
    expect(chinese.host.textContent).toContain('撰写摘要或论文')
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

const NOW = 1_700_000_000_000
const DAY = 24 * 60 * 60 * 1000
const LONG_TITLE =
  '免疫チェックポイント阻害薬による肺がん治療効果を検討する多施設後方視的コホート研究'

const recentProjectFixtures = [
  { id: 'short', name: '肺コホート', updatedAt: NOW - 2 * 60 * 60 * 1000 },
  { id: 'long', name: LONG_TITLE, updatedAt: NOW - 3 * DAY },
  { id: 'mid', name: '再入院リスク', updatedAt: NOW - 5 * DAY },
  { id: 'plan', name: '研究計画', updatedAt: NOW - 40 * 60 * 1000 },
  { id: 'extra', name: '5件目のプロジェクト', updatedAt: NOW - 12 * DAY }
]

const projectCards = (host: HTMLElement): HTMLButtonElement[] => [
  ...host.querySelectorAll<HTMLButtonElement>('[data-testid="continue-project-grid"] button')
]

it('renders equal recent-project cards, a show-all toggle, and localized updated times', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  initI18n('en')
  const english = await renderLaunchpad(vi.fn(), { recentProjects: recentProjectFixtures })
  document.body.append(english.host)
  try {
    const grid = english.host.querySelector('[data-testid="continue-project-grid"]')
    expect(grid?.className).toContain('sm:grid-cols-2')
    expect(grid?.querySelector('[data-testid="open-fictional-sample"]')).toBeNull()
    const cards = projectCards(english.host)
    expect(cards.map((card) => card.getAttribute('data-testid'))).toEqual([
      'continue-project-short',
      'continue-project-long',
      'continue-project-mid',
      'continue-project-plan'
    ])
    expect(english.host.querySelector('[data-testid="continue-project-extra"]')).toBeNull()
    for (const card of cards) {
      expect(card.className).toContain('h-24')
      expect(card.className).toContain('w-full')
      expect(card.className).toContain('min-w-0')
    }
    const longTitle = english.host.querySelector('[data-testid="continue-project-title-long"]')
    expect(longTitle?.className).toContain('line-clamp-2')
    expect(longTitle?.textContent).toBe(LONG_TITLE)
    expect(
      english.host.querySelector('[data-testid="continue-project-updated-short"]')?.textContent
    ).toBe('Updated 2h')
    expect(
      english.host.querySelector('[data-testid="continue-project-updated-long"]')?.textContent
    ).toBe('Updated 3d')

    const sample = english.host.querySelector<HTMLButtonElement>(
      '[data-testid="open-fictional-sample"]'
    )
    const expander = english.host.querySelector<HTMLButtonElement>(
      '[data-testid="start-from-step"]'
    )
    const secondary = english.host.querySelector('[data-testid="home-secondary-actions"]')
    expect(secondary?.contains(sample)).toBe(true)
    expect(secondary?.contains(expander)).toBe(true)
    expect(sample?.className).not.toContain('shadow-card')
    expect(expander?.className).not.toContain('shadow-card')
    expect(expander?.className).toContain('w-full')
    expect(sample?.textContent).toContain('No model call and no API key.')
    const disclaimer = english.host.querySelector('[data-testid="research-use-disclaimer"]')
    expect(disclaimer?.className).toContain('bg-bg-200')
    expect(disclaimer?.textContent).toContain('Use fictional data only.')
    expect(disclaimer?.textContent).toContain('Do not upload identifiable patient information.')
    expect(english.host.querySelector('[data-testid="prerelease-banner"]')).toBeNull()
    expect(english.host.querySelector('[data-testid="delete-local-copies"]')).not.toBeNull()

    const toggle = english.host.querySelector<HTMLButtonElement>(
      '[data-testid="recent-projects-toggle"]'
    )
    expect(toggle?.textContent).toBe('Show all projects')
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    await act(async () => toggle?.click())
    expect(projectCards(english.host)).toHaveLength(5)
    expect(toggle?.textContent).toBe('Show fewer')
    expect(toggle?.getAttribute('aria-expanded')).toBe('true')
    await act(async () => toggle?.click())
    expect(english.host.querySelector('[data-testid="continue-project-extra"]')).toBeNull()

    const longCard = english.host.querySelector<HTMLButtonElement>(
      '[data-testid="continue-project-long"]'
    )
    await act(async () => {
      longCard?.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }))
      await vi.advanceTimersByTimeAsync(400)
    })
    const tooltip = document.body.querySelector('[data-slot="tooltip-content"]')
    expect(tooltip?.childNodes[0]?.textContent).toBe(LONG_TITLE)
  } finally {
    english.host.remove()
    await act(async () => english.root.unmount())
  }

  initI18n('ja')
  const japanese = await renderLaunchpad(vi.fn(), { recentProjects: recentProjectFixtures })
  try {
    expect(
      japanese.host.querySelector('[data-testid="continue-project-updated-long"]')?.textContent
    ).toBe('3日前 に更新されました')
    expect(
      japanese.host.querySelector('[data-testid="continue-project-updated-short"]')?.textContent
    ).toBe('2時間前 に更新されました')
    expect(japanese.host.querySelector('[data-testid="recent-projects-toggle"]')?.textContent).toBe(
      'すべてのプロジェクトを表示'
    )
    expect(japanese.host.textContent).toContain('モデルは呼ばず、API キーも要りません。')
  } finally {
    await act(async () => japanese.root.unmount())
  }

  initI18n('zh-Hans')
  const simplified = await renderLaunchpad(vi.fn(), { recentProjects: recentProjectFixtures })
  try {
    expect(
      simplified.host.querySelector('[data-testid="continue-project-updated-long"]')?.textContent
    ).toBe('更新于 3 天前')
    expect(
      simplified.host.querySelector('[data-testid="recent-projects-toggle"]')?.textContent
    ).toBe('显示所有项目')
    expect(simplified.host.textContent).toContain('不调用模型，也不需要 API 密钥。')
    expect(simplified.host.textContent).not.toContain('3日前')
  } finally {
    await act(async () => simplified.root.unmount())
  }

  initI18n('zh-Hant')
  const traditional = await renderLaunchpad(vi.fn(), { recentProjects: recentProjectFixtures })
  try {
    expect(
      traditional.host.querySelector('[data-testid="continue-project-updated-long"]')?.textContent
    ).toBe('更新於 3 天前')
    expect(
      traditional.host.querySelector('[data-testid="continue-project-updated-short"]')?.textContent
    ).toBe('更新於 2 小時前')
    expect(
      traditional.host.querySelector('[data-testid="recent-projects-toggle"]')?.textContent
    ).toBe('顯示所有專案')
    expect(traditional.host.textContent).toContain('不呼叫模型，也不需要 API 金鑰。')
    expect(
      traditional.host.querySelector('[data-testid="research-use-disclaimer"]')?.textContent
    ).toContain('請僅使用虛構資料。')
    expect(traditional.host.textContent).not.toContain('內部測試版')
  } finally {
    await act(async () => traditional.root.unmount())
  }
})
