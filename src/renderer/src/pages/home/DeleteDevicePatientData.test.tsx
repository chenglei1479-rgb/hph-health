// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'

import { APP } from '../../../../shared/app-config'
import { initI18n } from '../../i18n'
import { DeleteDevicePatientData } from './DeleteDevicePatientData'
import { ProjectFormDialog } from './ProjectFormDialog'

const ERASURE_CLAIM =
  /完全に消去|完全删除|完全刪除|不可恢复|不可恢復|永久删除|永久刪除|permanently delete|cannot be undone|irrecoverable|completely erase|unwiderruflich|irrécupérable|définitivement|безвозврат|완전히 삭제|endgültig gelöscht/i

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  initI18n('en')
})

const renderDelete = async (
  onDelete: (projectId: string) => Promise<void> = async () => undefined,
  canDelete = true
): Promise<void> => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <DeleteDevicePatientData projectId="project-1" canDelete={canDelete} onDelete={onDelete} />
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

it('asks twice and deletes only the one project after the second confirmation', async () => {
  initI18n('en')
  const onDelete = vi.fn(async () => undefined)
  await renderDelete(onDelete)

  expect(
    document.body.querySelector('[data-testid="delete-device-patient-data-review"]')
  ).toBeNull()
  await click('[data-testid="delete-device-patient-data"]')
  const review = document.body.querySelector('[data-testid="delete-device-patient-data-review"]')
  expect(review?.textContent).toContain(`${APP.name} will delete data it stores`)
  expect(review?.textContent).toContain("follow your institution's procedure")
  expect(review?.textContent).toContain(
    `Original source files that were imported, such as Excel workbooks, are not deleted by ${APP.name}. Delete them yourself according to the method in the research protocol.`
  )
  expect(review?.textContent).not.toContain('DRA')
  expect(review?.textContent).toContain('research protocol before you delete')
  expect(review?.textContent).toContain(
    'export code and result tables that contain no patient data'
  )
  expect(review?.textContent).not.toMatch(ERASURE_CLAIM)
  expect(onDelete).not.toHaveBeenCalled()

  await click('[data-testid="delete-device-patient-data-continue"]')
  const confirm = document.body.querySelector(
    '[data-testid="delete-device-patient-data-confirm-dialog"]'
  )
  expect(confirm?.textContent).toContain("Imported copies of this project's data")
  expect(confirm?.textContent).toContain('Notebook caches for this project')
  expect(confirm?.textContent).toContain(
    "Analysis intermediate results, including results inside this project's working folder"
  )
  expect(confirm?.textContent).toContain('Conversations in this project are not deleted.')
  expect(confirm?.textContent).not.toMatch(ERASURE_CLAIM)
  expect(onDelete).not.toHaveBeenCalled()

  await click('[data-testid="delete-device-patient-data-confirm"]')
  expect(onDelete).toHaveBeenCalledTimes(1)
  expect(onDelete).toHaveBeenCalledWith('project-1')
  expect(
    document.body.querySelector('[data-testid="delete-device-patient-data-done"]')?.textContent
  ).toContain('Patient data stored for this project on this device was deleted.')
})

it('does not delete when either confirmation is cancelled', async () => {
  const onDelete = vi.fn(async () => undefined)
  await renderDelete(onDelete)
  await click('[data-testid="delete-device-patient-data"]')
  await click('[data-testid="delete-device-patient-data-review"] button')
  expect(onDelete).not.toHaveBeenCalled()

  await click('[data-testid="delete-device-patient-data"]')
  await click('[data-testid="delete-device-patient-data-continue"]')
  const cancel = [
    ...document.body.querySelectorAll(
      '[data-testid="delete-device-patient-data-confirm-dialog"] button'
    )
  ].find((button) => button.textContent === 'Cancel')
  await act(async () => {
    cancel?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  expect(onDelete).not.toHaveBeenCalled()
})

it('uses the device patient-data label in Japanese, Chinese, and English', async () => {
  initI18n('ja')
  await renderDelete()
  expect(host?.textContent).toContain('この端末の患者データを削除')
  await click('[data-testid="delete-device-patient-data"]')
  const review = document.body.querySelector('[data-testid="delete-device-patient-data-review"]')
  expect(review?.textContent).toContain(
    `${APP.name} 内のデータを削除します。端末の廃棄・譲渡時は所属機関の手順に従ってください。`
  )
  expect(review?.textContent).toContain(
    `取り込み元の元ファイル（Excel 等）は ${APP.name} では削除されません。ご自身で研究計画書の方法に従って削除してください。`
  )
  expect(review?.textContent).not.toContain('DRA')
  expect(review?.textContent).not.toContain('完全に消去')
  expect(review?.textContent).toContain(
    '研究計画書に定められた保管期間・保管場所を確認してから削除してください。'
  )
  await act(async () => root?.unmount())

  initI18n('zh-Hans')
  await renderDelete()
  expect(host?.textContent).toContain('删除此设备上的患者数据')
  expect(host?.textContent).not.toContain('この端末の患者データを削除')
  await click('[data-testid="delete-device-patient-data"]')
  expect(
    document.body.querySelector('[data-testid="delete-device-patient-data-review"]')?.textContent
  ).toContain(
    `导入来源的原始文件（Excel 等）不会被 ${APP.name} 删除。请您按照研究计划书的方法自行删除。`
  )
  await act(async () => root?.unmount())

  initI18n('zh-Hant')
  await renderDelete()
  expect(host?.textContent).toContain('刪除此裝置上的患者資料')
})

it('keeps the action out of project creation and off the home delete-all control', async () => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <ProjectFormDialog
        open
        title="New project"
        description="Create a project."
        submitLabel="Create"
        nameDraft=""
        descriptionDraft=""
        agentContextDraft=""
        isSubmitting={false}
        error={undefined}
        onNameChange={vi.fn()}
        onDescriptionChange={vi.fn()}
        onAgentContextChange={vi.fn()}
        discardConfirmationOpen={false}
        onKeepEditing={vi.fn()}
        onDiscardChanges={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    )
  })
  expect(document.body.querySelector('[data-testid="delete-device-patient-data"]')).toBeNull()
  expect(document.body.textContent).not.toContain('Delete local copies')

  await act(async () => {
    root?.render(
      <ProjectFormDialog
        open
        title="Project Settings"
        description="Edit this project."
        submitLabel="Save"
        nameDraft="Cohort"
        descriptionDraft=""
        agentContextDraft=""
        isSubmitting={false}
        error={undefined}
        projectId="project-1"
        onNameChange={vi.fn()}
        onDescriptionChange={vi.fn()}
        onAgentContextChange={vi.fn()}
        discardConfirmationOpen={false}
        onKeepEditing={vi.fn()}
        onDiscardChanges={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    )
  })
  expect(
    document.body.querySelector('[data-testid="delete-device-patient-data"]')?.textContent
  ).toContain('Delete patient data on this device')

  const source = [
    readFileSync('src/renderer/src/pages/home/DeleteDevicePatientData.tsx', 'utf8'),
    readFileSync('src/main/projects/device-patient-data.ts', 'utf8'),
    readFileSync('src/renderer/src/pages/home/home-primary-entries.ts', 'utf8')
  ].join('\n')
  expect(source).not.toMatch(/\bDRA\b/)
  expect(source).not.toContain('deleteProject')
  expect(source).not.toMatch(ERASURE_CLAIM)
})
