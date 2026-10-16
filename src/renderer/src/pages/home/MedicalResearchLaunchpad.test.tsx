// @vitest-environment jsdom
import { act, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { initI18n } from '../../i18n'
import { MedicalResearchLaunchpad } from './MedicalResearchLaunchpad'

afterEach(() => initI18n('en'))

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
  } finally {
    await act(async () => german.root.unmount())
  }
})
