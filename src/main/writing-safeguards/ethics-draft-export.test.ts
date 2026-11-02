import { configureTestElectronHost } from '../../../test/runtime-host'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { disposeIpcHandlerRegistry } from '../ipc-handler-registry'
import { createWritingSafeguardsCommandOwner } from './application-commands'
import { createEthicsApprovalStore } from './ethics-store'
import { registerWritingSafeguardsIpc } from './ipc'

// #132: the download button calls `writingSafeguards:export-ethics-draft`. Before this test the
// only proof the channel existed was the registrar call; a missing handler and a thrown handler
// looked identical to the doctor, so the wiring is now pinned from the channel name down to the
// owner's return value.
const native = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
}))
vi.mock('electron', async () => {
  const { EventEmitter: Emitter } = await import('node:events')
  return {
    ipcMain: Object.assign(new Emitter(), {
      handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
        native.handlers.set(channel, handler)
      },
      removeHandler: (channel: string) => native.handlers.delete(channel)
    })
  }
})

const workspace = (): {
  store: ReturnType<typeof createEthicsApprovalStore>
  owner: ReturnType<typeof createWritingSafeguardsCommandOwner>
} => {
  const root = mkdtempSync(join(tmpdir(), 'ethics-draft-export-'))
  const store = createEthicsApprovalStore(join(root, 'state.json'))
  return { store, owner: createWritingSafeguardsCommandOwner(store, join(root, 'protocols')) }
}

describe('ethics draft export (#132)', () => {
  it('names the refusal instead of rejecting when the draft carries patient information', async () => {
    const { store, owner } = workspace()
    // A study period is ordinary protocol prose and the PHI detector reads its dates as DATE
    // spans, so this is the shape the incident report came from: a real draft that cannot export.
    store.setProtocol('study-1', {
      ...store.getProtocol('study-1'),
      sectionTexts: {
        1: '合成データを用いた架空の研究計画',
        4: '研究期間は 2026年4月1日 から 2027年3月31日 まで。'
      }
    })

    const result = await owner.exportEthicsDraft({ projectId: 'study-1' })

    expect(result).toEqual({
      ok: false,
      code: 'ethics-draft-blocked-phi',
      fileName: '研究計画書_草案.docx'
    })
    // The refusal says that something was treated as patient information; it never repeats it.
    expect(JSON.stringify(result)).not.toContain('2026')
    expect(JSON.stringify(result)).not.toContain('研究期間')
  })

  it('exports a real DOCX that keeps the Japanese draft text and the unapproved marker', async () => {
    const { store, owner } = workspace()
    store.setProtocol('study-1', {
      ...store.getProtocol('study-1'),
      sectionTexts: {
        1: '合成データのみを用いた架空の研究計画',
        2: '未承認のため実データは使用しない'
      }
    })

    const result = await owner.exportEthicsDraft({ projectId: 'study-1' })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.fileName).toBe('研究計画書_草案.docx')
    // Opening the bytes is what the doctor does next; unzipping proves the package is a readable
    // DOCX rather than a byte array of the right length.
    const parts = unzipSync(Uint8Array.from(result.bytes))
    expect(strFromU8(parts['word/document.xml'])).toContain('合成データのみを用いた架空の研究計画')
    expect(strFromU8(parts['word/document.xml'])).toContain('未承認のため実データは使用しない')
    expect(strFromU8(parts['word/header1.xml'])).toContain('草案・未完成')
    expect(strFromU8(parts['docProps/custom.xml'])).toContain('草案・未完成')
  })

  it('reports a missing project as a code rather than throwing', async () => {
    const { owner } = workspace()

    await expect(owner.exportEthicsDraft({ projectId: '  ' })).resolves.toEqual({
      ok: false,
      code: 'ethics-draft-project-missing',
      fileName: '研究計画書_草案.docx'
    })
  })

  it('reaches the owner from the channel the download button calls', async () => {
    const exportEthicsDraft = vi.fn(async () => ({
      ok: true as const,
      fileName: '研究計画書_草案.docx',
      bytes: [1, 2, 3]
    }))
    const owner = {
      getEthicsApproval: vi.fn(),
      setEthicsApproval: vi.fn(),
      getEthicsProtocol: vi.fn(),
      setEthicsProtocol: vi.fn(),
      importEthicsDocx: vi.fn(),
      exportEthicsDraft
    } as unknown as Parameters<typeof registerWritingSafeguardsIpc>[0]

    registerWritingSafeguardsIpc(owner)
    const handler = native.handlers.get('writing-safeguards:export-ethics-draft')
    expect(handler).toBeTypeOf('function')

    await expect(handler?.({}, { projectId: 'study-1' })).resolves.toEqual({
      ok: true,
      fileName: '研究計画書_草案.docx',
      bytes: [1, 2, 3]
    })
    expect(exportEthicsDraft).toHaveBeenCalledWith({ projectId: 'study-1' })
  })
})

afterAll(() => {
  disposeIpcHandlerRegistry()
  native.handlers.clear()
})

await configureTestElectronHost(await import('electron'))
