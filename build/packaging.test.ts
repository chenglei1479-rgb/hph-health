import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { finished } from 'node:stream/promises'

import { describe, expect, it } from 'vitest'
import { load } from 'js-yaml'

const repoRoot = join(__dirname, '..')
// Exercise the same packaging dependencies as the installed electron-builder.
const require = createRequire(import.meta.url)
const builderRequire = createRequire(require.resolve('electron-builder/package.json'))
const appBuilderLibPath = builderRequire.resolve('app-builder-lib/package.json')
const appBuilderLibRoot = dirname(appBuilderLibPath)
const appBuilderRequire = createRequire(appBuilderLibPath)
const { createPackageWithOptions, listPackage } = appBuilderRequire('@electron/asar')

// Use an existing electron-builder NSIS cache; tests must not download a compiler.
function findNsisCompiler(): string | undefined {
  if (process.platform !== 'win32') return undefined
  if (process.env.NSIS_TEST_COMPILER) return process.env.NSIS_TEST_COMPILER
  const cache =
    process.env.ELECTRON_BUILDER_CACHE ??
    join(process.env.LOCALAPPDATA ?? '', 'electron-builder', 'Cache')
  if (!existsSync(cache)) return undefined
  for (const entry of readdirSync(cache, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('nsis')) continue
    const directory = join(cache, entry.name)
    const direct = join(directory, 'makensis.exe')
    if (existsSync(direct)) return direct
    for (const child of readdirSync(directory, { withFileTypes: true })) {
      const compiler = join(directory, child.name, 'makensis.exe')
      if (child.isDirectory() && existsSync(compiler)) return compiler
    }
  }
  return undefined
}

const nsisCompiler = findNsisCompiler()

// The preflight calls the nsProcess plugin (the same one electron-builder uses for the app-running
// checks) and includes its macro file from electron-builder's template directory. Probes that stub the
// lookup still parse the include, so the directory is always passed; only the real lookup needs the
// plugin directory at compile time.
const appBuilderIncludeDir = join(appBuilderLibRoot, 'templates/nsis/include')

function findNsisPluginsDir(): string | undefined {
  if (process.platform !== 'win32') return undefined
  const cache =
    process.env.ELECTRON_BUILDER_CACHE ??
    join(process.env.LOCALAPPDATA ?? '', 'electron-builder', 'Cache')
  if (!existsSync(cache)) return undefined
  for (const entry of readdirSync(cache, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('nsis-resources')) continue
    const root = join(cache, entry.name)
    for (const child of readdirSync(root, { withFileTypes: true })) {
      if (!child.isDirectory()) continue
      const plugins = join(root, child.name, 'plugins', 'x86-unicode')
      if (existsSync(join(plugins, 'nsProcess.dll'))) return plugins
    }
  }
  return undefined
}

const nsisPluginsDir = findNsisPluginsDir()

it('packages the single R8 fallback DOCX template', () => {
  const config = load(readFileSync(join(repoRoot, 'electron-builder.yml'), 'utf8')) as {
    extraResources: Array<{ from: string; to: string }>
  }
  expect(config.extraResources.filter(({ to }) => /\.(?:docx|dotx|doc)$/u.test(to))).toEqual([
    { from: 'build/ethics-protocol-fallback.docx', to: 'ethics-protocol-fallback.docx' }
  ])
  expect(
    readFileSync(join(repoRoot, 'build/ethics-protocol-fallback.docx')).length
  ).toBeGreaterThan(500)
})

