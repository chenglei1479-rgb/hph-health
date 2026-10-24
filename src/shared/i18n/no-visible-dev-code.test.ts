import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { replaceVisibleDevelopmentCode } from '../product-identity'

const root = resolve(__dirname, '../../..')
const developmentCode = /(?<![\p{L}\p{N}_])DRA(?![\p{L}\p{N}_])/u

// Bypass surfaces are deliberately reviewed, rather than rewriting source translation keys.
const bypassFiles: string[] = [
  'src/main/notifications/electron-wiring.ts',
  'src/main/credential-identity/recovery.ts',
  'src/shared/update.ts',
  'src/shared/settings.ts',
  'src/renderer/src/components/database-startup-gate.tsx',
  'src/renderer/src/installation-assistant.ts',
  'src/main/cli-install/launcher.ts',
  'packages/environment/src/package-manager.ts',
  'packages/compute/src/slurm-driver.ts',
  'packages/compute/src/job-poller.ts',
  'packages/literature-citations/src/citation-style-library.ts',
  'src/main/artifacts/artifact-reproducibility-export.ts',
  'src/main/artifacts/ro-crate-export.ts',
  'src/main/agent-framework/codex-native-model-instructions.md',
  'src/main/backend-startup-recovery.ts',
  'src/main/session-package/service.ts',
  'src/main/session-package/ro-crate.ts',
  'src/main/session-package/desktop.ts',
  'src/main/acp/session-presentation-policy.ts',
  'src/main/acp/literature-reference-prompt.ts',
  'src/main/acp/image-input-compatibility-owner.ts',
  'src/main/acp/handoff-continuity-owner.ts',
  'src/main/acp/turn-skill-owner.ts',
  'src/main/notebook/host-model-service.ts',
  'src/main/settings/codex-bridge-tools.ts',
  'src/main/specialist/identity.ts',
  'src/main/specialist/marketplace/official-source.ts',
  'src/main/literature/mcp-server.ts',
  'src/main/literature/library-mcp-server.ts',
  'src/main/agent-framework/codebuddy.ts',
  'src/main/acp/runtime-plan-composition.ts',
  'src/main/session-plan/plan-mcp-server.ts',
  'src/main/notebook/managed-runtime-guard.ts',
  'src/main/notebook/execution-recovery.ts',
  'src/main/connectors/service.ts',
  'src/main/account/owner.ts',
  'src/main/web-service/http-server.ts',

  'packages/literature-citations/src/citation-exchange.ts',
  'scripts/prepare-dra-membership-workflows.cjs',
  'resources/skills/manifest.json',
  'resources/skills/biomedical-discovery/SKILL.md',
  'resources/skills/clinical-data-audit/SKILL.md',
  'resources/skills/dra-research-project/SKILL.md',
  'resources/skills/dra-research-project/kernel.py',
  'resources/skills/research-deliverables/SKILL.md'
]

