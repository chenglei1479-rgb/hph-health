import { expect, test } from '@playwright/test'

test('startup timeline, sidebar hover/busy priority, cleanup and reduced motion', async ({
  page
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/logo-motion.html')
  const loader = page.getByTestId('open-science-logo-loader')
  const mark = loader.locator('#mark')
  const wordmark = loader.locator('#wordmark')
  await expect(mark).toHaveCSS('animation-delay', '0s, 0.74s')
  await expect(wordmark).toHaveCSS('animation-delay', '0.26s')
  await expect(wordmark).toHaveCSS('animation-iteration-count', '1')
  await testInfo.attach('startup', {
    body: await loader.screenshot({
      animations: 'allow',
      path: testInfo.outputPath('startup.png')
    }),
    contentType: 'image/png'
  })
  const button = page.getByRole('button', { name: 'All projects' })
  const icon = button.locator('svg')
  await expect(icon).toHaveCSS('animation-name', 'none')
  await page.getByRole('button', { name: 'Toggle running' }).click()
  await expect(icon).toHaveCSS('animation-name', 'baselio-breathe')
  await expect(icon).toHaveCSS('animation-duration', '2.4s')
  await testInfo.attach('running', {
    body: await button.screenshot({
      animations: 'allow',
      path: testInfo.outputPath('running.png')
    }),
    contentType: 'image/png'
  })
  await button.hover()
  await expect(icon).toHaveCSS('animation-name', 'none')
  await expect.poll(() => icon.evaluate((el) => getComputedStyle(el).transform)).not.toBe('none')
  await testInfo.attach('hover', {
    body: await button.screenshot({ animations: 'allow', path: testInfo.outputPath('hover.png') }),
    contentType: 'image/png'
  })
  await page.mouse.move(600, 300)
  await expect(icon).toHaveCSS('animation-name', 'baselio-breathe')
  await page.keyboard.press('Shift+Tab')
  await expect(button).toBeFocused()
  await expect(icon).toHaveCSS('animation-name', 'none')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(icon).toHaveCSS('transform', 'none')
  await expect(mark).toHaveCSS('animation-name', 'none')
  await expect(wordmark).toHaveCSS('animation-name', 'none')
  await expect(page.getByRole('region', { name: 'Static logo' }).locator('svg')).toHaveCSS(
    'animation-name',
    'none'
  )
  await page.getByRole('button', { name: 'Toggle loader' }).click()
  await expect(loader).toHaveCount(0)
  expect(
    await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.effect instanceof KeyframeEffect && animation.effect.target?.id === 'mark'
          ).length
    )
  ).toBe(0)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByRole('button', { name: 'Toggle running' }).click()
  await expect(icon).toHaveCSS('animation-name', 'none')
})