describe.skipIf(!nsisCompiler).each(['MedResearchAgent', 'MedResearch-Agent'])(
  'NSIS data preservation native behavior (%s)',
  (folder) => {
    it.each([
      'missing-parent',
      'missing-install',
      'existing-data',
      'interrupted-backup',
      'backup-conflict',
      'backup-file',
      'invalid-parent'
    ])('protects data during reinstall with %s', (scenario) => {
      const root = mkdtempSync(join(tmpdir(), 'nsis-preservation-'))
      const parent = join(
        root,
        scenario === 'invalid-parent' ? 'invalid?parent' : 'Open Science 科学'
      )
      try {
        const install = join(parent, 'open-science')
        const data = join(install, folder)
        const slot = folder === 'MedResearchAgent' ? 'per-user' : 'per-user-branded'
        const backup = join(parent, `.medresearch-agent-update-data-${slot}`)
        const conflict = scenario === 'backup-conflict' || scenario === 'backup-file'
        if (scenario !== 'missing-parent' && scenario !== 'invalid-parent') mkdirSync(parent)
        if (scenario === 'existing-data' || conflict) {
          mkdirSync(data, { recursive: true })
          writeFileSync(join(data, 'sentinel.txt'), 'existing user data')
        }
        if (scenario === 'interrupted-backup' || scenario === 'backup-conflict') {
          mkdirSync(backup)
          writeFileSync(join(backup, 'sentinel.txt'), 'preserved user data')
        }
        if (scenario === 'backup-file') writeFileSync(backup, 'unrelated file')
        const include = readFileSync(join(repoRoot, 'build/installer.nsh'), 'utf8')
        const macro = include.match(
          /!macro preserveNamedDataRoot DIR BACKUP SLOT FOLDER[\s\S]*?!macroend/
        )?.[0]
        expect(macro).toBeDefined()
        const restore = include.match(
          /!macro restoreNamedDataRoot DIR BACKUP FOLDER[\s\S]*?!macroend/
        )?.[0]
        expect(restore).toBeDefined()
        // Execute the production macro with real NSIS filesystem operations. Redirect only
        // UI output to a file so an error dialog cannot block unattended regression runs.
        const observed = `${macro}\n${restore}`
          .replace(/^\s*DetailPrint (.+)$/gm, 'FileWriteUTF16LE $9 $1')
          .replace(/^\s*MessageBox MB_OK\|MB_ICONSTOP (.+)$/gm, 'FileWriteUTF16LE $9 $1')
        const output = join(root, 'result.txt')
        const executable = join(root, 'probe.exe')
        const source = join(root, 'probe.nsi')
        writeFileSync(
          source,
          `\uFEFFUnicode true
!include "LogicLib.nsh"
!addincludedir "${appBuilderIncludeDir}"
Name "Isolated data preservation regression"
OutFile "${executable}"
RequestExecutionLevel user
SilentInstall silent
Var backup
Var dataProtectionFailed
Var dataRestoreFailed
Var retryLegacyDataBackup
Var retryBrandedDataBackup
!define UNINSTALL_FILENAME "Uninstall Baselio.exe"
LangString uninstallFailed 1033 "Uninstall failed"
${readFileSync(join(repoRoot, 'build/installer-strings.nsh'), 'utf8').replace(/^\uFEFF/, '')}
${observed}
Section
FileOpen $9 "${output}" w
StrCpy $dataProtectionFailed "0"
StrCpy $dataRestoreFailed "0"
!insertmacro preserveNamedDataRoot "${install}" $backup ${slot} ${folder}
FileWriteUTF16LE $9 "|failed=$dataProtectionFailed|backup=$backup"
!insertmacro restoreNamedDataRoot "${install}" $backup ${folder}
FileWriteUTF16LE $9 "|restoreFailed=$dataRestoreFailed"
FileClose $9
SetErrorLevel 0
SectionEnd
`
        )
        const compile = spawnSync(nsisCompiler!, ['/V2', source], {
          encoding: 'utf8',
          timeout: 15_000
        })
        expect(compile.error).toBeUndefined()
        expect(compile.status, compile.stderr || compile.stdout).toBe(0)
        const run = spawnSync(executable, [], { encoding: 'utf8', timeout: 15_000 })
        expect(run.error).toBeUndefined()
        expect(run.status, run.stderr).toBe(0)
        const result = readFileSync(output, 'utf16le')
        expect(result, result).toContain(
          `|failed=${conflict || scenario === 'invalid-parent' ? '1' : '0'}`
        )
        expect(result, result).toContain('|restoreFailed=0')
        if (scenario === 'existing-data' || scenario === 'interrupted-backup') {
          expect(result).toContain(`|backup=${backup}`)
          expect(readFileSync(join(data, 'sentinel.txt'), 'utf8')).toBe(
            scenario === 'existing-data' ? 'existing user data' : 'preserved user data'
          )
          expect(existsSync(backup)).toBe(false)
        } else if (scenario === 'invalid-parent') {
          expect(result).toContain('code=parent-path-unresolved')
        } else if (conflict) {
          expect(readFileSync(join(data, 'sentinel.txt'), 'utf8')).toBe('existing user data')
          expect(
            readFileSync(scenario === 'backup-file' ? backup : join(backup, 'sentinel.txt'), 'utf8')
          ).toBe(scenario === 'backup-file' ? 'unrelated file' : 'preserved user data')
        } else {
          expect(existsSync(parent)).toBe(scenario !== 'missing-parent')
          expect(existsSync(data)).toBe(false)
        }
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })
  }
)

describe('packaging config', () => {
  it('loads both tiktoken WASM encodings from a packed ASAR in Electron', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'tiktoken-asar-')))
    try {
      const source = join(root, 'source')
      const archive = join(root, 'app.asar')
      mkdirSync(source)
      cpSync(dirname(require.resolve('tiktoken')), join(source, 'node_modules', 'tiktoken'), {
        recursive: true
      })
      writeFileSync(
        join(source, 'probe.cjs'),
        `const { get_encoding } = require('tiktoken')
const counts = {}
for (const profile of ['cl100k_base', 'o200k_base']) {
  const encoding = get_encoding(profile)
  try {
    counts[profile] = encoding.encode('x'.repeat(1024)).length
  } finally {
    encoding.free()
  }
}
process.stdout.write(JSON.stringify({ counts, modulePath: require.resolve('tiktoken') }))
`
      )
      // ASAR resolves with a writable stream before its queued writes finish.
      const archiveStream = await createPackageWithOptions(source, archive, {})
      await finished(archiveStream)
      expect(listPackage(archive).map((entry: string) => entry.replaceAll('\\', '/'))).toContain(
        '/node_modules/tiktoken/tiktoken_bg.wasm'
      )
      // Remove the source tree so the child can only load the archived JavaScript and WASM.
      rmSync(source, { recursive: true, force: true })
      const result = spawnSync(require('electron') as string, [join(archive, 'probe.cjs')], {
        cwd: root,
        encoding: 'utf8',
        timeout: 10_000,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_PATH: '' }
      })
      expect(result.error).toBeUndefined()
      expect(result.status, result.stderr).toBe(0)
      expect(JSON.parse(result.stdout)).toEqual({
        // A byte-length fallback would return 256; both real encodings return 128.
        counts: { cl100k_base: 128, o200k_base: 128 },
        modulePath: join(archive, 'node_modules', 'tiktoken', 'tiktoken.cjs')
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it.each(['module', 'commonjs', undefined])(
    'runs unpacked notebook scripts beneath an ancestor package with type %s',
    async (type) => {
      const root = mkdtempSync(join(tmpdir(), 'notebook-package-scope-'))
      try {
        writeFileSync(join(root, 'package.json'), JSON.stringify({ type }))
        const source = join(root, 'source')
        const resources = join(root, 'installed', 'resources')
        mkdirSync(source)
        mkdirSync(resources, { recursive: true })
        // The app manifest stays inside app.asar, outside the unpacked scripts' ancestor chain.
        writeFileSync(join(source, 'package.json'), '{"type":"commonjs"}')
        cpSync(join(repoRoot, 'resources/notebook'), join(source, 'resources/notebook'), {
          recursive: true
        })
        await createPackageWithOptions(source, join(resources, 'app.asar'), {
          unpackDir: 'resources'
        })
        const notebook = join(resources, 'app.asar.unpacked', 'resources', 'notebook')
        const run = (script: string, args: string[] = [], input = ''): SpawnSyncReturns<string> =>
          spawnSync(process.execPath, [join(notebook, script), ...args], {
            cwd: root,
            input,
            encoding: 'utf8',
            timeout: 10_000,
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
          })

        const repl = run('repl_loop.js', [], '{"req_id":"scope","code":"return 6 * 7"}\n')
        expect(repl.stderr).toBe('')
        expect(repl.status).toBe(0)
        expect(JSON.parse(repl.stdout)).toMatchObject({
          req_id: 'scope',
          error: null,
          result: '42'
        })

        const receiptId = 'scope-test'
        const pending = join(root, `kernel.pending.${receiptId}.json`)
        writeFileSync(pending, JSON.stringify({ receiptId }))
        const host = run('kernel_process_host.js', [
          pending,
          receiptId,
          process.execPath,
          '-e',
          'process.stdout.write("started")'
        ])
        expect(host.stderr).toBe('')
        expect(host.status).toBe(0)
        expect(host.stdout).toBe('started')

        // Reach the real worker's protocol validation without creating evidence or requiring Git.
        const worker = run('file_evidence_worker.js', [], '{"operation":"invalid"}')
        expect(worker.stderr).toBe('')
        expect(worker.status).toBe(1)
        expect(JSON.parse(worker.stdout)).toEqual({
          ok: false,
          error: 'Unsupported file-evidence worker operation.'
        })
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    }
  )

  it('keeps the macOS internal bundle name aligned with generated Helper names', () => {
    const yml = readFileSync(join(repoRoot, 'electron-builder.yml'), 'utf8')
    const productName = yml.match(/^productName: (.+)$/m)?.[1]
    const bundleName = yml.match(/^ {4}CFBundleName: (.+)$/m)?.[1]
    // Electron resolves its Helper using CFBundleName; electron-builder names it from productName.
    // Finder branding belongs in CFBundleDisplayName and dmg.contents.name instead.
    expect(productName).toBeTruthy()
    expect(bundleName).toBe(productName)
  })

  it('ships the exec-loop scripts unpacked from the asar', () => {
    // The notebook driver resolves <process.resourcesPath>/notebook/python_loop.py and
    // .../r_loop.R in the packaged app, so both must exist in the repo AND asarUnpack must cover
    // them (electron-builder only unpacks matched globs).
    expect(existsSync(join(repoRoot, 'resources/notebook/python_loop.py'))).toBe(true)
    expect(existsSync(join(repoRoot, 'resources/notebook/r_loop.R'))).toBe(true)
    expect(existsSync(join(repoRoot, 'resources/notebook/kernel_process_host.js'))).toBe(true)
    expect(existsSync(join(repoRoot, 'resources/notebook/file_evidence_worker.js'))).toBe(true)
    const yml = readFileSync(join(repoRoot, 'electron-builder.yml'), 'utf8')
    const { asarUnpack } = load(yml) as { asarUnpack: string[] }
    expect(
      asarUnpack.some((pattern) => ['resources/**', 'resources/notebook/**'].includes(pattern))
    ).toBe(true)
  })

  it('ships the versioned Specialist contribution template guidance unpacked from the asar', () => {
    expect(existsSync(join(repoRoot, 'resources/specialists/template/v1/README.txt'))).toBe(true)
    const yml = readFileSync(join(repoRoot, 'electron-builder.yml'), 'utf8')
    expect((load(yml) as { asarUnpack: string[] }).asarUnpack).toContain('resources/**')
  })

  it('ships micromamba as a per-platform extraResource to Contents/Resources', () => {
    const yml = readFileSync(join(repoRoot, 'electron-builder.yml'), 'utf8')
    // Staged per-platform binaries copied to the resources root under the name micromamba(.exe).
    expect(yml).toContain('resources/bin/mac/${arch}/micromamba')
    expect(yml).toContain('resources/bin/win/${arch}/micromamba.exe')
    expect(yml).toContain('resources/bin/linux/${arch}/micromamba')
    expect(yml).toContain('to: micromamba')
  })

  it('ships the independently pinned compatibility runner only on Windows', () => {
    const yml = readFileSync(join(repoRoot, 'electron-builder.yml'), 'utf8')
    expect(yml).toContain('resources/bin/win/${arch}/micromamba-compat.exe')
    expect(yml).toContain('to: micromamba-compat.exe')
    expect(yml).not.toContain('resources/bin/mac/${arch}/micromamba-compat')
    expect(yml).not.toContain('resources/bin/linux/${arch}/micromamba-compat')
  })

  it('macOS entitlements disable library validation for conda dylibs', () => {
    const plist = readFileSync(join(repoRoot, 'build/entitlements.mac.plist'), 'utf8')
    expect(plist).toContain('com.apple.security.cs.disable-library-validation')
    expect(plist).toContain('com.apple.security.cs.allow-dyld-environment-variables')
    expect(plist).toContain('com.apple.security.cs.allow-jit')
    expect(plist).toContain('com.apple.security.cs.allow-unsigned-executable-memory')
  })

  it('the ad-hoc signer signs the bundled micromamba binary', () => {
    const hook = readFileSync(join(repoRoot, 'build/adhoc-sign.cjs'), 'utf8')
    expect(hook).toContain('micromamba')
  })
})

describe('NSIS installer include (build/installer.nsh)', () => {
  const include = readFileSync(join(repoRoot, 'build/installer.nsh'), 'utf8')

  it('overrides the failed-uninstall handling for both registry passes', () => {
    // electron-builder's handleUninstallResult turns ANY non-zero old-uninstaller exit code into
    // a fatal "Failed to uninstall old application files" dialog. The assisted installer
    // (oneClick: false) gets no exit-code normalization (quitSuccess is ONE_CLICK-only), so the
    // code is not trustworthy — the include must install the resilient handler for both the
    // SHELL_CONTEXT and the HKEY_CURRENT_USER passes.
    expect(include).toMatch(/!macro customUnInstallCheck\b/)
    expect(include).toMatch(/!macro customUnInstallCheckCurrentUser\b/)
  })

  it('hands the first failed old-uninstaller attempt to project recovery without a misleading close-app dialog', () => {
    // installUtil runs before customUnInstallCheck. If it loops internally, users see
    // appCannotBeClosed after five non-zero exits even though that same exit may mean a stale or
    // partially removed first-install registration. Return the first failure to the path-scoped
    // recovery in this include instead of blaming a process that may not exist.
    const installUtil = readFileSync(
      join(appBuilderLibRoot, 'templates/nsis/include/installUtil.nsh'),
      'utf8'
    )
    const uninstallOldVersion =
      installUtil.match(/Function uninstallOldVersion([\s\S]*?)FunctionEnd/)?.[1] ?? ''
    const checkResult = uninstallOldVersion.slice(uninstallOldVersion.indexOf('CheckResult:'))

    expect(uninstallOldVersion).not.toContain('$(appCannotBeClosed)')
    expect(checkResult).toMatch(/CheckResult:[\s\S]*?Return\s+DoesNotExist:/)
    expect(checkResult).not.toContain('Goto UninstallLoop')
  })

  it('continues the install when the old version is already gone despite a non-zero exit code', () => {
    // The spurious-exit-2 case: the uninstall completed but a benign trailing error leaked as the
    // process exit code. Detect it by the old executable no longer existing and keep installing.
    // The sentinel is parameterized on the pass's own install dir ($INSTDIR for SHELL_CONTEXT,
    // the registry-read per-user dir for HKEY_CURRENT_USER).
    expect(include).toContain('${FileExists} "${DIR}\\${APP_EXECUTABLE_FILENAME}"')
  })

  it('force-kills install-dir processes and retries the old uninstaller once before failing', () => {
    // The real-lock case: a background child running from the install dir (micromamba
    // provisioning, the CLI in Node mode, an agent child) still holds files. Sweep by executable
    // path (Win32_Process has ExecutablePath, NOT Path) and by image name (taskkill fallback),
    // then retry once; only a repeated failure keeps the original fatal dialog + exit code 2.
    expect(include).toContain('$$_.ExecutablePath')
    expect(include).not.toContain('$$_.Path.')
    expect(include).toContain('taskkill /F /IM "${APP_EXECUTABLE_FILENAME}"')
    expect(readFileSync(join(repoRoot, 'build/installer-strings.nsh'), 'utf8')).toContain(
      '$(uninstallFailed): $R0'
    )
    expect(include).toContain('SetErrorLevel 2')
  })

  it('runs the image-name taskkill only as a fallback when the PowerShell sweep cannot run', () => {
    // taskkill /IM matches the exe name in ANY directory — a second install or the portable zip
    // copy would be killed too, discarding unsaved work. It must fire only when the path-scoped
    // PowerShell sweep failed to run (nsExec pushes "error" or a non-zero exit code). micromamba
    // and the Notebook AppContainer host are included: their image names differ from the app exe,
    // so the app-exe kill alone cannot cover an in-flight provisioning or sandbox-host lock on
    // PowerShell-blocked machines.
    const code = include
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n')
    expect(code.match(/taskkill/g) ?? []).toHaveLength(3)
    // Capture the whole guard block and assert BOTH kills live inside it — asserting only the
    // first one's position would still pass with micromamba's taskkill moved outside the guard.
    const guardBlock = code.match(/\$\{if\} \$R1 != 0([\s\S]*?)\$\{endif\}/)?.[1] ?? ''
    expect(guardBlock).toContain('taskkill /F /IM "${APP_EXECUTABLE_FILENAME}"')
    expect(guardBlock).toContain('taskkill /F /IM micromamba.exe')
    expect(guardBlock).toContain('taskkill /F /IM "notebook-appcontainer-host.exe"')
    expect(guardBlock.match(/taskkill/g) ?? []).toHaveLength(3)
  })

  it('retries the old uninstaller exactly once', () => {
    // A single follow-up attempt after the kill; the original ExecWait lives in
    // electron-builder's uninstallOldVersion, so exactly one may appear here. Assert the
    // invocation's semantic parts rather than the full literal line, so a benign reformat
    // (flag reorder, whitespace) does not break the test without a behavior change.
    const attempts = include.match(/ExecWait '"\$PLUGINSDIR\\old-uninstaller\.exe/g) ?? []
    expect(attempts).toHaveLength(1)
    expect(include).toContain('/S /KEEP_APP_DATA $0')
    expect(include).toContain('_?=${DIR}')
  })

  it('runs the retry with TEMP and TMP on the old installation volume', () => {
    // electron-builder's updated uninstall atomically moves the old installation into the
    // uninstaller's $PLUGINSDIR. A custom D: install with the ordinary C: TEMP turns that into a
    // cross-volume move/copy — including a nested MedResearchAgent data root — and can abort with exit
    // code 2. The recovery attempt must give the child uninstaller a same-volume plugin directory,
    // then restore this installer's environment after ExecWait returns.
    const recovery =
      include.match(/!macro uninstallFailureRecoveryAt DIR([\s\S]*?)!macroend/)?.[1] ?? ''
    const retryAt = recovery.indexOf('ExecWait')

    expect(recovery).toContain('GetFullPathName $R2 "${DIR}\\.."')
    expect(recovery).toContain('GetTempFileName $R5 "$R2"')
    expect(recovery).toMatch(/SetEnvironmentVariable\(t, t\)i \("TEMP", "\$R5"\)/)
    expect(recovery).toMatch(/SetEnvironmentVariable\(t, t\)i \("TMP", "\$R5"\)/)
    expect(recovery.indexOf('("TEMP", "$R5")')).toBeLessThan(retryAt)
    expect(recovery.indexOf('("TMP", "$R5")')).toBeLessThan(retryAt)
    expect(recovery.lastIndexOf('("TEMP", "$R3")')).toBeGreaterThan(retryAt)
    expect(recovery.lastIndexOf('("TMP", "$R4")')).toBeGreaterThan(retryAt)
  })

  it('preserves a nested MedResearchAgent data root around the uninstall retry', () => {
    // The reporter's configured data root is <install dir>\MedResearchAgent. An updated NSIS
    // uninstaller moves every child of the install directory into its disposable $PLUGINSDIR, so
    // a successful retry must first move that data root to a separate sibling and restore it
    // before the new installer continues.
    const preserve =
      include.match(/!macro preserveRetryDataRoot DIR BACKUP FOLDER([\s\S]*?)!macroend/)?.[1] ?? ''
    const restore =
      include.match(
        /!macro restoreRetryDataRoot DIR BACKUP REGISTERED_BACKUP FOLDER([\s\S]*?)!macroend/
      )?.[1] ?? ''
    const recovery = (
      include.match(/!macro uninstallFailureRecoveryAt DIR([\s\S]*?)!macroend/)?.[1] ?? ''
    )
      .replace(
        '!insertmacro preserveRetryDataRoot ${DIR} $retryLegacyDataBackup MedResearchAgent',
        preserve.replaceAll('${BACKUP}', '$R7').replaceAll('${FOLDER}', 'MedResearchAgent')
      )
      .replace(
        '!insertmacro restoreRetryDataRoot ${DIR} $retryLegacyDataBackup ${REGISTERED_BACKUP} MedResearchAgent',
        restore.replaceAll('${BACKUP}', '$R7').replaceAll('${FOLDER}', 'MedResearchAgent')
      )
    const preserveAt = recovery.indexOf('Rename "${DIR}\\MedResearchAgent" "$R7"')
    const retryAt = recovery.indexOf('ExecWait')
    const restoreAt = recovery.indexOf('Rename "$R7" "${DIR}\\MedResearchAgent"')
    const preserveErrorAt = recovery.indexOf('$(BaselioDetail6)')
    const preserveQuitAt = recovery.indexOf('Quit', preserveErrorAt)
    const restoreErrorAt = recovery.indexOf('$(BaselioDetail10)')
    const restoreQuitAt = recovery.indexOf('Quit', restoreErrorAt)
    const retryResultAt = recovery.indexOf('${if} $R0 != 0', retryAt)
    const clearPreservedPathAt = recovery.indexOf('StrCpy $R7 ""', restoreAt)

    expect(preserveAt).toBeGreaterThan(-1)
    expect(preserveAt).toBeLessThan(retryAt)
    expect(preserveErrorAt).toBeLessThan(preserveQuitAt)
    expect(preserveQuitAt).toBeLessThan(retryAt)
    expect(restoreAt).toBeGreaterThan(retryAt)
    expect(restoreAt).toBeLessThan(retryResultAt)
    expect(restoreErrorAt).toBeLessThan(restoreQuitAt)
    expect(restoreQuitAt).toBeLessThan(retryResultAt)
    expect(clearPreservedPathAt).toBeGreaterThan(restoreQuitAt)
  })

  it('keeps registered data backups outside the install tree until recovery finishes', () => {
    // A still-running old process can recreate <install>\MedResearchAgent after customInit moved the
    // registered data aside. Run force-kill + retry before restoring the authoritative backup in
    // both uninstall hooks. If recovery also preserves a newly-created directory, retain it at
    // its unique sibling path instead of overwriting either copy or feeding it to the uninstaller.
    const recovery =
      include.match(
        /!macro restoreRetryDataRoot DIR BACKUP REGISTERED_BACKUP FOLDER([\s\S]*?)!macroend/
      )?.[1] ?? ''
    const shellCheck = include.match(/!macro customUnInstallCheck([\s\S]*?)!macroend/)?.[1] ?? ''
    const userCheck =
      include.match(/!macro customUnInstallCheckCurrentUser([\s\S]*?)!macroend/)?.[1] ?? ''
    const conflictBranch =
      recovery
        .replaceAll('${BACKUP}', '$R7')
        .match(/\$\{if\} "\$\{REGISTERED_BACKUP\}" != ""([\s\S]*?)\$\{else\}/)?.[1] ?? ''
    const shellRecoveryAt = shellCheck.indexOf('!insertmacro uninstallFailureRecoveryAt')
    const shellRestoreAt = shellCheck.indexOf('!insertmacro restoreNestedDataRoot')
    const userRecoveryAt = userCheck.indexOf('!insertmacro uninstallFailureRecoveryAt')
    const userRestoreAt = userCheck.indexOf('!insertmacro restoreNestedDataRoot')

    expect(shellRecoveryAt).toBeGreaterThan(-1)
    expect(shellRecoveryAt).toBeLessThan(shellRestoreAt)
    expect(userRecoveryAt).toBeGreaterThan(-1)
    expect(userRecoveryAt).toBeLessThan(userRestoreAt)
    expect(shellCheck).toContain('!insertmacro uninstallFailureRecoveryAt $INSTDIR $R8')
    expect(userCheck).toContain(
      '!insertmacro uninstallFailureRecoveryAt $perUserInstallDirCache $perUserDataBackup'
    )
    expect(conflictBranch).toContain('StrCpy $baselioMessageBackup "$R7"')
    expect(conflictBranch).toContain('$(BaselioDetail16)')
    expect(conflictBranch).not.toContain('Rename "$R7" "${DIR}\\MedResearchAgent"')
  })

  it('protects registered nested data roots before the first old-uninstaller attempt', () => {
    // Recovery-only protection is too late: the first old uninstaller can succeed after moving
    // <install>\MedResearchAgent into its disposable $PLUGINSDIR. customInit runs before the install
    // section, so it must move registered data roots out first; each post-uninstall hook restores
    // its root even when the first attempt returns zero.
    const init = include.match(/!macro customInit([\s\S]*?)!macroend/)?.[1] ?? ''
    const machineProtection =
      include.match(/!macro protectMachineDataRootForSelectedMode([\s\S]*?)!macroend/)?.[1] ?? ''
    const shellCheck = include.match(/!macro customUnInstallCheck([\s\S]*?)!macroend/)?.[1] ?? ''
    const userCheck =
      include.match(/!macro customUnInstallCheckCurrentUser([\s\S]*?)!macroend/)?.[1] ?? ''

    expect(init).toContain('ReadRegStr $perMachineInstallDirCache HKEY_LOCAL_MACHINE')
    expect(init).toContain('ReadRegStr $perUserInstallDirCache HKEY_CURRENT_USER')
    expect(init).not.toContain('ReadRegStr $shellInstallDirCache SHELL_CONTEXT')
    expect(init.match(/!insertmacro preserveNestedDataRoot/g) ?? []).toHaveLength(1)
    expect(machineProtection).toContain(
      '!insertmacro preserveNestedDataRoot $perMachineInstallDirCache $perMachineDataBackup machine'
    )
    expect(init).toContain(
      '!insertmacro preserveNestedDataRoot $perUserInstallDirCache $perUserDataBackup per-user'
    )
    expect(shellCheck.indexOf('!insertmacro restoreNestedDataRoot')).toBeGreaterThan(-1)
    expect(shellCheck.indexOf('!insertmacro restoreNestedDataRoot')).toBeGreaterThan(
      shellCheck.indexOf('${if} $R0 != 0')
    )
    expect(userCheck.indexOf('!insertmacro restoreNestedDataRoot')).toBeGreaterThan(-1)
    expect(userCheck.indexOf('!insertmacro restoreNestedDataRoot')).toBeGreaterThan(
      userCheck.indexOf('${if} $R0 != 0')
    )
    expect(include).toContain('!define MUI_CUSTOMFUNCTION_ABORT restorePreservedOnAbort')
    expect(include).toContain('Function restorePreservedOnAbort')
    expect(include).toContain('Function .onInstFailed')
    // Normal GUI shutdown includes the unelevated -> elevated UAC handoff. Restoring there would
    // race the inner installer's later HKCU uninstall pass; interrupted backups are deterministic
    // and are adopted by the next installer instead.
    expect(include).not.toContain('Function .onGUIEnd')
  })

  it('waits for the final all-users mode before touching a distinct machine data root', () => {
    // customInit runs before an elevated assisted user makes the final install-mode choice. A
    // current-user install must not fail because an unrelated HKLM data folder is busy. Keep the
    // silent path protected in customInit, but otherwise chain protection into the instfiles-page
    // preflight, after the mode page has committed the final selection and before the section runs.
    const init = include.match(/!macro customInit([\s\S]*?)!macroend/)?.[1] ?? ''
    const machineProtection =
      include.match(/!macro protectMachineDataRootForSelectedMode([\s\S]*?)!macroend/)?.[1] ?? ''
    const pageHook = include.match(/!macro customPageAfterChangeDir([\s\S]*?)!macroend/)?.[1] ?? ''
    const header = include.match(/!macro customHeader([\s\S]*?)!macroend/)?.[1] ?? ''
    const selectedModeAt = machineProtection.indexOf('$installMode == "all"')
    const preserveMachineAt = machineProtection.indexOf(
      '!insertmacro preserveNestedDataRoot $perMachineInstallDirCache $perMachineDataBackup machine'
    )

    expect(init).not.toContain(
      '!insertmacro preserveNestedDataRoot $perMachineInstallDirCache $perMachineDataBackup machine'
    )
    expect(init).toMatch(
      /\$\{if\} \$\{Silent\}[\s\S]*!insertmacro protectMachineDataRootForSelectedMode/
    )
    expect(selectedModeAt).toBeGreaterThan(-1)
    expect(selectedModeAt).toBeLessThan(preserveMachineAt)
    expect(pageHook).toContain(
      '!define openScienceOriginalInstFilesPre ${MUI_PAGE_CUSTOMFUNCTION_PRE}'
    )
    expect(pageHook).toContain(
      '!define MUI_PAGE_CUSTOMFUNCTION_PRE protectNestedDataRootsForInstall'
    )
    expect(header).toContain('Call ${openScienceOriginalInstFilesPre}')
    expect(header).toContain('!insertmacro protectMachineDataRootForSelectedMode')
  })

  it('defers a shared machine-owned data root to the elevated inner installer', () => {
    // With matching HKCU/HKLM registrations, an unelevated assisted outer process may not be
    // allowed to rename a Program Files child. Probe the sibling directory non-destructively and
    // defer to the elevated inner .onInit when it is not writable, instead of aborting before UAC.
    const init = include.match(/!macro customInit([\s\S]*?)!macroend/)?.[1] ?? ''
    const probeAt = init.indexOf('GetTempFileName $R9 "$R2"')
    const preserveAt = init.indexOf(
      '!insertmacro preserveNestedDataRoot $perUserInstallDirCache $perUserDataBackup per-user'
    )

    expect(init).toContain('${andIfNot} ${UAC_IsAdmin}')
    expect(init).toContain('$perMachineInstallDirCache == $perUserInstallDirCache')
    expect(probeAt).toBeGreaterThan(-1)
    expect(probeAt).toBeLessThan(preserveAt)
    expect(init).toContain('$(BaselioDetail14)')
  })

  it('normalizes registered Windows paths before testing whether they share a directory', () => {
    // NSIS string equality is already case-insensitive, but registry values for the same Windows
    // directory may differ by harmless trailing separators. Normalize both cached locations in
    // place before any shared-path branch so the UAC probe, backup aliasing, and handoff restore
    // all make the same decision.
    const normalizer =
      include.match(/Function normalizeRegisteredInstallPath([\s\S]*?)FunctionEnd/)?.[1] ?? ''
    const init = include.match(/!macro customInit([\s\S]*?)!macroend/)?.[1] ?? ''
    const normalizeMachineAt = init.indexOf(
      'Push $perMachineInstallDirCache\n  Call normalizeRegisteredInstallPath'
    )
    const normalizeUserAt = init.indexOf(
      'Push $perUserInstallDirCache\n  Call normalizeRegisteredInstallPath'
    )
    const firstSharedPathCheckAt = init.indexOf(
      '$perMachineInstallDirCache == $perUserInstallDirCache'
    )

    expect(normalizer).toContain('StrCmp $R1 "\\"')
    expect(normalizer).toContain('StrCmp $R1 "/"')
    expect(normalizeMachineAt).toBeGreaterThan(-1)
    expect(normalizeUserAt).toBeGreaterThan(-1)
    expect(normalizeMachineAt).toBeLessThan(firstSharedPathCheckAt)
    expect(normalizeUserAt).toBeLessThan(firstSharedPathCheckAt)
  })

  it('accepts a non-zero retry after the old executable was removed', () => {
    // The old assisted uninstaller can finish removing the application and still leak exit code 2.
    // Recovery already recognizes that result before retrying; it must make the same filesystem
    // check after the retry instead of showing a fatal dialog for a completed uninstall.
    const recovery =
      include.match(/!macro uninstallFailureRecoveryAt DIR([\s\S]*?)!macroend/)?.[1] ?? ''
    const afterRetry = recovery.slice(recovery.indexOf('ExecWait'))
    const removedCheck = '${FileExists} "${DIR}' + '\\' + '${APP_EXECUTABLE_FILENAME}"'

    expect(
      recovery.match(/\$\{FileExists\} "\$\{DIR\}\\\$\{APP_EXECUTABLE_FILENAME\}"/g) ?? []
    ).toHaveLength(2)
    expect(afterRetry.indexOf(removedCheck)).toBeGreaterThan(afterRetry.indexOf('${if} $R0 != 0'))
    expect(afterRetry.indexOf(removedCheck)).toBeLessThan(
      afterRetry.indexOf('MessageBox MB_OK|MB_ICONEXCLAMATION "$(BaselioUninstallFailed)"')
    )
  })

  it('passes the install dir to PowerShell as an argument, with a directory-boundary match', () => {
    // Custom install dirs may contain apostrophes: interpolating the path into the script source
    // would break the command (or worse, inject into it). The dir goes in as $args[0] and the
    // prefix match is anchored with a trailing backslash so sibling directories never match.
    expect(include).toContain('$$args[0].TrimEnd')
    expect(include).toContain('$$_.ExecutablePath.StartsWith($$root')
    expect(include).not.toContain(`StartsWith('$INSTDIR'`)
  })

  it('caches the per-user install location before the HKCU uninstall pass deletes it', () => {
    // A successful per-user uninstall deletes HKCU InstallLocation, so reading it inside the hook
    // — after the pass — always comes up empty in exactly the spurious-failure case the hook
    // exists for. customInit runs before any uninstall pass; the hook must consume its cached
    // value and fall back to the default fatal handling only when no per-user install was
    // registered at install start.
    expect(include).toMatch(/\$\{if\} \$perUserInstallDirCache == ""/)
    expect(include).toContain(
      '!insertmacro uninstallFailureRecoveryAt $perUserInstallDirCache $perUserDataBackup'
    )
    expect(include).toContain('!insertmacro uninstallFailureRecoveryAt $INSTDIR $R8')
    // The installer-only guard keeps the cache variables out of the separately compiled
    // uninstaller, where file-scope declarations would be unused and fail makensis warnings.
    const initHook = include.match(/!macro customInit([\s\S]*?)!macroend/)?.[1] ?? ''
    expect(include).toMatch(
      /!ifndef BUILD_UNINSTALLER[\s\S]*Var perUserInstallDirCache[\s\S]*!macro customInit/
    )
    expect(initHook).toContain(
      'ReadRegStr $perUserInstallDirCache HKEY_CURRENT_USER "${INSTALL_REGISTRY_KEY}" InstallLocation'
    )
    // The hook itself must not re-read the registry after the pass — that pins the broken order.
    // (Comments may name the value while explaining; strip them before checking.)
    const hkcuHook = (
      include.match(/!macro customUnInstallCheckCurrentUser([\s\S]*?)!macroend/)?.[1] ?? ''
    )
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n')
    expect(hkcuHook).not.toContain('readReg')
    expect(hkcuHook).not.toContain('InstallLocation')
  })

  it('never references symbols declared only after handleUninstallResult is parsed', () => {
    // makensis treats unknown variables as errors (electron-builder builds with warnings as
    // errors): handleUninstallResult is parsed BEFORE uninstallOldVersion / CHECK_APP_RUNNING
    // declare their globals, so the hook body must stay self-contained. Comment lines are
    // stripped before checking — they may name the variables while explaining this.
    const code = include
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n')
    expect(code).not.toContain('$installationDir')
    expect(code).not.toContain('$uninstallerFileNameTemp')
    expect(code).not.toContain('$PowerShellPath')
    expect(code).not.toContain('$CmdPath')
    expect(code).not.toContain('$IsPowerShellAvailable')
    expect(code).not.toContain('IS_POWERSHELL_AVAILABLE')
    expect(code).not.toContain('KILL_PROCESS')
  })

  it('the installed electron-builder still inserts the customUnInstallCheck hooks', () => {
    // The recovery runs only if app-builder-lib's handleUninstallResult keeps inserting these two
    // macro names. electron-builder is a caret-ranged dependency, so a routine bump could rename
    // or drop the insertion points — the macros would compile into dead code while every
    // assertion above stays green. Guard the integration contract itself so such an upgrade
    // fails here instead of silently reverting to the fatal dialog.
    const installUtil = readFileSync(
      join(appBuilderLibRoot, 'templates/nsis/include/installUtil.nsh'),
      'utf8'
    )
    expect(installUtil).toContain('!ifmacrodef customUnInstallCheck')
    expect(installUtil).toContain('!insertmacro customUnInstallCheck')
    expect(installUtil).toContain('!ifmacrodef customUnInstallCheckCurrentUser')
    expect(installUtil).toContain('!insertmacro customUnInstallCheckCurrentUser')
  })

  it('the installed electron-builder still inserts customInit before the uninstall passes', () => {
    // The install-dir cache and data preservation only run if installer.nsi keeps inserting
    // customInit in .onInit, before the install section invokes either old uninstaller.
    const installerNsi = readFileSync(
      join(appBuilderLibRoot, 'templates/nsis/installer.nsi'),
      'utf8'
    )
    expect(installerNsi).toContain('!ifmacrodef customInit')
    expect(installerNsi).toContain('!insertmacro customInit')
    expect(installerNsi.indexOf('!insertmacro customInit')).toBeLessThan(
      installerNsi.indexOf('Section "install"')
    )
  })

  it('records actionable cleanup failure reasons in the NSIS detail log', () => {
    const strings = readFileSync(join(repoRoot, 'build/installer-strings.nsh'), 'utf8')
    expect(strings).toContain('Baselio Notebook cleanup failure code=$0')
    for (const code of [
      'parent-path-unresolved',
      'backup-already-exists',
      'preserve-rename-failed',
      'restore-destination-exists',
      'restore-rename-failed'
    ]) {
      expect(strings).toContain(`Baselio data protection failure code=${code}`)
    }
  })
})

it('protects both re-created branded data folders before retrying the old uninstaller', () => {
  const include = readFileSync(join(process.cwd(), 'build/installer.nsh'), 'utf8')
  const recovery =
    include.match(/!macro uninstallFailureRecoveryAt DIR[\s\S]*?!macroend/)?.[0] ?? ''
  for (const name of ['MedResearchAgent', 'MedResearch-Agent']) {
    expect(recovery).toMatch(
      new RegExp('!insertmacro preserveRetryDataRoot[^\\n]+ ' + name + '(?:\\n|$)')
    )
    expect(recovery).toMatch(
      new RegExp('!insertmacro restoreRetryDataRoot[^\\n]+ ' + name + '(?:\\n|$)')
    )
  }
  expect(recovery.indexOf('!insertmacro preserveRetryDataRoot')).toBeLessThan(
    recovery.indexOf('ExecWait')
  )
  expect(recovery.indexOf('!insertmacro restoreRetryDataRoot')).toBeGreaterThan(
    recovery.indexOf('ExecWait')
  )
})

// #163: the installer decides whether a target folder is usable with a generated NSIS loop. The same
// numbers are computed in TypeScript by build/installer-path-budget.cjs, so compiling the generated
// include and running it is the only way to prove the two agree - a transcription error there would
// silently pass or refuse every folder.
describe.skipIf(!nsisCompiler)('NSIS installer target-path preflight (#163)', () => {
  it('counts the same overflowing files as the build-time assessment', () => {
    const root = mkdtempSync(join(tmpdir(), 'nsis-path-preflight-'))
    try {
      const payload = join(root, 'payload')
      mkdirSync(join(payload, 'resources'), { recursive: true })
      writeFileSync(join(payload, 'app.exe'), '')
      writeFileSync(join(payload, 'resources', 'app.asar'), '')
      writeFileSync(join(payload, 'resources', 'a-very-deep-name-0123456789.bin'), '')

      const budget = require('./installer-path-budget.cjs')
      const include = join(root, 'installer-path-budget.nsh')
      const summary = budget.emit({ payloadDir: payload, out: include })

      // 240 characters: \resources\app.asar lands exactly on 259 (it must still fit) and only the deep\n      // name overflows, so this also pins the boundary the TS side asserts.
      const folder = 'C:\\' + 'x'.repeat(237)
      expect(folder).toHaveLength(240)
      const expected = budget.assessInstallTarget(folder, summary)
      expect(expected.overflowFiles).toBe(1)

      const output = join(root, 'result.txt')
      const executable = join(root, 'probe.exe')
      const source = join(root, 'probe.nsi')
      writeFileSync(
        source,
        `\uFEFFUnicode true
!include "LogicLib.nsh"
!addincludedir "${appBuilderIncludeDir}"
Name "Installer path preflight probe"
OutFile "${executable}"
RequestExecutionLevel user
SilentInstall silent
!include "${include}"
Section
  FileOpen $9 "${output}" w
  StrCpy $R1 ${folder.length}
  !insertmacro baselioCountOverflowingFiles
  FileWriteUTF16LE $9 "$R3"
  FileClose $9
  SetErrorLevel 0
SectionEnd
`
      )
      const compile = spawnSync(nsisCompiler!, ['/V2', source], {
        encoding: 'utf8',
        timeout: 15_000
      })
      expect(compile.error).toBeUndefined()
      expect(compile.status, compile.stderr || compile.stdout).toBe(0)
      const run = spawnSync(executable, [], { encoding: 'utf8', timeout: 60_000 })
      expect(run.error).toBeUndefined()
      expect(readFileSync(output, 'utf16le').trim()).toBe(String(expected.overflowFiles))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // A silent refusal must stay diagnosable without a dialog. Measured on this toolchain: DetailPrint writes
  // 0 bytes to stdout and stderr, so exit code 3 alone looks like a crash and the log file is the only
  // evidence of which preflight fired and why. This compiles the production include (not a copy of the
  // macro text), so a broken log path, a clobbered register or a wrong exit code fails here.
  it('logs a silent path refusal with its numbers and exits 3', () => {
    const root = mkdtempSync(join(tmpdir(), 'nsis-refusal-log-'))
    try {
      const payload = join(root, 'payload')
      mkdirSync(join(payload, 'resources'), { recursive: true })
      writeFileSync(join(payload, 'app.exe'), '')
      writeFileSync(join(payload, 'resources', 'a-very-deep-name-0123456789.bin'), '')

      const budget = require('./installer-path-budget.cjs')
      const summary = budget.emit({
        payloadDir: payload,
        out: join(root, 'installer-path-budget.nsh')
      })
      // The include resolves its generated budget through ${__FILEDIR__}, so the production file has to
      // sit next to the generated one for this probe.
      const preflight = join(root, 'installer-preflight.nsh')
      copyFileSync(join(repoRoot, 'build/installer-preflight.nsh'), preflight)

      const logRoot = join(root, 'logroot')
      mkdirSync(logRoot)
      const folder = 'C:\\' + 'x'.repeat(237)
      const expected = budget.assessInstallTarget(folder, summary)
      expect(expected.overflowFiles).toBe(1)

      const executable = join(root, 'probe.exe')
      const source = join(root, 'probe.nsi')
      writeFileSync(
        source,
        `\uFEFFUnicode true
!include "LogicLib.nsh"
!addincludedir "${appBuilderIncludeDir}"
Name "Preflight refusal log probe"
OutFile "${executable}"
RequestExecutionLevel user
SilentInstall silent
!include "${preflight}"
Section
  StrCpy $INSTDIR "${folder}"
  !insertmacro baselioPreflightInstallPath
  SetErrorLevel 0
SectionEnd
`
      )
      const compile = spawnSync(nsisCompiler!, ['/V2', source], {
        encoding: 'utf8',
        timeout: 15_000
      })
      expect(compile.error).toBeUndefined()
      expect(compile.status, compile.stderr || compile.stdout).toBe(0)
      // $TEMP is a read-only NSIS constant resolved from the process environment, so the log directory is
      // chosen the same way a real install would resolve it.
      const run = spawnSync(executable, [], {
        encoding: 'utf8',
        timeout: 60_000,
        env: { ...process.env, TEMP: logRoot, TMP: logRoot }
      })
      expect(run.error).toBeUndefined()
      expect(run.status, run.stderr).toBe(3)
      expect(run.stdout ?? '').toBe('')

      const log = readFileSync(join(logRoot, 'Baselio-install-preflight.log'))
      expect(log.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xfe]))
      const text = log.toString('utf16le')
      expect(text).toContain('refusal reason=path-too-long')
      expect(text).toContain(`folder-length=${folder.length}`)
      expect(text).toContain(`overflowing-files=${expected.overflowFiles}`)
      expect(text).toContain(`longest-path=${expected.longestPathLength}`)
      expect(text).toContain('limit=259')
      expect(text).toContain(`longest-usable-folder=${expected.maxInstallDirLength}`)
      expect(text).toContain(`install-folder="${folder}"`)
      expect(text).toContain('action=rerun-the-installer-with-a-shorter-folder')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // The log has to keep earlier refusals (a user often retries): on this NSIS, append mode alone writes at
  // offset 0, so the explicit FileSeek is load-bearing. Two refusals in one run prove the file grows and
  // that the byte-order mark is written exactly once.
  it('appends every refusal to one log file with a single byte-order mark', () => {
    const root = mkdtempSync(join(tmpdir(), 'nsis-refusal-append-'))
    try {
      const preflight = join(root, 'installer-preflight.nsh')
      copyFileSync(join(repoRoot, 'build/installer-preflight.nsh'), preflight)
      const payload = join(root, 'payload')
      mkdirSync(payload)
      writeFileSync(join(payload, 'app.exe'), '')
      const budget = require('./installer-path-budget.cjs')
      budget.emit({
        payloadDir: payload,
        out: join(root, 'installer-path-budget.nsh')
      })

      const logRoot = join(root, 'logroot')
      mkdirSync(logRoot)
      const executable = join(root, 'probe.exe')
      const source = join(root, 'probe.nsi')
      writeFileSync(
        source,
        `\uFEFFUnicode true
!include "LogicLib.nsh"
!addincludedir "${appBuilderIncludeDir}"
Name "Preflight refusal append probe"
OutFile "${executable}"
RequestExecutionLevel user
SilentInstall silent
!include "${preflight}"
Section
  !insertmacro baselioLogPreflightRefusal "refusal reason=app-running process=first.exe"
  !insertmacro baselioLogPreflightRefusal "refusal reason=path-too-long folder-length=99"
SectionEnd
`
      )
      const compile = spawnSync(nsisCompiler!, ['/V2', source], {
        encoding: 'utf8',
        timeout: 15_000
      })
      expect(compile.error).toBeUndefined()
      expect(compile.status, compile.stderr || compile.stdout).toBe(0)
      const run = spawnSync(executable, [], {
        encoding: 'utf8',
        timeout: 60_000,
        env: { ...process.env, TEMP: logRoot, TMP: logRoot }
      })
      expect(run.error).toBeUndefined()
      expect(run.status, run.stderr).toBe(0)

      const log = readFileSync(join(logRoot, 'Baselio-install-preflight.log'))
      expect(log.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xfe]))
      const lines = log
        .toString('utf16le')
        .replace(/^\uFEFF/, '')
        .split('\r\n')
        .filter(Boolean)
      expect(lines).toEqual([
        'refusal reason=app-running process=first.exe',
        'refusal reason=path-too-long folder-length=99'
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // A stale InstallLocation must not be mistaken for an update: an unclean uninstall leaves the registry
  // value behind, and trusting the value alone let a fresh install into that folder skip the running-app
  // check and stall after the progress bar had started - the failure this ticket exists for. FIND_PROCESS is
  // electron-builder's, so the probe stands in for it: "the app is running" is always true here.
  it('checks for a running app when the registered folder no longer holds the program', () => {
    const root = mkdtempSync(join(tmpdir(), 'nsis-running-app-preflight-'))
    try {
      const payload = join(root, 'payload')
      mkdirSync(payload)
      writeFileSync(join(payload, 'app.exe'), '')
      const budget = require('./installer-path-budget.cjs')
      budget.emit({
        payloadDir: payload,
        out: join(root, 'installer-path-budget.nsh')
      })
      const preflight = join(root, 'installer-preflight.nsh')
      copyFileSync(join(repoRoot, 'build/installer-preflight.nsh'), preflight)
      const strings = readFileSync(join(repoRoot, 'build/installer-strings.nsh'), 'utf8').replace(
        /^\uFEFF/,
        ''
      )

      const runProbe = (name: string, registered: string, withFinder = true) => {
        const logRoot = join(root, `${name}-log`)
        mkdirSync(logRoot)
        const executable = join(root, `${name}.exe`)
        const source = join(root, `${name}.nsi`)
        const finder = withFinder
          ? `!macro baselioFindRunningProcess RETURN
  StrCpy ${'$'}{RETURN} 0
!macroend
`
          : ''
        writeFileSync(
          source,
          `\uFEFFUnicode true
!include "LogicLib.nsh"
!addincludedir "${appBuilderIncludeDir}"
Name "Running-app preflight probe ${name}"
OutFile "${executable}"
RequestExecutionLevel user
SilentInstall silent
Var perMachineInstallDirCache
Var perUserInstallDirCache
Var retryLegacyDataBackup
Var retryBrandedDataBackup
!define UNINSTALL_FILENAME "Uninstall Baselio.exe"
!define APP_EXECUTABLE_FILENAME "Baselio.exe"
LangString uninstallFailed 1033 "Uninstall failed"
${finder}!include "${preflight}"
${strings}
Section
  StrCpy $perMachineInstallDirCache "${registered}"
  StrCpy $perUserInstallDirCache ""
  !insertmacro baselioPreflightRunningApp
  SetErrorLevel 0
SectionEnd
`
        )
        const compile = spawnSync(nsisCompiler!, ['/V2', source], {
          encoding: 'utf8',
          timeout: 15_000
        })
        expect(compile.error).toBeUndefined()
        if (compile.status !== 0) {
          return {
            compileStatus: compile.status,
            compileOutput: `${compile.stdout}${compile.stderr}`,
            status: null,
            log: ''
          }
        }
        const run = spawnSync(executable, [], {
          encoding: 'utf8',
          timeout: 60_000,
          env: { ...process.env, TEMP: logRoot, TMP: logRoot }
        })
        expect(run.error).toBeUndefined()
        const logFile = join(logRoot, 'Baselio-install-preflight.log')
        return {
          compileStatus: compile.status,
          compileOutput: '',
          status: run.status,
          log: existsSync(logFile) ? readFileSync(logFile, 'utf16le') : ''
        }
      }

      // Unclean uninstall: the registry value points at a folder with no Baselio.exe.
      const stale = join(root, 'stale-program-files')
      mkdirSync(stale)
      writeFileSync(join(stale, 'leftover.dll'), '')
      const refused = runProbe('stale', stale)
      expect(refused.compileStatus).toBe(0)
      expect(refused.status).toBe(3)
      expect(refused.log).toContain('reason=app-running')
      expect(refused.log).toContain('process=Baselio.exe')
      expect(refused.log).toContain('action=quit-Baselio-then-rerun-the-installer')

      // A real installation: the executable is there, so this is an update and the check must stay out of it.
      const installed = join(root, 'installed-program-files')
      mkdirSync(installed)
      writeFileSync(join(installed, 'Baselio.exe'), '')
      const allowed = runProbe('installed', installed)
      expect(allowed.compileStatus).toBe(0)
      expect(allowed.status).toBe(0)
      expect(allowed.log).toBe('')

      // The finder is ours now (baselioFindRunningProcess), so there is no "missing electron-builder
      // macro" case any more: without a stub the probe runs the real tasklist lookup. That is covered
      // by the assembled-order compile below instead.
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // Release blocker: the running-app preflight used electron-builder's FIND_PROCESS, whose body reads
  // $IsPowerShellAvailable, $PowerShellPath and $CmdPath. Those are declared by CHECK_APP_RUNNING, and the
  // assembled script inserts customInit in .onInit BEFORE installSection.nsh inserts CHECK_APP_RUNNING. So
  // the reference came first: makensis emitted `warning 6000: unknown variable/constant
  // "IsPowerShellAvailable"` and electron-builder compiles NSIS with -WX, which stopped every Windows
  // installer from building. The probe above stubs the finder, which is exactly why it stayed green.
  //
  // This probe mirrors the ordering with warnings as errors and no stub: our file must compile with only
  // NSIS built-ins available. The old implementation fails here even before the warning, because
  // FIND_PROCESS does not exist yet at this point in the assembled script.
  it.skipIf(!nsisPluginsDir)(
    'the preflight compiles before electron-builder declares its process-scan variables (-WX)',
    { timeout: 60_000 },
    () => {
    const root = mkdtempSync(join(tmpdir(), 'nsis-preflight-order-'))
    try {
      const payload = join(root, 'payload')
      mkdirSync(payload)
      writeFileSync(join(payload, 'app.exe'), '')
      const budget = require('./installer-path-budget.cjs')
      budget.emit({ payloadDir: payload, out: join(root, 'installer-path-budget.nsh') })
      const preflight = join(root, 'installer-preflight.nsh')
      copyFileSync(join(repoRoot, 'build/installer-preflight.nsh'), preflight)

      const logRoot = join(root, 'logroot')
      mkdirSync(logRoot)
      const executable = join(root, 'probe.exe')
      const source = join(root, 'probe.nsi')
      writeFileSync(
        source,
        `\uFEFFUnicode true
!include "LogicLib.nsh"
!addincludedir "${appBuilderIncludeDir}"
!addplugindir "${nsisPluginsDir}"
!define APP_EXECUTABLE_FILENAME "BaselioOrderingProbe.exe"
!define UNINSTALL_FILENAME "Uninstall BaselioOrderingProbe.exe"
LangString BaselioPreflightPathTooLong 1033 "Target folder is too long"
LangString BaselioPreflightAppRunning 1033 "Baselio is still running"
!include "${preflight}"
Name "Preflight ordering probe"
OutFile "${executable}"
RequestExecutionLevel user
SilentInstall silent
Var perMachineInstallDirCache
Var perUserInstallDirCache
Section
  StrCpy $perMachineInstallDirCache ""
  StrCpy $perUserInstallDirCache ""
  !insertmacro baselioPreflightRunningApp
SectionEnd
`
      )
      const compile = spawnSync(nsisCompiler!, ['-WX', '/V2', source], {
        encoding: 'utf8',
        timeout: 20_000
      })
      expect(compile.error).toBeUndefined()
      expect(compile.status, `${compile.stdout}${compile.stderr}`).toBe(0)

      // The lookup is real here (no stub): a process with this name does not run, so the installer must
      // continue instead of refusing every fresh install.
      const run = spawnSync(executable, [], {
        encoding: 'utf8',
        timeout: 60_000,
        env: { ...process.env, TEMP: logRoot, TMP: logRoot }
      })
      expect(run.error).toBeUndefined()
      expect(run.status, `${run.stdout}${run.stderr}`).toBe(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('the installed electron-builder still inserts customInit before CHECK_APP_RUNNING', () => {
    // The ordering is the whole reason the preflight must be self-contained: customInit runs from
    // .onInit, installSection.nsh (which inserts CHECK_APP_RUNNING and therefore declares its globals) is
    // included later. If a future electron-builder moved this, the comment above would be wrong and the
    // dependency could become safe — this test says the premise changed instead of silently keeping it.
    const installerNsi = readFileSync(join(appBuilderLibRoot, 'templates/nsis/installer.nsi'), 'utf8')
    const installSection = readFileSync(
      join(appBuilderLibRoot, 'templates/nsis/installSection.nsh'),
      'utf8'
    )
    expect(installSection).toContain('!insertmacro CHECK_APP_RUNNING')
    expect(installerNsi.indexOf('!insertmacro customInit')).toBeLessThan(
      installerNsi.indexOf('!include "installSection.nsh"')
    )
  })

  it('the preflight and installer include never reference electron-builder globals declared later', () => {
    // Same failure, caught statically: a reference to these names from our files is compiled before
    // electron-builder declares them. Comment lines may name them while explaining, so they are stripped.
    for (const file of ['installer.nsh', 'installer-preflight.nsh']) {
      const code = readFileSync(join(repoRoot, 'build', file), 'utf8')
        .split('\n')
        .filter((line) => !/^\s*#/.test(line))
        .join('\n')
      for (const symbol of [
        '$IsPowerShellAvailable',
        '$PowerShellPath',
        '$CmdPath',
        'FIND_PROCESS',
        'KILL_PROCESS',
        'CHECK_APP_RUNNING',
        'IS_POWERSHELL_AVAILABLE'
      ]) {
        expect(code, `${file} must not reference ${symbol}`).not.toContain(symbol)
      }
    }
  })

  // The data-failure exits have the same problem as the refusals: a silent install shows no dialog, so the
  // code alone said nothing. This runs the production macro text against the same log.
  it('logs a data-restore failure before exiting for a silent install', () => {
    const root = mkdtempSync(join(tmpdir(), 'nsis-data-failure-log-'))
    try {
      const payload = join(root, 'payload')
      mkdirSync(payload)
      writeFileSync(join(payload, 'app.exe'), '')
      const budget = require('./installer-path-budget.cjs')
      budget.emit({
        payloadDir: payload,
        out: join(root, 'installer-path-budget.nsh')
      })
      const preflight = join(root, 'installer-preflight.nsh')
      copyFileSync(join(repoRoot, 'build/installer-preflight.nsh'), preflight)
      const include = readFileSync(join(repoRoot, 'build/installer.nsh'), 'utf8')
      const quitMacro = include.match(/!macro quitIfDataRestoreFailed[\s\S]*?!macroend/)?.[0] ?? ''
      expect(quitMacro).toContain('reason=data-restore-failed')
      const strings = readFileSync(join(repoRoot, 'build/installer-strings.nsh'), 'utf8').replace(
        /^\uFEFF/,
        ''
      )

      const logRoot = join(root, 'logroot')
      mkdirSync(logRoot)
      const executable = join(root, 'probe.exe')
      const source = join(root, 'probe.nsi')
      writeFileSync(
        source,
        `\uFEFFUnicode true
!include "LogicLib.nsh"
!addincludedir "${appBuilderIncludeDir}"
Name "Data failure log probe"
OutFile "${executable}"
RequestExecutionLevel user
SilentInstall silent
Var dataRestoreFailed
Var retryLegacyDataBackup
Var retryBrandedDataBackup
!define UNINSTALL_FILENAME "Uninstall Baselio.exe"
!define APP_EXECUTABLE_FILENAME "medresearch-agent.exe"
LangString uninstallFailed 1033 "Uninstall failed"
!include "${preflight}"
${strings}
${quitMacro}
Section
  StrCpy $dataRestoreFailed "1"
  StrCpy $baselioMessageBackup "C:\\preserved-backup"
  !insertmacro quitIfDataRestoreFailed
  SetErrorLevel 0
SectionEnd
`
      )
      const compile = spawnSync(nsisCompiler!, ['/V2', source], {
        encoding: 'utf8',
        timeout: 15_000
      })
      expect(compile.error).toBeUndefined()
      expect(compile.status, compile.stderr || compile.stdout).toBe(0)
      const run = spawnSync(executable, [], {
        encoding: 'utf8',
        timeout: 60_000,
        env: { ...process.env, TEMP: logRoot, TMP: logRoot }
      })
      expect(run.error).toBeUndefined()
      expect(run.status, run.stderr).toBe(2)
      const log = readFileSync(join(logRoot, 'Baselio-install-preflight.log'), 'utf16le')
      expect(log).toContain('reason=data-restore-failed')
      expect(log).toContain('backup="C:\\preserved-backup"')
      // Both protection-failure exits are guarded the same way; only their text is reachable here because
      // they live inside customInit and the final-mode page preflight.
      expect(include.match(/reason=data-protection-failed/g) ?? []).toHaveLength(2)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // The fallback exists for the case where TEMP cannot be written, so it has to produce the same readable
  // file: a fallback log without its own byte-order mark reads as mojibake exactly when it is the only
  // copy left. The probe makes the TEMP log unopenable by putting a directory in its place.
  it('writes a readable fallback log beside the installer when TEMP cannot take it', () => {
    const root = mkdtempSync(join(tmpdir(), 'nsis-refusal-fallback-'))
    try {
      const payload = join(root, 'payload')
      mkdirSync(join(payload, 'resources'), { recursive: true })
      writeFileSync(join(payload, 'app.exe'), '')
      writeFileSync(join(payload, 'resources', 'a-very-deep-name-0123456789.bin'), '')
      const budget = require('./installer-path-budget.cjs')
      const summary = budget.emit({
        payloadDir: payload,
        out: join(root, 'installer-path-budget.nsh')
      })
      const preflight = join(root, 'installer-preflight.nsh')
      copyFileSync(join(repoRoot, 'build/installer-preflight.nsh'), preflight)

      // A directory with the log's name: FileOpen in TEMP fails, so the code must fall back to $EXEDIR.
      const logTemp = join(root, 'temp-log')
      mkdirSync(join(logTemp, 'Baselio-install-preflight.log'), { recursive: true })
      const folder = 'C:\\' + 'x'.repeat(237)
      expect(budget.assessInstallTarget(folder, summary).overflowFiles).toBe(1)

      const executable = join(root, 'probe.exe')
      const source = join(root, 'probe.nsi')
      writeFileSync(
        source,
        `\uFEFFUnicode true
!include "LogicLib.nsh"
!addincludedir "${appBuilderIncludeDir}"
Name "Preflight fallback log probe"
OutFile "${executable}"
RequestExecutionLevel user
SilentInstall silent
!include "${preflight}"
Section
  StrCpy $INSTDIR "${folder}"
  !insertmacro baselioPreflightInstallPath
  SetErrorLevel 0
SectionEnd
`
      )
      const compile = spawnSync(nsisCompiler!, ['/V2', source], {
        encoding: 'utf8',
        timeout: 15_000
      })
      expect(compile.error).toBeUndefined()
      expect(compile.status, compile.stderr || compile.stdout).toBe(0)
      const run = spawnSync(executable, [], {
        encoding: 'utf8',
        timeout: 60_000,
        env: { ...process.env, TEMP: logTemp, TMP: logTemp }
      })
      expect(run.error).toBeUndefined()
      expect(run.status, run.stderr).toBe(3)

      // $EXEDIR is the probe's folder.
      const fallback = readFileSync(join(root, 'Baselio-install-preflight.log'))
      expect(fallback.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xfe]))
      expect(fallback.toString('utf16le')).toContain('reason=path-too-long')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // "End Baselio.exe in Task Manager" pointed at a process that does not exist: the installer ships
  // medresearch-agent.exe (APP_EXECUTABLE_FILENAME). The log line already used the define, which is exactly
  // why the mismatch stayed invisible - the message has to use it too.
  it('names the shipped executable in the running-app message', () => {
    const strings = readFileSync(join(repoRoot, 'build/installer-strings.nsh'), 'utf8')
    expect(strings).not.toMatch(/Baselio\.exe/u)
    expect(strings.split('${APP_EXECUTABLE_FILENAME}')).toHaveLength(4)
  })

  // Every exit 2 is a silent failure in /S mode. Each one must leave its reason in the same log, so a
  // reader never has to reproduce an install to learn why it stopped. Comment lines are dropped first: a
  // commented-out call still contains the macro name and would otherwise pass this guard.
  it('leaves a reason before every non-preflight silent exit', () => {
    const include = readFileSync(join(repoRoot, 'build/installer.nsh'), 'utf8')
    const active = include
      .split(/\r?\n/u)
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n')
    const exits = active.split('SetErrorLevel 2')
    expect(exits.length).toBeGreaterThan(1)
    for (const [index, chunk] of exits.slice(0, -1).entries()) {
      expect(chunk.slice(-400), `SetErrorLevel 2 #${index + 1} has no logged reason`).toContain(
        'baselioLogPreflightRefusal'
      )
    }
  })
})
