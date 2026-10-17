import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(__dirname, 'main.css'), 'utf8')

const channel = (hex: string, shift: number): number => {
  const value = parseInt(hex.slice(1), 16)
  const component = (value >> shift) & 255
  const unit = component / 255
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
}

const luminance = (hex: string): number =>
  0.2126 * channel(hex, 16) + 0.7152 * channel(hex, 8) + 0.0722 * channel(hex, 0)

const contrast = (foreground: string, background: string): number => {
  const lighter = Math.max(luminance(foreground), luminance(background))
  const darker = Math.min(luminance(foreground), luminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

describe('home theme tokens', () => {
  it('uses the Baselio green through shared tokens, not a one-off component color', () => {
    expect(css).toContain('--primary: #2b5e4a;')
    expect(css).toContain('--primary-foreground: #ffffff;')
    expect(css).toContain('--background: #f3f8f5;')
    expect(css).toContain('--bg-10: #f3f8f5;')
    expect(css).toContain('--dra-brand-name: var(--primary);')
    expect(css).toContain('--destructive: oklch(0.58 0.22 25);')
    expect(css).toContain('--warning-900: hsl(32 65% 28%);')
    expect(css).toContain('--danger-000: hsl(0 45% 38%);')
    expect(css).not.toContain('--primary: #2b5e4a;\n  --primary-foreground: #2b5e4a;')
  })

  it('keeps primary text and the wordmark at WCAG AA on the mint surface', () => {
    expect(contrast('#2b5e4a', '#f3f8f5')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#ffffff', '#2b5e4a')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#55665e', '#f3f8f5')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#8fcbb4', '#12241e')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#10241c', '#8fcbb4')).toBeGreaterThanOrEqual(4.5)
  })
})