// Each exception names the exact source line and why it is safe. Changes require review.
const exceptions: { file: string; line: string; reason: string }[] = [
  {
    file: 'src/shared/settings.ts',
    line: "description: replaceVisibleDevelopmentCode('The light DRA logo.', 'en')",
    reason:
      'Source key is retained for catalog consistency; replaceVisibleDevelopmentCode resolves it before preview metadata leaves shared settings.'
  },
  {
    file: 'src/shared/settings.ts',
    line: "description: replaceVisibleDevelopmentCode('The dark DRA logo.', 'en')",
    reason:
      'Source key is retained for catalog consistency; replaceVisibleDevelopmentCode resolves it before preview metadata leaves shared settings.'
  },
  {
    file: 'src/main/agent-framework/codebuddy.ts',
    line: "// TaskStop, WebFetch, and WebSearch stay absent so native capabilities cannot bypass DRA's",
    reason: 'Internal comment; not rendered, exported, or sent to a model.'
  },
  {
    file: 'src/main/connectors/service.ts',
    line: "'Mozilla/5.0 (compatible; DRA/1.0; +https://github.com/chenglei1479-rgb/hph-health)'",
    reason: 'Existing User-Agent left unchanged pending external-service identification review.'
  },
  {
    file: 'src/main/account/owner.ts',
    line: "if (state.required && !state.user) throw new Error('DRA account login required.')",
    reason:
      'Internal account-login sentinel used in routing and compatibility checks; visible browser copy uses the public name.'
  },
  {
    file: 'src/main/account/owner.ts',
    line: "message !== 'DRA account login required.'",
    reason:
      'Internal account-login sentinel used in routing and compatibility checks; visible browser copy uses the public name.'
  },
  {
    file: 'src/main/web-service/http-server.ts',
    line: "socket.close(1008, 'DRA account login required')",
    reason:
      'Internal account-login sentinel used in routing and compatibility checks; visible browser copy uses the public name.'
  },
  {
    file: 'packages/literature-citations/src/citation-exchange.ts',
    line: "const readableLiteralNamePrefixes = [literalNamePrefix, 'DRA literal creator: ']",
    reason: 'Read historical RIS notes without changing their structured corporate-creator meaning.'
  },
  {
    file: 'src/main/notifications/electron-wiring.ts',
    line: "deps.translate?.('System notifications from DRA are working.') ??",
    reason: 'Translated notification source key; only the fallback bypasses i18next.'
  },
  {
    file: 'src/main/credential-identity/recovery.ts',
    line: "'DRA could not safely access existing encrypted data. Unlock the system credential store or restore the original key and profile, then restart. Existing credentials have not been replaced.'",
    reason: 'createNativeI18n runs before this translate call, including early recovery.'
  },
  {
    file: 'src/shared/update.ts',
    line: "'DRA is running on a read-only disk. Drag it to Applications, quit this copy, and reopen it from Applications before updating.'",
    reason: 'Source key translated by UpdateDialog; updater paths consume the same message.'
  },
  {
    file: 'src/renderer/src/components/database-startup-gate.tsx',
    line: "const UNAVAILABLE_STARTUP_MESSAGE = 'DRA could not finish checking its database.'",
    reason: 'Source keys and guidance are rendered with t(error.message), t(guidance.how), or t().'
  },
  {
    file: 'src/renderer/src/components/database-startup-gate.tsx',
    line: "how: 'Update DRA to the latest version, then relaunch. Your data is intact and will open in the newer version.'",
    reason: 'Source keys and guidance are rendered with t(error.message), t(guidance.how), or t().'
  },
  {
    file: 'src/renderer/src/components/database-startup-gate.tsx',
    line: 'how: "Reinstall DRA. Your data folder is stored separately and won\'t be touched."',
    reason: 'Source keys and guidance are rendered with t(error.message), t(guidance.how), or t().'
  },
  {
    file: 'src/renderer/src/components/database-startup-gate.tsx',
    line: "how: 'Quit other copies of DRA, check free disk space and folder permissions, then retry.'",
    reason: 'Source keys and guidance are rendered with t(error.message), t(guidance.how), or t().'
  },
  {
    file: 'src/renderer/src/components/database-startup-gate.tsx',
    line: "how: 'Retry. If it keeps happening, fully quit DRA and start it again.'",
    reason: 'Source keys and guidance are rendered with t(error.message), t(guidance.how), or t().'
  },
  {
    file: 'src/renderer/src/components/database-startup-gate.tsx',
    line: "? t('Starting DRA…')",
    reason: 'Source keys and guidance are rendered with t(error.message), t(guidance.how), or t().'
  },
  {
    file: 'src/renderer/src/components/database-startup-gate.tsx',
    line: "{t('Keep DRA open while this finishes.')}",
    reason: 'Source keys and guidance are rendered with t(error.message), t(guidance.how), or t().'
  },
  {
    file: 'src/renderer/src/components/database-startup-gate.tsx',
    line: 'title={t("DRA couldn\'t start")}',
    reason: 'Source keys and guidance are rendered with t(error.message), t(guidance.how), or t().'
  },
  {
    file: 'src/renderer/src/components/database-startup-gate.tsx',
    line: "'Review and edit the redacted report in DRA before opening GitHub.'",
    reason: 'Source keys and guidance are rendered with t(error.message), t(guidance.how), or t().'
  },
  {
    file: 'src/renderer/src/installation-assistant.ts',
    line: "reason === 'update' ? t('Install DRA before updating') : t('Finish installing DRA')",
    reason: 'DOM text and aria labels are assigned after t(); drag payload uses the public name.'
  },
  {
    file: 'src/renderer/src/installation-assistant.ts',
    line: "'Drag DRA to Applications. You can continue using this copy without installing.'",
    reason: 'DOM text and aria labels are assigned after t(); drag payload uses the public name.'
  },
  {
    file: 'src/renderer/src/installation-assistant.ts',
    line: "sourceIcon.setAttribute('aria-label', t('Drag DRA to Applications'))",
    reason: 'DOM text and aria labels are assigned after t(); drag payload uses the public name.'
  },
  {
    file: 'src/renderer/src/installation-assistant.ts',
    line: "title.textContent = t('DRA is installed')",
    reason: 'DOM text and aria labels are assigned after t(); drag payload uses the public name.'
  },
  {
    file: 'src/renderer/src/installation-assistant.ts',
    line: "'Quit this copy and reopen DRA from Applications to enable updates.'",
    reason: 'DOM text and aria labels are assigned after t(); drag payload uses the public name.'
  },
  {
    file: 'src/renderer/src/installation-assistant.ts',
    line: "'DRA could not be installed in Applications. Drag it there in Finder, or continue using this copy.'",
    reason: 'DOM text and aria labels are assigned after t(); drag payload uses the public name.'
  },
  {
    file: 'src/main/cli-install/launcher.ts',
    line: '/^(# |rem )(?:DRA|Open-Science) command-line launcher\\./,',
    reason: 'Historical ownership matching must keep old launcher signatures repairable.'
  },
  {
    file: 'src/main/session-package/desktop.ts',
    line: "'This Session package requires a newer version of DRA. Update DRA, then try importing it again.'",
    reason: 'Version error is passed to this.options.translate before being displayed.'
  }
]

