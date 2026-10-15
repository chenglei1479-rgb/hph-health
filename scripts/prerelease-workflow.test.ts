import { readFileSync } from 'node:fs'

import { load } from 'js-yaml'
import { expect, it } from 'vitest'

type Step = {
  env?: Record<string, string>
  name?: string
  run?: string
  uses?: string
}

type Job = {
  if?: string
  needs?: string | string[]
  'runs-on'?: string
  permissions?: Record<string, string>
  steps?: Step[]
  strategy?: {
    matrix?: {
      include?: Array<{
        arch?: string
        artifact?: string
        label?: string
        os?: string
        platform?: string
        target?: string
      }>
    }
  }
}

type Workflow = {
  jobs: Record<string, Job>
  on?: {
    push?: { tags?: string[] }
    workflow_dispatch?: { inputs?: { tag?: { required?: boolean } } }
  }
  permissions?: Record<string, string>
}

const workflow = load(readFileSync('.github/workflows/prerelease.yml', 'utf8')) as Workflow

it('builds unsigned macOS dmg and Windows NSIS packages and publishes a prerelease', () => {
  expect(workflow.on?.push?.tags).toEqual(['v*-beta*'])
  expect(workflow.on?.workflow_dispatch?.inputs?.tag?.required).toBe(true)
  expect(workflow.permissions).toEqual({ contents: 'read' })

  const build = workflow.jobs.build
  expect(build?.['runs-on']).toBe('${{ matrix.os }}')
  const targets = build?.strategy?.matrix?.include ?? []
  expect(targets).toEqual([
    { os: 'macos-latest', label: 'macOS arm64 dmg', platform: 'mac', target: 'dmg', arch: 'arm64' },
    { os: 'macos-15-intel', label: 'macOS x64 dmg', platform: 'mac', target: 'dmg', arch: 'x64' },
    {
      os: 'windows-latest',
      label: 'Windows x64 NSIS',
      platform: 'win',
      target: 'nsis',
      arch: 'x64'
    }
  ])

  const install = build?.steps?.find((step) => step.name === 'Install dependencies')
  expect(install?.run).toBe('node scripts/ci/npm-ci.mjs --install-links')

  const buildApp = build?.steps?.find((step) => step.name === 'Build the app')
  expect(buildApp?.env).toEqual({ NODE_OPTIONS: '--max-old-space-size=6144' })
  expect(buildApp?.run).toContain('npm run build:web')
  expect(buildApp?.run).toContain('npx electron-vite build')

  const names = build?.steps?.map((step) => step.name)
  const buildIndex = names?.indexOf('Build the app') ?? -1
  const pythonIndex = names?.indexOf('Bundle the offline schema-notebook Python') ?? -1
  const packageIndex = names?.indexOf('Package unsigned installers') ?? -1
  expect(buildIndex).toBeGreaterThanOrEqual(0)
  expect(pythonIndex).toBeGreaterThan(buildIndex)
  expect(packageIndex).toBeGreaterThan(pythonIndex)

  const bundlePython = build?.steps?.[pythonIndex]
  expect(bundlePython?.run).toBe('node scripts/stage-schema-notebook-python.mjs')
  expect(bundlePython?.env).toEqual({
    SCHEMA_NOTEBOOK_PLATFORM: '${{ matrix.platform }}',
    SCHEMA_NOTEBOOK_ARCH: '${{ matrix.arch }}'
  })

  const packageStep = build?.steps?.[packageIndex]
  expect(packageStep?.env).toEqual({ NODE_OPTIONS: '--max-old-space-size=6144' })
  expect(packageStep?.run).toContain('build/prerelease-electron-builder.cjs')
  expect(packageStep?.run).toContain('--${{ matrix.platform }}')
  const raw = readFileSync('.github/workflows/prerelease.yml', 'utf8')
  expect(raw).not.toContain('--max-old-space-size=8192')
  expect(raw).toContain("CSC_IDENTITY_AUTO_DISCOVERY: 'false'")
  expect(raw).toContain("DRA_PRERELEASE: '1'")
  expect(raw).not.toMatch(/^\s*CSC_LINK:/m)
  expect(raw).toContain('Prerelease builds must not use a signing certificate.')

  const release = workflow.jobs.release
  expect(release?.permissions).toEqual({ contents: 'write' })
  const publish = release?.steps?.find((step) => step.name === 'Publish the GitHub prerelease')
  expect(publish?.run).toContain('--prerelease')
  expect(publish?.run).toContain('build/prerelease-release-notes.md')
})

it('launches the packaged app on Windows, Apple silicon, and Intel macOS before publishing', () => {
  expect(workflow.on).toHaveProperty('pull_request')
  const smoke = workflow.jobs.smoke
  expect(smoke?.needs).toBe('build')
  expect(smoke?.strategy?.matrix?.include).toEqual([
    { os: 'windows-latest', label: 'Windows x64', artifact: 'dra-x64-win' },
    { os: 'macos-14', label: 'macOS arm64', artifact: 'dra-arm64-mac' },
    { os: 'macos-15-intel', label: 'macOS x64', artifact: 'dra-x64-mac' }
  ])
  const launch = smoke?.steps?.find(
    (step) => step.name === 'Launch the packaged app and wait for home'
  )
  expect(launch?.run).toContain('scripts/ci/packaged-startup-smoke.mjs')
  expect(launch?.run).toContain('--timeout-ms 240000')

  const release = workflow.jobs.release
  expect(release?.needs).toEqual(['build', 'smoke'])
  expect(release?.if).toBe("github.event_name != 'pull_request'")
  const raw = readFileSync('.github/workflows/prerelease.yml', 'utf8')
  expect(raw).toContain('macos-13, the previous free Intel image, was removed in December 2025.')
})

it('writes the release body in Japanese and Chinese', () => {
  const notes = readFileSync('build/prerelease-release-notes.md', 'utf8')
  expect(notes).toContain('署名されていない内部テスト用ビルド')
  expect(notes).toContain('病院の PC')
  expect(notes).toContain('240 症例の再入院データセット')
  expect(notes).toContain('実際の患者データは決して使わない')
  expect(notes).toContain('初回起動時にダウンロードしません')
  expect(notes).toContain('lifelines')
  expect(notes).toContain(
    '架空データのみ。リクエストは設定した AI サービス（OpenAI の場合は米国）へ送信されます。利用料金はご自身の契約先から請求されます。'
  )
  expect(notes).toContain('https://platform.openai.com/api-keys')
  expect(notes).toContain('Create new secret key')
  expect(notes).toContain('右クリック')
  expect(notes).toContain('このまま開く')
  expect(notes).toContain('詳細情報')
  expect(notes).toContain('这是未签名的内部测试版本')
  expect(notes).toContain('医院电脑')
  expect(notes).toContain('240 例再入院数据集')
  expect(notes).toContain('切勿使用真实患者数据')
  expect(notes).toContain('首次启动不会下载')
  expect(notes).toContain(
    '仅使用虚构数据。请求会发送到您设置的 AI 服务（如果是 OpenAI，则发送到美国）。'
  )
  expect(notes).toContain('右键')
  expect(notes).toContain('仍要打开')
  expect(notes).toContain('更多信息')
  expect(notes).toContain('仍要运行')
})
