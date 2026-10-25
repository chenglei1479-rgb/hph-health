import { describe, expect, it } from 'vitest'

import {
  classifyStatisticianExportFailure,
  redactStatisticianExportFailureMessage,
  STATISTICIAN_EXPORT_RESOURCE_CODE,
  STATISTICIAN_EXPORT_WRITE_CODE
} from './statistician-export-diagnostics'

const redact = (error: unknown): string => redactStatisticianExportFailureMessage(error)

describe('statistician export failure diagnostics', () => {
  it('classifies resource-loading failures apart from write failures', () => {
    expect(
      classifyStatisticianExportFailure(
        new Error('ENOENT: no such file or directory, open font.otf')
      )
    ).toBe(STATISTICIAN_EXPORT_RESOURCE_CODE)
    expect(classifyStatisticianExportFailure(new Error("Cannot find module 'fontkit'"))).toBe(
      STATISTICIAN_EXPORT_RESOURCE_CODE
    )
    expect(
      classifyStatisticianExportFailure(
        new Error('ERR_UNKNOWN_FILE_EXTENSION: Unknown file extension ".mjs"')
      )
    ).toBe(STATISTICIAN_EXPORT_RESOURCE_CODE)
    expect(
      classifyStatisticianExportFailure(
        new Error('PDF font loader is unavailable. Nothing was exported.')
      )
    ).toBe(STATISTICIAN_EXPORT_RESOURCE_CODE)
    expect(
      classifyStatisticianExportFailure(new Error('EACCES: permission denied, open report.zip'))
    ).toBe(STATISTICIAN_EXPORT_WRITE_CODE)
    expect(classifyStatisticianExportFailure('the disk is full')).toBe(
      STATISTICIAN_EXPORT_WRITE_CODE
    )
  })

  it('redacts a file:// module URL that carries the Windows home directory', () => {
    const redacted = redact(
      new Error(
        "Cannot find module 'file:///C:/Users/cheng/AppData/Local/app.asar/node_modules/fontkit/dist/module.mjs'"
      )
    )
    expect(redacted).not.toContain('cheng')
    expect(redacted).toContain('<path>')
    expect(redacted).toContain('Cannot find module')
  })

  it('redacts a forward-slash Windows path that Node prints unquoted', () => {
    const redacted = redact(
      new Error(
        'ERR_UNKNOWN_FILE_EXTENSION: Unknown file extension ".mjs" for C:/Users/cheng/app/node_modules/fontkit/dist/module.mjs'
      )
    )
    expect(redacted).not.toContain('cheng')
    expect(redacted).toContain('<path>')
  })

  it('redacts a quoted Windows path whose user name contains a space', () => {
    const redacted = redact(
      new Error(
        "ENOENT: no such file or directory, open 'C:\\Users\\Jane Doe\\resources\\NotoSansSC-Regular.otf'"
      )
    )
    expect(redacted).not.toContain('Jane')
    expect(redacted).not.toContain('Doe')
    expect(redacted).not.toContain('resources')
    expect(redacted).toContain('<path>')
  })

  it('redacts a UNC share path', () => {
    const redacted = redact(
      new Error("ENOENT: no such file or directory, open '\\\\server\\share\\dra\\font.otf'")
    )
    expect(redacted).not.toContain('server')
    expect(redacted).not.toContain('share')
    expect(redacted).toContain('<path>')
  })

  it('redacts the unquoted trailing path in a module-not-found line that contains spaces', () => {
    const redacted = redact(
      new Error(
        "Cannot find module 'C:\\Users\\Jane Doe\\WorkBuddy AI\\hph-health\\missing.mjs' imported from C:\\Users\\Jane Doe\\WorkBuddy AI\\hph-health\\[eval]"
      )
    )
    for (const fragment of ['Jane', 'Doe', 'WorkBuddy', 'hph-health', 'missing.mjs']) {
      expect(redacted).not.toContain(fragment)
    }
    expect(redacted).toContain('imported from <path>')
  })

  it('redacts the unquoted trailing path in an unknown-extension line that contains spaces', () => {
    const redacted = redact(
      new Error(
        'Unknown file extension ".otf" for C:\\Users\\Jane Doe\\WorkBuddy AI\\hph-health\\resources\\NotoSansSC-Regular.otf'
      )
    )
    for (const fragment of ['Jane', 'Doe', 'WorkBuddy', 'hph-health', 'NotoSansSC']) {
      expect(redacted).not.toContain(fragment)
    }
    expect(redacted).toContain('Unknown file extension ".otf"')
  })

  it('redacts a POSIX home path', () => {
    const redacted = redact(new Error('EACCES: permission denied, open /Users/cheng/export.zip'))
    expect(redacted).not.toContain('cheng')
    expect(redacted).toContain('<path>')
  })

  it('keeps relative paths and ordinary prose intact', () => {
    expect(
      redact(
        new Error(
          "ENOENT: no such file or directory, open 'resources/pdf-translation/NotoSansSC-Regular.otf'"
        )
      )
    ).toContain('resources/pdf-translation/NotoSansSC-Regular.otf')
    expect(redact(new Error('src/main/statistician-review/files.ts is missing'))).toBe(
      'Error: src/main/statistician-review/files.ts is missing'
    )
    expect(redact(new Error('The PDF font loader is unavailable. Nothing was exported.'))).toBe(
      'Error: The PDF font loader is unavailable. Nothing was exported.'
    )
    // A quoted relative path or a quoted phrase is not an absolute path and must survive.
    expect(redact(new Error("Cannot open 'path/to/file' for reading"))).toContain("'path/to/file'")
    expect(redact(new Error("The dialog said 'save as' and stopped"))).toContain("'save as'")
  })

  it('does not swallow the sentence that follows a quoted path', () => {
    const redacted = redact(
      new Error("Cannot find module 'C:\\Users\\a\\b.mjs' while reading configuration")
    )
    expect(redacted).toContain('while reading configuration')
    expect(redacted).not.toContain('b.mjs')
  })

  it('collapses whitespace and bounds the message', () => {
    expect(redact('Error:   line one\n\nline two\t')).toBe('Error: line one line two')
    expect(redact('x'.repeat(400))).toHaveLength(300)
  })
})
