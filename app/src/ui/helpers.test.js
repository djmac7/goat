import { describe, it, expect, afterEach } from 'vitest'
import { computeOvr, setOvrAnchor } from './helpers.js'

afterEach(() => setOvrAnchor(null)) // restore the built-in anchor

describe('era-fair OVR anchor', () => {
  it('default anchor: 588 maps to 99, clamped at both ends', () => {
    expect(computeOvr(588)).toBe(99)
    expect(computeOvr(594)).toBe(99)
    expect(computeOvr(470)).toBe(78)
    expect(computeOvr(0)).toBe(40)
  })

  it('a lower era anchor makes the same total score higher (easier pool threshold)', () => {
    const base = computeOvr(580)
    setOvrAnchor(582)
    expect(computeOvr(582)).toBe(99)
    expect(computeOvr(580)).toBeGreaterThan(base)
  })

  it('ignores invalid anchors and falls back to the default', () => {
    setOvrAnchor(NaN)
    expect(computeOvr(588)).toBe(99)
    setOvrAnchor(100) // below the curve's low total — nonsensical, rejected
    expect(computeOvr(588)).toBe(99)
  })
})
