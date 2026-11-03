import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'
import { expect, it } from 'vitest'

it.each(['uncaughtException', 'unhandledRejection'])(
  'persists %s phase/error/stack, sends failed IPC and exits 70 in a real Node process',
  async (event) => {
    const root = await mkdtemp(join(tmpdir(), 'backend-fatal-'))
    try {
      const entry = join(root, 'entry.cjs')
      await build({
        stdin: {
          resolveDir: process.cwd(),
          contents: `
        import { initLogger } from '@aipoch/diagnostics/node';
        import { createBackendStartupReporter } from './src/main/backend-startup';
        import { installBackendFatalDiagnostics } from './src/main/backend-fatal-diagnostics';
        initLogger({logDir:${JSON.stringify(root)},mirrorToConsole:false});
        const reporter=createBackendStartupReporter();
        reporter.phase('database');
        installBackendFatalDiagnostics(reporter);
        setImmediate(() => { ${event === 'uncaughtException' ? 'throw new Error("fatal fixture")' : 'void Promise.reject(new Error("fatal fixture"))'} });
      `
        },
        bundle: true,
        platform: 'node',
        format: 'cjs',
        outfile: entry
      })
      const child = spawn(process.execPath, [entry], {
        env: {
          ...process.env,
          OPEN_SCIENCE_STARTUP_ATTEMPT: '885811d4-929c-4e1e-89c6-2cbef6a4f53b'
        },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc']
      })
      const messages: unknown[] = []
      child.on('message', (message) => messages.push(message))
      const code = await new Promise<number | null>((resolve, reject) => {
        child.on('error', reject)
        child.on('close', resolve)
      })
      expect(code).toBe(70)
      expect(messages).toContainEqual(
        expect.objectContaining({ stage: 'database', kind: 'failed', code: 'startup-failed' })
      )
      const text = await readFile(join(root, 'main.log'), 'utf8')
      expect(text).toContain('uncaught backend failure')
      expect(text).toContain('"startupPhase":"database"')
      expect(text).toContain('fatal fixture')
      expect(text).toContain('"stack":')
      expect(text).toContain(event)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
  15000
)
