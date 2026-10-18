import { detectPhi, type PhiSpan } from '../phi/detect'
import { createDraftDocx } from './docx-export'
import type { R8ItemNumber } from '../../shared/ethics-protocol/r8-items'

export class EthicsExportPhiError extends Error {
  constructor(
    message: string,
    readonly spans: readonly PhiSpan[] = []
  ) {
    super(message)
    this.name = 'EthicsExportPhiError'
  }
}

type Scan = (text: string) => PhiSpan[] | Promise<PhiSpan[]>
type DraftRequest = {
  sections: { item: R8ItemNumber; text: string }[]
  missingItems: R8ItemNumber[]
  phiTexts?: string[]
  outputPath?: string
}

export const assertEthicsExportPhiSafe = async (
  texts: readonly string[],
  options: { scan?: Scan; timeoutMs?: number } = {}
): Promise<void> => {
  const scan = options.scan ?? detectPhi
  const timeoutMs = options.timeoutMs ?? 5_000
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const spans = await Promise.race([
      Promise.all(texts.map((text) => Promise.resolve(scan(text)))).then((groups) => groups.flat()),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('PHI scan timed out')), timeoutMs)
      })
    ])
    if (spans.length > 0)
      throw new EthicsExportPhiError('PHI detected. The draft was not exported.', spans)
  } catch (error) {
    if (error instanceof EthicsExportPhiError) throw error
    throw new EthicsExportPhiError('PHI gate failed closed. The draft was not exported.')
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export const exportDraftAfterPhiCheck = async (
  request: DraftRequest,
  options: { scan?: Scan; timeoutMs?: number } = {}
): Promise<Uint8Array> => {
  await assertEthicsExportPhiSafe(
    [...request.sections.map(({ text }) => text), ...(request.phiTexts ?? [])],
    options
  )
  return createDraftDocx(request)
}
