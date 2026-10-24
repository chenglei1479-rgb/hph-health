// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppLogo } from './AppLogo'

describe('AppLogo motion opt-in', () => {
  it('stays static by default and does not opt into hover when only busy is passed', () => {
    const { container, rerender } = render(<AppLogo />)
    expect(container.firstElementChild?.classList.contains('baselio-logo-interactive')).toBe(false)
    rerender(<AppLogo busy />)
    expect(container.firstElementChild?.classList.contains('baselio-logo-interactive')).toBe(false)
    expect(container.firstElementChild?.classList.contains('baselio-logo-busy')).toBe(true)
  })

  it('breathes only while an interactive logo is busy and resets when idle', () => {
    const { container, rerender, unmount } = render(<AppLogo interactive busy />)
    expect(container.firstElementChild?.classList.contains('baselio-logo-interactive')).toBe(true)
    expect(container.firstElementChild?.classList.contains('baselio-logo-busy')).toBe(true)
    rerender(<AppLogo interactive busy={false} />)
    expect(container.firstElementChild?.classList.contains('baselio-logo-busy')).toBe(false)
    unmount()
    expect(container.childElementCount).toBe(0)
  })
})
