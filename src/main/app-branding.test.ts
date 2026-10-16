import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PRODUCT_DISPLAY_NAME } from '../shared/product-identity'

const projectRoot = resolve(__dirname, '../..')
const displayName = PRODUCT_DISPLAY_NAME
const appId = 'com.dra-hph.desktop'

describe('app display branding', () => {
  it('uses the configured display name in shell and workspace surfaces', () => {
    const mainSource = readFileSync(resolve(projectRoot, 'src/main/index.ts'), 'utf8')
    const windowsSource = readFileSync(resolve(projectRoot, 'src/main/windows.ts'), 'utf8')
    const rendererHtmlSource = readFileSync(resolve(projectRoot, 'src/renderer/index.html'), 'utf8')
    const builderSource = readFileSync(resolve(projectRoot, 'electron-builder.yml'), 'utf8')
    const packageSource = readFileSync(resolve(projectRoot, 'package.json'), 'utf8')
    const appConfigSource = readFileSync(resolve(projectRoot, 'src/shared/app-config.ts'), 'utf8')
    // The product name now anchors the home screen brand (the workspace sidebar shows the project).
    const homePageSource = readFileSync(
      resolve(projectRoot, 'src/renderer/src/pages/home/HomePage.tsx'),
      'utf8'
    )

    expect(mainSource).toContain('const APP_NAME = PRODUCT_DISPLAY_NAME')
    expect(windowsSource).toContain('title: PRODUCT_DISPLAY_NAME')
    expect(rendererHtmlSource).toContain(`<title>${displayName}</title>`)
    expect(builderSource).toContain(`productName: ${displayName}`)
    expect(builderSource).toContain(`CFBundleName: ${displayName}`)
    // Finder uses the installation label; CFBundleName stays aligned with Electron Helpers.
    expect(builderSource).toContain(`CFBundleDisplayName: ${displayName}`)
    expect(builderSource).toContain(`name: ${displayName}.app`)
    expect(packageSource).toContain(`"productName": "${displayName}"`)
    expect(appConfigSource).toContain('name: PRODUCT_DISPLAY_NAME')
    expect(homePageSource).toContain('APP.name')

    const webHtmlSource = readFileSync(resolve(projectRoot, 'src/renderer/web/index.html'), 'utf8')
    const manifestSource = readFileSync(
      resolve(projectRoot, 'src/renderer/web/public/manifest.webmanifest'),
      'utf8'
    )
    // The remote connection shell is a protocol surface. The desktop wordmark stays on the manifest.
    expect(webHtmlSource).toContain('<title>Open-Science Remote</title>')
    expect(webHtmlSource).not.toContain('open-science-connection-name')
    expect(manifestSource).toContain(`"short_name": "${displayName}"`)
  })

  it('keeps packaged data and credential names when the display name changes', () => {
    const mainSource = readFileSync(resolve(projectRoot, 'src/main/index.ts'), 'utf8')
    const profileSource = readFileSync(
      resolve(projectRoot, 'src/main/storage/electron-profile.ts'),
      'utf8'
    )
    const selectionSource = readFileSync(
      resolve(projectRoot, 'src/main/credential-identity/selection.ts'),
      'utf8'
    )
    const builderSource = readFileSync(resolve(projectRoot, 'electron-builder.yml'), 'utf8')
    const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8')) as {
      name: string
      productName: string
    }

    expect(mainSource).toContain('app.setName(identity.appName)')
    expect(mainSource).toContain('app.setName(app.isPackaged ? APP_NAME : `${APP_NAME} (DEV)`)')
    expect(mainSource).toContain("{ role: 'appMenu' }")
    expect(profileSource).toContain('MedResearch Agent')
    expect(profileSource).not.toContain('PRODUCT_DISPLAY_NAME')
    expect(selectionSource).toContain('`Open-Science${suffix}`')
    expect(selectionSource).toContain('`Open Science${suffix}`')
    expect(selectionSource).not.toContain('PRODUCT_DISPLAY_NAME')
    expect(selectionSource).not.toContain(displayName)
    expect(builderSource).toContain(`appId: ${appId}`)
    expect(builderSource).toContain('executableName: medresearch-agent')
    expect(builderSource).toContain('name: DRA Session package')
    expect(builderSource).toContain(
      'artifactName: deep-research-agent-${version}-win-${arch}.${ext}'
    )
    expect(builderSource).toContain(
      'artifactName: deep-research-agent-${version}-win-${arch}-setup.${ext}'
    )
    expect(builderSource).toContain(
      'artifactName: deep-research-agent-${version}-mac-${arch}.${ext}'
    )
    expect(packageJson.name).toBe('medresearch-agent')
    expect(packageJson.productName).toBe(displayName)
  })

  it('uses the stable app identifier for packaged and window integration metadata', () => {
    const mainSource = readFileSync(resolve(projectRoot, 'src/main/index.ts'), 'utf8')
    const builderSource = readFileSync(resolve(projectRoot, 'electron-builder.yml'), 'utf8')
    const updateSource = readFileSync(
      resolve(projectRoot, 'src/main/update/create-strategy.ts'),
      'utf8'
    )

    expect(mainSource).toContain(`const APP_USER_MODEL_ID = '${appId}'`)
    expect(builderSource).toContain(`appId: ${appId}`)
    expect(updateSource).toContain(`const OFFICIAL_MAC_BUNDLE_ID = '${appId}'`)
  })

  it('opens tall enough to show the complete first-run environment summary', () => {
    const windowsSource = readFileSync(resolve(projectRoot, 'src/main/windows.ts'), 'utf8')

    expect(windowsSource).toContain('height: 960')
    expect(windowsSource).toContain('minHeight: 720')
  })

  it('awaits Electron readiness inside the startup promise chain', () => {
    const mainSource = readFileSync(resolve(projectRoot, 'src/main/index.ts'), 'utf8')

    expect(mainSource).toContain('await app.whenReady()')
    expect(mainSource).not.toContain('app.whenReady().then')
  })
})
