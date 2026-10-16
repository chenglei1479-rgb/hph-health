// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'

import { initI18n } from '../../i18n'
import { DeleteLocalCopiesButton } from './DeleteLocalCopies'
import {
  getPackDeliveryLedger,
  recordPackDelivery,
  resetPackDeliveryLedgerForTests
} from './pack-delivery-ledger'

const ERASURE_CLAIM =
  /完全に消去|完全删除|完全刪除|不可恢复|不可恢復|永久删除|永久刪除|permanently delete|cannot be undone|irrecoverable|completely erase|unwiderruflich|irrécupérable|définitivement|безвозврат|완전히 삭제|endgültig gelöscht/i

const COPY_KEYS = [
  'Delete local copies',
  "Delete the app's local copies?",
  "This deletes the app's local copies of projects, saved conversations, and on-device delivery counts. Backups and copies stored outside the app, including copies kept by the operating system, are not deleted. Files in a project's working folder are not deleted.",
  "The app's local copies were deleted.",
  "Could not delete the app's local copies. Try again.",
  'Deleting local copies…'
]

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  resetPackDeliveryLedgerForTests()
  initI18n('en')
})

const renderButton = async (
  onDeleteLocalCopies: (projectIds: readonly string[]) => Promise<void> = async () => undefined,
  canDelete = true
): Promise<void> => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <DeleteLocalCopiesButton
        canDelete={canDelete}
        projectIds={['project-1', 'project-2']}
        onDeleteLocalCopies={onDeleteLocalCopies}
      />
    )
  })
}

const click = async (selector: string): Promise<void> => {
  const button = document.body.querySelector<HTMLButtonElement>(selector)
  expect(button).not.toBeNull()
  await act(async () => {
    button?.click()
  })
}

it('requires confirmation before deleting local copies and does not claim full erasure', async () => {
  initI18n('en')
  recordPackDelivery('analysis', 'session:one')
  const onDelete = vi.fn(async () => undefined)
  await renderButton(onDelete)

  expect(document.body.querySelector('[data-testid="delete-local-copies-dialog"]')).toBeNull()
  await click('[data-testid="delete-local-copies"]')
  const dialog = document.body.querySelector('[data-testid="delete-local-copies-dialog"]')
  expect(dialog?.textContent).toContain("Delete the app's local copies?")
  expect(dialog?.textContent).toContain('copies kept by the operating system, are not deleted')
  expect(dialog?.textContent).not.toMatch(ERASURE_CLAIM)
  expect(onDelete).not.toHaveBeenCalled()

  await click('[data-testid="delete-local-copies-confirm"]')
  expect(onDelete).toHaveBeenCalledWith(['project-1', 'project-2'])
  expect(getPackDeliveryLedger().totalCompleted).toBe(0)
  expect(document.body.textContent).toContain("The app's local copies were deleted.")
})

it('keeps local copies when confirmation is cancelled or deletion fails', async () => {
  initI18n('ja')
  recordPackDelivery('mentor-pack', 'session:keep')
  const onDelete = vi.fn(async () => undefined)
  await renderButton(onDelete)
  await click('[data-testid="delete-local-copies"]')
  expect(document.body.textContent).toContain('アプリ内のローカルコピーを削除しますか？')
  expect(document.body.textContent).not.toMatch(ERASURE_CLAIM)
  const cancel = [...document.body.querySelectorAll('button')].find(
    (button) => button.textContent === 'キャンセル'
  )
  await act(async () => {
    cancel?.click()
  })
  expect(onDelete).not.toHaveBeenCalled()
  expect(getPackDeliveryLedger().totalCompleted).toBe(1)

  onDelete.mockRejectedValueOnce(new Error('disk'))
  await click('[data-testid="delete-local-copies"]')
  await click('[data-testid="delete-local-copies-confirm"]')
  expect(document.body.textContent).toContain('アプリ内のローカルコピーを削除できませんでした。')
  expect(getPackDeliveryLedger().totalCompleted).toBe(1)
})

it('follows Simplified Chinese for the deletion copy', async () => {
  initI18n('zh-Hans')
  await renderButton()
  await click('[data-testid="delete-local-copies"]')
  expect(document.body.textContent).toContain('删除应用内的本地副本？')
  expect(document.body.textContent).toContain('操作系统保留的副本，不会删除')
  expect(document.body.textContent).not.toContain('アプリ内のローカルコピー')
  expect(document.body.textContent).not.toMatch(ERASURE_CLAIM)
})

it('does not describe the new deletion copy as complete erasure in any locale', () => {
  const source = readFileSync('src/renderer/src/pages/home/DeleteLocalCopies.tsx', 'utf8')
  expect(source).not.toMatch(ERASURE_CLAIM)
  for (const locale of ['de', 'es', 'fr', 'ja', 'ko', 'ru', 'zh-Hans', 'zh-Hant']) {
    const catalog = JSON.parse(readFileSync(`src/shared/i18n/locales/${locale}.json`, 'utf8')) as {
      renderer: Record<string, string>
    }
    for (const key of COPY_KEYS) {
      const value = catalog.renderer[key]
      expect(value, `${locale} ${key}`).toBeTruthy()
      expect(value, `${locale} ${key}`).not.toMatch(ERASURE_CLAIM)
    }
  }
})
