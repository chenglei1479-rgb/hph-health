// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'

import { initI18n } from '@/i18n'
import { PackNextStepCard } from './PackNextStepCard'

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  initI18n('en')
})

const renderCard = async (
  completionId: 'consultation-pack' | 'mentor-pack' | 'writing-pack' | 'analysis',
  showUnreleasedPlaceholders = true
): Promise<HTMLDivElement> => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      <PackNextStepCard
        completionId={completionId}
        showUnreleasedPlaceholders={showUnreleasedPlaceholders}
      />
    )
  })
  return container
}

it('recommends analysis in the selected language and hides unreleased cards when the flag is off', async () => {
  initI18n('ja')
  const japanese = await renderCard('consultation-pack')
  expect(japanese.textContent).toContain('次のステップ')
  expect(japanese.textContent).toContain('データ解析')
  expect(japanese.textContent).not.toContain('近日公開')
  expect(japanese.querySelector('[data-next-step]')?.getAttribute('data-next-step')).toBe(
    'analysis'
  )

  initI18n('zh-Hans')
  await act(async () => {
    root?.render(<PackNextStepCard completionId="analysis" />)
  })
  expect(container?.textContent).toContain('下一步')
  expect(container?.textContent).toContain('学会摘要')
  expect(container?.textContent).not.toContain('次のステップ')

  initI18n('ja')
  await act(async () => {
    root?.render(<PackNextStepCard completionId="mentor-pack" />)
  })
  expect(container?.textContent).toContain('近日公開')
  expect(container?.textContent).toContain('倫理申請書類')
  expect(container?.textContent).not.toMatch(/まもなく|20\d{2}/)
  expect(container?.querySelector('button[data-testid="pack-next-step-open"]')).toBeNull()

  await act(async () => {
    root?.render(
      <PackNextStepCard completionId="writing-pack" showUnreleasedPlaceholders={false} />
    )
  })
  expect(container?.querySelector('[data-testid="pack-next-step"]')).toBeNull()

  initI18n('en')
  await act(async () => {
    root?.render(<PackNextStepCard completionId="writing-pack" />)
  })
  expect(container?.textContent).toContain('Not available in this version')
  expect(container?.textContent).toContain('Slides and poster')
  expect(container?.textContent).not.toContain('近日公開')
})
