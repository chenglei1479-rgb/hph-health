// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { OpenScienceLogoLoader } from './OpenScienceLogoLoader'

// CSS owns both the one-shot entrance and live reduced-motion preference changes.
const css = readFileSync(resolve(__dirname, 'baselio-splash.css'), 'utf8')

describe('Baselio splash', () => {
  it('renders the supplied flat horizontal vector and keeps the recovery test id', () => {
    const { unmount } = render(<OpenScienceLogoLoader />)
    const mark = screen.getByTestId('open-science-logo-loader')
    const supplied = readFileSync(resolve(__dirname, '../assets/baselio-horizontal.svg'), 'utf8')
    const expected = document.createElement('div')
    expected.innerHTML = supplied
    expect(mark.innerHTML).toBe(expected.innerHTML)
    expect(mark.querySelector('canvas')).toBeNull()
    expect(mark.getAttribute('aria-hidden')).toBe('true')
    unmount()
  })

  it('enters once within 600ms and displays statically with reduced motion', () => {
    const duration = Number(css.match(/animation: baselio-in (\d+)ms/)?.[1])
    expect(duration).toBeGreaterThan(0)
    expect(duration).toBeLessThanOrEqual(600)
    expect(css).not.toContain('infinite')
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.baselio-splash-mark\s*\{\s*animation: none;/
    )
    expect(css).toMatch(/to\s*\{\s*opacity: 1;\s*transform: none;/)
  })
})
