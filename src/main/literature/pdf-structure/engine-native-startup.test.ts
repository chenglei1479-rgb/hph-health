import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'esbuild'
import { expect, it } from 'vitest'

it('keeps application startup alive when the real package cannot load sharp', async () => {
  const cache = resolve('node_modules/.cache')
  await mkdir(cache, { recursive: true })
  const directory = await mkdtemp(join(cache, 'pdf-sharp-startup-'))
  try {
    const entry = join(directory, 'engine.mjs')
    await build({
      entryPoints: [fileURLToPath(new URL('./engine.ts', import.meta.url))],
      outfile: entry,
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external'
    })
    const probe = join(directory, 'probe.mjs')
    const report = join(directory, 'report.txt')
    await writeFile(
      probe,
      `
      import assert from 'node:assert/strict';
      import { writeFileSync } from 'node:fs';
      import { registerHooks } from 'node:module';
      let loads = 0;
      const broken = 'data:text/javascript,' + encodeURIComponent('throw new Error("Forced sharp native binding failure")');
      registerHooks({ resolve(specifier, context, nextResolve) {
        if (specifier === 'sharp') { loads++; return { url: broken, shortCircuit: true }; }
        return nextResolve(specifier, context);
      } });
      const { createPdfStructureEngine } = await import(${JSON.stringify(pathToFileURL(entry).href)});
      assert.equal(loads, 0);
      const engine = createPdfStructureEngine();
      assert.equal(loads, 0);
      await assert.rejects(engine.describe(), error =>
        error.message === 'PDF image processing is unavailable.' &&
        error.cause?.message === 'Forced sharp native binding failure');
      assert.ok(loads > 0);
      writeFileSync(${JSON.stringify(report)}, 'startup survived; fingerprint failure reported');
    `
    )
    await promisify(execFile)(process.execPath, [probe], {
      timeout: 15000,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    })
    expect(await readFile(report, 'utf8')).toBe('startup survived; fingerprint failure reported')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
