// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { initI18n } from '../../i18n'
import { MedicalResearchLaunchpad } from './MedicalResearchLaunchpad'

afterEach(() => initI18n('en'))

const renderLaunchpad = async (
  select = vi.fn()
): Promise<{
  host: HTMLDivElement
  root: ReturnType<typeof createRoot>
  select: typeof select
}> => {
  const host = document.createElement('div')
  const root = createRoot(host)
  await act(async () => root.render(<MedicalResearchLaunchpad onSelectWorkflow={select} />))
  return { host, root, select }
}

it('shows four deliverable packs and keeps the six research entries behind one home control', async () => {
  initI18n('en')
  const { host, root, select } = await renderLaunchpad()
  try {
    expect(host.querySelector('[data-testid="entry-step-1"]')?.textContent).toContain('Step 1')
    expect(host.textContent).toContain('Project setup')
    const step2 = host.querySelector('[data-testid="entry-step-2"]')
    expect(step2?.textContent).toContain('Step 2')
    expect(step2?.textContent).toContain('Choose a deliverable')
    expect(step2?.textContent).toContain('Deliverable package')
    expect(host.textContent).not.toContain('Special requirements')
    expect(host.querySelector('[data-testid="research-data-flow"]')).toBeNull()
    expect(
      [...host.querySelectorAll('[data-deliverable-card]')].map((card) =>
        card.getAttribute('data-deliverable-card')
      )
    ).toEqual(['writing-pack', 'consultation-pack', 'mentor-pack', 'statistician-export'])
    expect(host.textContent).toContain('Aggregated results only; source data is not included')
    expect(host.textContent).toContain('This pack does not load patient data.')
    expect(host.textContent).toContain(
      'Do not paste individual patient data. Keep the consultation to the study design and a summary of aggregate results.'
    )
    expect(host.querySelector('[data-testid="research-entry-novelty"]')).toBeNull()
    const toggle = host.querySelector<HTMLButtonElement>('[data-testid="start-from-step"]')
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    expect(toggle?.textContent).toContain(
      'Start from a step (literature, planning, analysis, and more)'
    )
    expect(host.querySelector('[data-testid="export-raw-data"]')).toBeNull()
    expect(host.querySelector('[data-testid="export-notebook"]')).toBeNull()
    expect(host.querySelector('[data-testid="export-chat"]')).toBeNull()

    const packages = ['writing-pack', 'consultation-pack', 'mentor-pack'].map((id) =>
      host.querySelector<HTMLButtonElement>(`[data-testid="deliverable-package-${id}"]`)
    )
    expect(packages.every((button) => button?.disabled)).toBe(true)
    const exportPackage = host.querySelector<HTMLButtonElement>(
      '[data-testid="export-statistician-package"]'
    )
    expect(exportPackage?.disabled).toBe(true)

    await act(async () => host.querySelector<HTMLButtonElement>('button')!.click())
    expect(packages.every((button) => button && !button.disabled)).toBe(true)
    expect(exportPackage?.disabled).toBe(false)
    await act(async () => packages[0]!.click())
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
    expect(select.mock.calls.map(([workflow]) => workflow)).toEqual(['writing-pack', 'evidence'])
    await act(async () => exportPackage?.click())
    expect(select).toHaveBeenCalledTimes(2)
    expect(document.body.querySelector('[data-testid="statistician-export-dialog"]')).not.toBeNull()
    expect(
      document.body.querySelector('[data-testid="statistician-export-subtitle"]')?.textContent
    ).toBe('Aggregated results only; source data is not included')
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
    expect(japanese.host.textContent).toContain('学会抄録・英文草稿')
    expect(japanese.host.textContent).toContain('データ監査・統計相談資料')
    expect(japanese.host.textContent).toContain('指導医相談資料')
    expect(japanese.host.textContent).toContain('統計資料の書き出し')
    expect(japanese.host.textContent).toContain('集計結果のみ・原データ含まず')
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
    expect(chinese.host.textContent).toContain('仅汇总结果，不含原始数据')
    expect(chinese.host.textContent).toContain('此交付包不读取患者数据。')
    expect(chinese.host.textContent).not.toContain('ステップから始める')
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
