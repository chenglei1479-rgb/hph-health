import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Read the same NSIS language bundle electron-builder uses; never download during this export.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const nsisDir = process.env.NSISDIR
if (!nsisDir) throw new Error('Set NSISDIR to the electron-builder NSIS bundle directory.')
const custom = readFileSync(join(root, 'build/installer-strings.nsh'), 'utf8')
const languages = [
  ['ja_JP', '1041', 'Japanese'],
  ['zh_CN', '2052', 'SimpChinese'],
  ['en_US', '1033', 'English']
]
const output = [
  '# Baselio installer text export',
  '',
  'Generated with `NSISDIR=<electron-builder NSIS bundle> node scripts/export-installer-copy.ts`.',
  '',
  'Source: electron-builder 26.15.3, NSIS 3.0.4.1. This is a source-backed text export, not a Windows screenshot. Runtime file paths and error codes remain placeholders. NSIS ampersands mark keyboard shortcuts.',
  '',
  'Installer flow: language selector → informational Apache license → directory → installation → finish. There is no separate installer welcome page. The install-mode page is bypassed by the existing forced current-user hook. License/directory pages are skipped for updates by electron-builder. The uninstaller has welcome, progress, and finish pages.',
  '',
  'The selector uses the Windows UI language when supported and English otherwise. It remains visible for interactive installs so the user can choose another language; silent invocations remain silent.',
  ''
]
const groups = [
  [
    'Directory',
    [
      'MUI_TEXT_DIRECTORY_TITLE',
      'MUI_TEXT_DIRECTORY_SUBTITLE',
      '^DirText',
      '^DirBrowseText',
      '^SpaceRequired',
      '^SpaceAvailable'
    ]
  ],
  [
    'Installation progress / result',
    [
      'MUI_TEXT_INSTALLING_TITLE',
      'MUI_TEXT_INSTALLING_SUBTITLE',
      'MUI_TEXT_FINISH_TITLE',
      'MUI_TEXT_FINISH_SUBTITLE',
      'MUI_TEXT_ABORT_TITLE',
      'MUI_TEXT_ABORT_SUBTITLE'
    ]
  ],
  [
    'Finish',
    [
      'MUI_TEXT_FINISH_INFO_TITLE',
      'MUI_TEXT_FINISH_INFO_TEXT',
      'MUI_TEXT_FINISH_INFO_REBOOT',
      'MUI_TEXT_FINISH_RUN',
      'MUI_TEXT_FINISH_REBOOTNOW',
      'MUI_TEXT_FINISH_REBOOTLATER',
      'MUI_TEXT_FINISH_INFO_LINK'
    ]
  ],
  ['Uninstall welcome', ['MUI_UNTEXT_WELCOME_INFO_TITLE', 'MUI_UNTEXT_WELCOME_INFO_TEXT']],
  [
    'Uninstall progress / result',
    [
      'MUI_UNTEXT_UNINSTALLING_TITLE',
      'MUI_UNTEXT_UNINSTALLING_SUBTITLE',
      'MUI_UNTEXT_FINISH_TITLE',
      'MUI_UNTEXT_FINISH_SUBTITLE',
      'MUI_UNTEXT_ABORT_TITLE',
      'MUI_UNTEXT_ABORT_SUBTITLE'
    ]
  ],
  [
    'Uninstall finish',
    ['MUI_UNTEXT_FINISH_INFO_TITLE', 'MUI_UNTEXT_FINISH_INFO_TEXT', 'MUI_UNTEXT_FINISH_INFO_REBOOT']
  ],
  [
    'Navigation / captions',
    [
      '^SetupCaption',
      '^UninstallCaption',
      '^BackBtn',
      '^NextBtn',
      '^InstallBtn',
      '^UninstallBtn',
      '^CancelBtn',
      '^CloseBtn',
      '^BrowseBtn',
      '^ShowDetailsBtn',
      'MUI_BUTTONTEXT_FINISH'
    ]
  ]
]
const readable = (value: string, builtin: Map<string, string>): string =>
  value
    .replaceAll('$(^NameDA)', 'Baselio')
    .replaceAll('$(^Name)', 'Baselio')
    .replaceAll('$(^ClickNext)', builtin.get('^ClickNext') ?? '$(^ClickNext)')
    .replaceAll('$_CLICK', builtin.get('^ClickNext') ?? '$_CLICK')
    .replaceAll('$\\r$\\n', '\n')
    .replaceAll('$\\"', '"')
const emit = (key: string, value: string, builtin: Map<string, string>): void => {
  output.push(`**${key}**`, '', '```text', readable(value, builtin), '```', '')
}
for (const [locale, lcid, name] of languages) {
  const directory = join(nsisDir, 'Contrib/Language files')
  const mui = readFileSync(join(directory, name + '.nsh'), 'utf8')
  const nlf = readFileSync(join(directory, name + '.nlf'), 'utf8')
  const builtin = new Map(
    [...nlf.matchAll(/^# (\^\w+)\r?\n([^\r\n]*)/gm)].map(([, key, value]) => [key, value])
  )
  for (const [, key, value] of mui.matchAll(/\$\{LangFileString\} (\w+) "(.*)"/g))
    builtin.set(key, value)
  output.push(`## ${locale}`, '', '### License page', '')
  const strings = [...custom.matchAll(/^LangString (\w+) (\d+) "(.*)"$/gm)].filter(
    ([, , language]) => language === lcid
  )
  for (const [, key, , value] of strings.filter(([, key]) => key.startsWith('BaselioLicense')))
    emit(key, value, builtin)
  const license = readFileSync(join(root, `build/license_${locale}.txt`), 'utf8').replace(
    /^\uFEFF/,
    ''
  )
  output.push(
    'License body: `' + `build/license_${locale}.txt` + '`; the introductory paragraph is:',
    '',
    license.split('\n\n')[0],
    '',
    'It is followed by the complete, byte-identical English `LICENSE`, including its existing copyright notice. The license page uses the localized Next button; it does not request agreement.',
    ''
  )
  for (const [group, keys] of groups) {
    output.push(`### ${group}`, '')
    for (const key of keys) if (builtin.has(key)) emit(key, builtin.get(key), builtin)
  }
  output.push('### Custom recovery dialogs and detail log', '')
  for (const [, key, , value] of strings.filter(([, key]) => !key.startsWith('BaselioLicense')))
    emit(key, value, builtin)
}
const destination = join(root, 'docs/packaging/installer-copy.md')
mkdirSync(dirname(destination), { recursive: true })
writeFileSync(destination, output.join('\n'))
