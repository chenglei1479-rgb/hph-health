import { readFileSync } from 'node:fs'

import { unzipSync, strFromU8 } from 'fflate'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it, vi } from 'vitest'

import {
  BETA_FORBIDDEN_STATISTICIAN_EXPORTS,
  BETA_STATISTICIAN_EXPORT_KINDS,
  type StatisticianReviewExportRequest
} from '../../shared/statistician-review-export'
import type { PhiPreview } from '../phi/confirm'
import { deidentify } from '../phi/deidentify'
import { createMemoryPhiVault } from '../phi/store'
import { exportStatisticianReviewPackage } from './export'
import { remainingExportFindings } from './redact'

const confirm = async (): Promise<{ confirmed: true }> => ({ confirmed: true })

const aggregate = (): StatisticianReviewExportRequest => ({
  projectId: 'consultation-pack',
  statisticalReport: {
    format: 'docx',
    title: '統計報告',
    body: 'Mean difference 1.4. 研究期間：2020-01-01 to 2024-12-31.'
  },
  resultTables: {
    sheets: [
      {
        name: 'results',
        columns: ['group', 'n', 'mean'],
        rows: [
          ['treatment', 7, 12.4],
          ['control', 9, 11.1]
        ]
      }
    ]
  },
  analysisScript: {
    language: 'r',
    source: 'mean_diff <- 1.4\nn_treatment <- 7\n'
  },
  variableDefinition: {
    rows: [{ name: 'age', definition: 'Age in years', type: 'number', coding: 'years' }]
  },
  executionLog: { text: 'R 4.4.1\nmean_diff = 1.4\n研究期間：2020-01-01' }
})

