// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LiteratureExportMenu } from './LiteratureLibraryMenus'

afterEach(cleanup)

it('keeps RIS as the accessible name and exposes the metadata-only hint as its description', async () => {
  const onExport = vi.fn(async () => true)
  render(<LiteratureExportMenu onExport={onExport} />)
  fireEvent.keyDown(screen.getByRole('button', { name: 'Export' }), { key: 'Enter' })
  const item = await screen.findByRole('menuitem', {
    name: 'RIS',
    description:
      'RIS carries metadata only, not attachments. Use a full backup to preserve attachments.'
  })
  const hintId = item.getAttribute('aria-describedby')!
  expect(document.getElementById(hintId)?.textContent).toBe(
    'RIS carries metadata only, not attachments. Use a full backup to preserve attachments.'
  )
  fireEvent.click(item)
  await waitFor(() => expect(onExport).toHaveBeenCalledExactlyOnceWith('ris'))
})
