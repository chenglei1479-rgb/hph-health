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
    expect(mark.querySelector('#mark')).not.toBeNull()
    expect(mark.querySelector('#wordmark')).not.toBeNull()
    expect(mark.querySelector('canvas')).toBeNull()
    expect(mark.getAttribute('aria-hidden')).toBe('true')
    unmount()
  })

  it('enters each part once, then breathes only the mark; reduced motion is static', () => {
    expect(css).toContain('baselio-mark-in 480ms cubic-bezier(0.2, 0.7, 0.2, 1) both')
    expect(css).toContain('baselio-wordmark-in 420ms cubic-bezier(0.2, 0.7, 0.2, 1) 260ms both')
    expect(css).toContain('baselio-breathe 2.4s ease-in-out 740ms infinite')
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*#mark,[\s\S]*#wordmark\s*\{\s*animation: none;/
    )
  })
})
