import { existsSync, readFileSync } from 'node:fs'

import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'

// #212: the Debian packaging contract that does not need a Linux host. The POSIX wrapper and the real
// `update-alternatives` lifecycle live in `deb-cli-launcher.posix.test.ts`; those cannot run on the
// `windows-latest` runner that owns the `Unit tests (build)` job, so they are separate rather than
// skipped - a report-wide "no skips" gate cannot tell a legitimate platform skip from a silenced one.
const read = (path: string): string => readFileSync(path, 'utf8')

type PackagingConfig = {
  deb: { afterInstall: string; afterRemove: string }
  linux: { executableName?: string; extraResources: { from: string; to: string }[] }
}

const config = (): PackagingConfig => load(read('electron-builder.yml')) as PackagingConfig

// The CLI resource the deb templates register with `update-alternatives`, as
// `/opt/${sanitizedProductName}/resources/<name>`. Only the registration counts, not every path under
// `resources/` (the AppArmor profile lives there too). The install hook passes the `cli_target`
// variable, the remove hook passes the literal, so both shapes are read.
const registeredCliResources = (text: string): string[] => [
  ...new Set([
    ...[...text.matchAll(/^cli_target='\/opt\/\$\{sanitizedProductName\}\/resources\/([^']+)'$/gmu)].map(
      (match) => match[1]
    ),
    ...[
      ...text.matchAll(
        /^.*update-alternatives --(?:install|remove)[^\n]*\/opt\/\$\{sanitizedProductName\}\/resources\/([^'"\s]+)/gmu
      )
    ].map((match) => match[1])
  ])
]

describe('Debian packaging contract', () => {
  it('keeps the upstream sandbox, MIME and AppArmor setup and installs a separate CLI entry', () => {
    const loaded = config()
    expect(loaded.deb.afterInstall).toBe('build/deb-after-install.tpl')
    expect(loaded.deb.afterRemove).toBe('build/deb-after-remove.tpl')
    // The command must stay `medresearch-agent` (metadata.name); declaring a Linux executableName would
    // silently move /usr/bin and the alternatives group.
    expect(loaded.linux.executableName).toBeUndefined()
    expect(loaded.linux.extraResources).toContainEqual({
      from: 'build/deb-cli-launcher',
      to: 'medresearch-agent-cli'
    })
    for (const [filename, marker] of [
      ['after-install.tpl', '# Check if user namespaces'],
      ['after-remove.tpl', 'APPARMOR_PROFILE_DEST=']
    ]) {
      const upstream = read(`node_modules/app-builder-lib/templates/linux/${filename}`)
      const owned = read(`build/deb-${filename}`)
      expect(owned.slice(owned.indexOf(marker)).trim()).toBe(
        upstream.slice(upstream.indexOf(marker)).trim()
      )
    }
  })

  // #212: the guard that would have caught this. `#33` renamed the resource in the config and left both
  // deb scripts pointing at `medresearch-agent-cli`, so the deb installed successfully and left
  // `/usr/bin/medresearch-agent` on a path nothing wrote (`update-alternatives --install` does not check
  // that its target exists). A guard that pins the config but not the scripts that consume it cannot see
  // that class of drift, so this one reads all three files and requires them to agree.
  it('registers an alternatives target that the package actually ships', () => {
    const shipped = config().linux.extraResources.filter(
      (resource) => resource.from === 'build/deb-cli-launcher'
    )
    expect(shipped).toHaveLength(1)
    expect(existsSync(shipped[0].from), shipped[0].from).toBe(true)

    const registered = {
      'build/deb-after-install.tpl': registeredCliResources(read('build/deb-after-install.tpl')),
      'build/deb-after-remove.tpl': registeredCliResources(read('build/deb-after-remove.tpl'))
    }
    for (const [file, names] of Object.entries(registered)) {
      expect(names, `${file} must name exactly one CLI resource`).toEqual([shipped[0].to])
    }
  })
})
