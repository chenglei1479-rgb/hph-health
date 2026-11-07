import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { chmod, copyFile, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { cliResourceName, commandName, installRootName } from './debian-package-paths.mjs'

// #212 split: the platform-independent packaging contract is `deb-cli-launcher.test.ts` and runs in the
// `Unit tests (build)` job. Everything here needs a POSIX shell (`/bin/bash`) or a Linux
// `update-alternatives`, so it cannot run on the `windows-latest` runner and must not sit in a job whose
// readiness gate refuses skips. It has no CI job today; run it on a Linux host before touching the deb
// templates. `${executable}` and `${sanitizedProductName}` come from the shared derivation, not literals.
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

// Exercise the POSIX wrapper locally as well as on its Linux target.
describe.skipIf(process.platform === 'win32')('Debian CLI launcher', () => {
  it('runs the bundled CLI through ordinary Node without a desktop executable and preserves arguments and exit status', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'deb-cli-')))
    roots.push(root)
    const app = join(root, "Open-Science ' 数据")
    const resources = join(app, 'resources')
    const bin = join(root, 'bin')
    await mkdir(resources, { recursive: true })
    await mkdir(bin)
    // The name the config ships it under: `resources/<to>` from `linux.extraResources`.
    await copyFile(resolve('build/deb-cli-launcher'), join(resources, cliResourceName))
    await chmod(join(resources, cliResourceName), 0o755)
    await mkdir(join(resources, 'node-runtime'))
    const executable = join(resources, 'node-runtime/node')
    await writeFile(
      executable,
      '#!/bin/sh\nprintf "%s\\n" "$ELECTRON_RUN_AS_NODE" "$OPEN_SCIENCE_APP_PATH" "$@"\nexit 23\n',
      { mode: 0o755 }
    )
    const command = join(bin, commandName)
    await symlink(join(resources, cliResourceName), command)
    const result = spawnSync(command, ['run', '--prompt', 'spaces; $(never-run) "quoted"', ''], {
      encoding: 'utf8',
      env: {
        ...process.env,
        OPEN_SCIENCE_APP_PATH: '/wrong/application',
        ELECTRON_RUN_AS_NODE: '1',
        DISPLAY: ''
      }
    })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(23)
    expect(result.stderr).toBe('')
    expect(result.stdout.split('\n')).toEqual([
      '',
      '',
      join(resources, 'backend/cli.mjs'),
      'run',
      '--prompt',
      'spaces; $(never-run) "quoted"',
      '',
      ''
    ])
  })
})