describe('statistician review beta export', () => {
  it('reuses the shared de-identification module and review page', () => {
    const redact = readFileSync(new URL('./redact.ts', import.meta.url), 'utf8')
    const review = readFileSync(new URL('./confirm-window.ts', import.meta.url), 'utf8')
    expect(redact).toContain("from '../phi/deidentify'")
    expect(redact).toContain('detectPhi')
    expect(review).toContain('buildConfirmInstaller')
    expect(BETA_STATISTICIAN_EXPORT_KINDS).toEqual([
      'statistical-report',
      'result-tables',
      'analysis-script',
      'variable-definition',
      'execution-log'
    ])
    expect(BETA_FORBIDDEN_STATISTICIAN_EXPORTS).toEqual([
      'raw-data',
      'notebook-individual-rows',
      'chat-history'
    ])
    const skill = readFileSync(
      new URL('../../../resources/skills/research-deliverables/SKILL.md', import.meta.url),
      'utf8'
    )
    expect(skill).toContain('Do not export raw data')
    expect(skill).toContain('no masking under 10')
  })

  it('writes only aggregate files that open without DRA and keeps real counts under 10', async () => {
    const seen = vi.fn(confirm)
    const result = await exportStatisticianReviewPackage(aggregate(), { confirm: seen })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.files.map((file) => file.filename)).toEqual([
      'statistical-report.docx',
      'result-tables.xlsx',
      'analysis.R',
      'variable-definition.pdf',
      'execution-log.pdf'
    ])
    expect(result.files.some((file) => /\.(csv|tsv|ipynb|html)$/i.test(file.filename))).toBe(false)
    expect(seen).toHaveBeenCalledOnce()
    const report = strFromU8(
      unzipSync(Buffer.from(result.files[0].base64, 'base64'))['word/document.xml']
    )
    expect(report).toContain('統計報告')
    expect(report).toContain('2020-01-01')
    const sheet = strFromU8(
      unzipSync(Buffer.from(result.files[1].base64, 'base64'))['xl/worksheets/sheet1.xml']
    )
    expect(sheet).toContain('<v>7</v>')
    expect(sheet).toContain('<v>9</v>')
    expect(sheet).toContain('<v>12.4</v>')
    expect(sheet).not.toContain('&lt;10')
    expect(sheet).not.toContain('<10')
    const script = Buffer.from(result.files[2].base64, 'base64').toString('utf8')
    expect(script).toContain('mean_diff <- 1.4')
    expect(script).toContain('n_treatment <- 7')
    expect(result.files[3].text).toContain('age')
    expect(result.files[4].text).toContain('2020-01-01')
  })

  it('refuses raw data, notebook rows, chat history, and small-cell masks before confirmation', async () => {
    const seen = vi.fn(confirm)
    const base = aggregate()
    expect(
      (
        await exportStatisticianReviewPackage(
          { ...base, rawData: 'karte,hba1c' },
          { confirm: seen }
        )
      ).ok
    ).toBe(false)
    expect(
      (
        await exportStatisticianReviewPackage(
          { ...base, notebookOutput: 'cell output' },
          { confirm: seen }
        )
      ).ok
    ).toBe(false)
    expect(
      (await exportStatisticianReviewPackage({ ...base, chatHistory: 'hello' }, { confirm: seen }))
        .ok
    ).toBe(false)
    const masked = aggregate()
    masked.resultTables.sheets[0].rows[0][1] = '<10'
    const mask = await exportStatisticianReviewPackage(masked, { confirm: seen })
    expect(mask).toEqual({ ok: false, code: 'small-cell-mask' })
    expect(seen).not.toHaveBeenCalled()
  })

  it('removes chart numbers, birth dates, and individual values, then requires doctor confirmation', async () => {
    const direct = deidentify('カルテ番号：0083341', createMemoryPhiVault().store('same-karte'))
    let preview = ''
    const result = await exportStatisticianReviewPackage(
      {
        ...aggregate(),
        statisticalReport: {
          format: 'docx',
          title: '統計報告',
          body: '患者0083341のHbA1cは7.2。研究期間：2020-01-01。'
        },
        analysisScript: {
          language: 'python',
          source:
            'karte_no = "0083341"\nbirth_date = "1952-04-03"\npatients = pd.DataFrame(karte="0083341", hba1c=7.2)\nmean_diff = 1.4\n'
        },
        executionLog: { text: 'カルテ番号：0083341\n研究期間：2020-01-01' }
      },
      {
        confirm: async (value: PhiPreview) => {
          preview = value.text
          return { confirmed: true }
        }
      }
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const joined = result.files.map((file) => file.text).join('\n')
    expect(joined).not.toContain('0083341')
    expect(joined).not.toContain('1952-04-03')
    expect(joined).not.toContain('7.2')
    expect(joined).toContain('2020-01-01')
    expect(joined).toContain('mean_diff = 1.4')
    expect(preview).not.toContain('0083341')
    expect(preview).toContain('[番号')
    expect(direct.text).toContain('[番号')
    expect(direct.text).not.toContain('0083341')
    expect(result.files[2].filename).toBe('analysis.py')
    expect(remainingExportFindings(joined)).toEqual([])
    const dismissed = await exportStatisticianReviewPackage(aggregate(), {
      confirm: async () => ({ confirmed: false })
    })
    expect(dismissed).toEqual({ ok: false, code: 'not-confirmed' })
    const failed = await exportStatisticianReviewPackage(aggregate(), {
      confirm: async () => {
        throw new Error('closed')
      }
    })
    expect(failed).toEqual({ ok: false, code: 'not-confirmed' })
  })

  it('builds a PDF report the doctor confirmed', async () => {
    const request = aggregate()
    request.statisticalReport.format = 'pdf'
    const result = await exportStatisticianReviewPackage(request, { confirm })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.files[0].filename).toBe('statistical-report.pdf')
    const pdf = await PDFDocument.load(Buffer.from(result.files[0].base64, 'base64'))
    expect(pdf.getPageCount()).toBeGreaterThan(0)
    expect(result.files[0].text).toContain('統計報告')
    expect(result.files[0].text).toContain('2020-01-01')
  })
})