describe('no user-visible development code', () => {
  for (const filename of readdirSync(resolve(__dirname, 'locales')).filter((f) =>
    f.endsWith('.json')
  )) {
    it(`replaces development code in every ${filename} catalog value`, () => {
      const catalog = JSON.parse(
        readFileSync(resolve(__dirname, 'locales', filename), 'utf8')
      ) as Record<string, Record<string, string>>
      const locale = filename.slice(0, -5)
      const remaining: string[] = []
      for (const [namespace, entries] of Object.entries(catalog)) {
        for (const [key, value] of Object.entries(entries)) {
          if (developmentCode.test(replaceVisibleDevelopmentCode(value, locale)))
            remaining.push(`${namespace}: ${key}`)
        }
      }
      expect(remaining).toEqual([])
    })
  }

  const files = [
    ...bypassFiles,
    ...(
      JSON.parse(readFileSync(resolve(root, 'resources/specialists/manifest.json'), 'utf8')) as {
        specialists: string[]
      }
    ).specialists.map((id) => `resources/specialists/${id}/specialist.json`),
    ...readdirSync(resolve(root, 'build'))
      .filter((f) => f.endsWith('.svg') || /^license_.*\.txt$/.test(f))
      .map((f) => `build/${f}`),
    ...readdirSync(resolve(root, 'packages/connector-builtins/src/encori'))
      .filter((f) => f.endsWith('.ts') && !f.includes('.test.'))
      .map((f) => `packages/connector-builtins/src/encori/${f}`)
  ]
  it.each(files)('keeps untranslated surface %s free of the development code', (file) => {
    const violations = readFileSync(resolve(root, file), 'utf8')
      .split(/\r?\n/)
      .flatMap((line, index) =>
        developmentCode.test(line) &&
        !exceptions.some(
          (entry) => entry.file === file && entry.line === line.trim() && entry.reason.length > 0
        )
          ? [`${file}:${index + 1}: ${line.trim()}`]
          : []
      )
    expect(violations).toEqual([])
  })

  it('does not retain stale exceptions', () => {
    for (const entry of exceptions) {
      expect(files).toContain(entry.file)
      expect(
        readFileSync(resolve(root, entry.file), 'utf8')
          .split(/\r?\n/)
          .map((line) => line.trim())
      ).toContain(entry.line)
    }
  })
})