// Run the real rendered post-install script with OS commands captured at the boundary.
// This is portable and never changes the host's alternatives, MIME database or sandbox mode.
it.skipIf(process.platform === 'win32')(
  'registers its CLI without cleaning old-brand alternatives',
  async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'deb-coexist-')))
    roots.push(root)
    const bin = join(root, 'bin')
    await mkdir(bin)
    const calls = join(root, 'calls')
    const command = join(root, 'usr/bin', commandName)
    const current = join(root, 'opt', installRootName)
    const oldTargets = ['Open Science', 'OpenScience'].flatMap((name) => [
      `${root}/opt/${name}/${commandName}`,
      `${root}/opt/${name}/resources/${cliResourceName}`
    ])
    const state = join(root, 'state')
    await writeFile(
      state,
      [
        `Link: ${command}`,
        ...[`${current}/${commandName}`, ...oldTargets].map((target) => `Alternative: ${target}`)
      ].join('\n') + '\n'
    )
    await writeFile(
      join(bin, 'update-alternatives'),
      `#!/bin/sh
if [ "$1" = '--query' ]; then cat "$FIXTURE_STATE"; else printf '%s\\n' "$@" >> "$FIXTURE_CALLS"; fi
`,
      { mode: 0o755 }
    )
    for (const name of [
      'chmod',
      'unshare',
      'update-mime-database',
      'update-desktop-database',
      'apparmor_status'
    ]) {
      await writeFile(join(bin, name), `#!/bin/sh\nexit ${name === 'apparmor_status' ? 1 : 0}\n`, {
        mode: 0o755
      })
    }
    const hook = join(root, 'install')
    await writeFile(
      hook,
      (await readFile('build/deb-after-install.tpl', 'utf8'))
        .replaceAll('${executable}', commandName)
        .replaceAll('${sanitizedProductName}', installRootName)
        .replaceAll('/usr/bin/', `${root}/usr/bin/`)
        .replaceAll('/etc/alternatives/', `${root}/etc/alternatives/`)
        .replaceAll('/opt/', `${root}/opt/`)
    )
    const result = spawnSync('/bin/bash', [hook, 'configure'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:/usr/bin:/bin`,
        FIXTURE_STATE: state,
        FIXTURE_CALLS: calls
      }
    })
    expect(result.status, result.stderr).toBe(0)
    expect((await readFile(calls, 'utf8')).trim().split('\n')).toEqual([
      '--install',
      command,
      commandName,
      `${current}/resources/${cliResourceName}`,
      '100',
      '--remove',
      commandName,
      `${current}/${commandName}`
    ])
  }
)

describe.skipIf(process.platform !== 'linux')('Debian alternatives lifecycle', () => {
  const fixture = async (): Promise<{
    root: string
    alternativeLink: string
    target: string
    legacy: string
    command: string
    run: (args: string[]) => SpawnSyncReturns<string>
    hook: (kind: string, argument: string) => SpawnSyncReturns<string>
  }> => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'deb-alternatives-')))
    roots.push(root)
    const bin = join(root, 'bin')
    const alternatives = join(root, 'etc/alternatives')
    const admin = join(root, 'var/lib/dpkg/alternatives')
    const resources = join(root, 'opt', installRootName, 'resources')
    for (const dir of [bin, alternatives, admin, resources, join(root, 'usr/bin')]) {
      await mkdir(dir, { recursive: true })
    }
    const legacy = join(root, 'opt', installRootName, commandName)
    const target = join(resources, cliResourceName)
    const command = join(root, 'usr/bin', commandName)
    await writeFile(legacy, 'legacy')
    await writeFile(target, 'cli')
    await writeFile(join(root, 'opt', installRootName, 'chrome-sandbox'), '')
    await writeFile(
      join(bin, 'update-alternatives'),
      `#!/bin/sh\nexec /usr/bin/update-alternatives --altdir '${alternatives}' --admindir '${admin}' "$@"\n`,
      { mode: 0o755 }
    )
    for (const [name, status] of [
      ['apparmor_status', 1],
      ['update-mime-database', 0],
      ['update-desktop-database', 0],
      ['unshare', 0]
    ]) {
      await writeFile(join(bin, String(name)), `#!/bin/sh\nexit ${status}\n`, { mode: 0o755 })
    }
    const env = { ...process.env, PATH: `${bin}:/usr/bin:/bin`, LC_ALL: 'C' }
    const run = (args: string[]): SpawnSyncReturns<string> =>
      spawnSync(join(bin, 'update-alternatives'), args, { env, encoding: 'utf8' })
    const scripts: Record<string, string> = {}
    for (const kind of ['install', 'remove']) {
      const text = (await readFile(`build/deb-after-${kind}.tpl`, 'utf8'))
        .replaceAll('${executable}', commandName)
        .replaceAll('${sanitizedProductName}', installRootName)
        .replaceAll('/usr/bin/', `${root}/usr/bin/`)
        .replaceAll('/etc/alternatives/', `${alternatives}/`)
        .replaceAll('/opt/', `${root}/opt/`)
        .replaceAll('/etc/apparmor.d/', `${root}/etc/apparmor.d/`)
      scripts[kind] = join(root, kind)
      await writeFile(scripts[kind], text)
    }
    const hook = (kind: string, argument: string): SpawnSyncReturns<string> =>
      spawnSync('/bin/bash', [scripts[kind], argument], { env, encoding: 'utf8' })
    return {
      root,
      // The alternatives link is named after the group, which is `${executable}` in the templates.
      alternativeLink: join(alternatives, commandName),
      target,
      legacy,
      command,
      run,
      hook
    }
  }

  it('supports fresh install, reinstall, upgrade postrm, remove and repeated purge', async () => {
    const f = await fixture()
    for (let i = 0; i < 2; i++) {
      expect(f.hook('install', 'configure').status).toBe(0)
      expect(await realpath(f.command)).toBe(f.target)
    }
    expect(f.hook('remove', 'upgrade').status).toBe(0)
    expect(await realpath(f.command)).toBe(f.target)
    await rm(f.target) // dpkg removes payload before postrm.
    expect(f.hook('remove', 'remove').status).toBe(0)
    await expect(realpath(f.command)).rejects.toThrow()
    expect(f.hook('remove', 'purge').status).toBe(0)
  })

  it.each(['auto', 'manual'])('migrates only the legacy %s alternative', async (mode) => {
    const f = await fixture()
    expect(f.run(['--install', f.command, commandName, f.legacy, '100']).status).toBe(0)
    if (mode === 'manual') expect(f.run(['--set', commandName, f.legacy]).status).toBe(0)
    expect(f.hook('install', 'configure').status).toBe(0)
    expect(await realpath(f.command)).toBe(f.target)
    const query = f.run(['--query', commandName]).stdout
    expect(query).not.toContain(`Alternative: ${f.legacy}\n`)
  })

  it('preserves another manually selected alternative through install and uninstall', async () => {
    const f = await fixture()
    const other = join(f.root, 'another-cli')
    await writeFile(other, 'user choice')
    expect(f.run(['--install', f.command, commandName, f.legacy, '100']).status).toBe(0)
    expect(f.run(['--install', f.command, commandName, other, '200']).status).toBe(0)
    expect(f.run(['--set', commandName, other]).status).toBe(0)
    expect(f.hook('install', 'configure').status).toBe(0)
    expect(await realpath(f.command)).toBe(other)
    expect(f.hook('remove', 'remove').status).toBe(0)
    expect(await realpath(f.command)).toBe(other)
  })

  it('fails closed when an unmanaged symlink replaces the command before uninstall', async () => {
    const f = await fixture()
    expect(f.hook('install', 'configure').status).toBe(0)
    await rm(f.command)
    await symlink(f.legacy, f.command)
    await rm(f.target)
    for (const phase of ['remove', 'purge']) {
      expect(f.hook('remove', phase).status).toBe(1)
      expect(await realpath(f.command)).toBe(f.legacy)
    }
  })

  it('preserves an unregistered replacement of the alternatives link itself', async () => {
    const f = await fixture()
    expect(f.hook('install', 'configure').status).toBe(0)
    const other = join(f.root, 'unregistered-cli')
    await writeFile(other, 'user command')
    await rm(f.alternativeLink)
    await symlink(other, f.alternativeLink)
    expect(f.hook('install', 'configure').status).toBe(1)
    expect(f.hook('remove', 'remove').status).toBe(1)
    expect(await realpath(f.command)).toBe(other)
  })

  it.each(['file', 'symlink'])('refuses to replace an unmanaged %s', async (kind) => {
    const f = await fixture()
    if (kind === 'file') await writeFile(f.command, 'user command')
    else await symlink(f.legacy, f.command)
    const { lstat, readFile, readlink } = await import('node:fs/promises')
    const before = await lstat(f.command)
    expect(f.hook('install', 'configure').status).toBe(1)
    expect((await lstat(f.command)).ino).toBe(before.ino)
    if (kind === 'file') expect(await readFile(f.command, 'utf8')).toBe('user command')
    else expect(await readlink(f.command)).toBe(f.legacy)
  })
})
