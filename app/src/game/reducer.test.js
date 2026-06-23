import { describe, it, expect } from 'vitest'
import { reducer, initialState } from './reducer.js'
import { ABILITY_KEYS } from '../constants.js'

// Play a full legal game of 6 forced assignments. Team/Year are independent; here we just
// feed explicit franchise/season per spin (the controller supplies these from the grid).
function playGame({ ratings = ABILITY_KEYS.map((_, i) => (i + 1) * 10), assignOrder = ABILITY_KEYS } = {}) {
  let s = reducer(initialState(), { type: 'NEW_GAME', franchise: 'CHI', season: 1996, ceilingTotal: 600 })
  s = reducer(s, { type: 'SETTLE' })
  assignOrder.forEach((ability, i) => {
    const last = i === assignOrder.length - 1
    s = reducer(s, {
      type: 'ASSIGN', playerId: `p${i}`, ability, rating: ratings[i],
      nextFranchise: last ? null : 'LAL', nextSeason: last ? null : 2001,
    })
    if (!last) s = reducer(s, { type: 'SETTLE' })
  })
  return s
}

describe('reducer — lifecycle', () => {
  it('starts in the start phase with six open slots in fixed ability order', () => {
    const s = initialState()
    expect(s.phase).toBe('start')
    expect(s.slots.map((x) => x.ability)).toEqual(ABILITY_KEYS)
    expect(s.slots.every((x) => x.status === 'open')).toBe(true)
  })

  it('NEW_GAME -> spinning (axis both), SETTLE -> roster', () => {
    let s = reducer(initialState(), { type: 'NEW_GAME', franchise: 'CHI', season: 1996, ceilingTotal: 600 })
    expect(s.phase).toBe('spinning')
    expect(s.spinAxis).toBe('both')
    expect(s.currentFranchise).toBe('CHI')
    expect(s.currentSeason).toBe(1996)
    s = reducer(s, { type: 'SETTLE' })
    expect(s.phase).toBe('roster')
  })
})

describe('reducer — invariants (§3)', () => {
  it('exactly 6 assignments end the game; never 5, never 7', () => {
    let s = reducer(initialState(), { type: 'NEW_GAME', franchise: 'CHI', season: 1996, ceilingTotal: 600 })
    s = reducer(s, { type: 'SETTLE' })
    for (let i = 0; i < 5; i++) {
      s = reducer(s, { type: 'ASSIGN', playerId: `p${i}`, ability: ABILITY_KEYS[i], rating: 10, nextFranchise: 'LAL', nextSeason: 2001 })
      s = reducer(s, { type: 'SETTLE' })
    }
    expect(s.phase).toBe('roster')
    expect(s.slots.filter((x) => x.status === 'filled')).toHaveLength(5)

    s = reducer(s, { type: 'ASSIGN', playerId: 'p5', ability: ABILITY_KEYS[5], rating: 10, nextFranchise: null, nextSeason: null })
    expect(s.phase).toBe('reveal')
    expect(s.slots.every((x) => x.status === 'filled')).toBe(true)

    const after = reducer(s, { type: 'ASSIGN', playerId: 'p6', ability: ABILITY_KEYS[0], rating: 99 })
    expect(after).toBe(s)
  })

  it('records one player per filled slot', () => {
    const s = playGame()
    expect(s.usedPlayerIds).toHaveLength(6)
  })

  it('allows drafting the same player into more than one slot (no one-player-once rule)', () => {
    let s = reducer(initialState(), { type: 'NEW_GAME', franchise: 'CHI', season: 1996, ceilingTotal: 600 })
    s = reducer(s, { type: 'SETTLE' })
    s = reducer(s, { type: 'ASSIGN', playerId: 'dup', ability: ABILITY_KEYS[0], rating: 50, nextFranchise: 'CHI', nextSeason: 1996 })
    s = reducer(s, { type: 'SETTLE' })
    s = reducer(s, { type: 'ASSIGN', playerId: 'dup', ability: ABILITY_KEYS[1], rating: 40, nextFranchise: 'CHI', nextSeason: 1996 })
    // both slots filled with the same player; total reflects both
    expect(s.slots[0].playerId).toBe('dup')
    expect(s.slots[1].playerId).toBe('dup')
    expect(s.runningTotal).toBe(90)
  })

  it('rejects assigning to an already-filled slot', () => {
    let s = reducer(initialState(), { type: 'NEW_GAME', franchise: 'CHI', season: 1996, ceilingTotal: 600 })
    s = reducer(s, { type: 'SETTLE' })
    s = reducer(s, { type: 'ASSIGN', playerId: 'p0', ability: ABILITY_KEYS[0], rating: 50, nextFranchise: 'LAL', nextSeason: 2001 })
    s = reducer(s, { type: 'SETTLE' })
    const before = s
    s = reducer(s, { type: 'ASSIGN', playerId: 'p1', ability: ABILITY_KEYS[0], rating: 99, nextFranchise: 'BOS', nextSeason: 2008 })
    expect(s).toBe(before)
  })

  it('Reroll Team changes ONLY the franchise (same season); Reroll Year ONLY the season', () => {
    let s = reducer(initialState(), { type: 'NEW_GAME', franchise: 'CHI', season: 1996, ceilingTotal: 600 })
    s = reducer(s, { type: 'SETTLE' })

    s = reducer(s, { type: 'REROLL_TEAM', franchise: 'LAL' })
    expect(s.rerollTeamUsed).toBe(true)
    expect(s.currentFranchise).toBe('LAL')
    expect(s.currentSeason).toBe(1996) // year held
    expect(s.spinAxis).toBe('team')
    s = reducer(s, { type: 'SETTLE' })

    const before = s
    s = reducer(s, { type: 'REROLL_TEAM', franchise: 'BOS' })
    expect(s).toBe(before) // second team reroll is a no-op

    s = reducer(s, { type: 'REROLL_YEAR', season: 2001 })
    expect(s.rerollYearUsed).toBe(true)
    expect(s.currentFranchise).toBe('LAL') // franchise held
    expect(s.currentSeason).toBe(2001)
    expect(s.spinAxis).toBe('year')
    s = reducer(s, { type: 'SETTLE' })
    const before2 = s
    s = reducer(s, { type: 'REROLL_YEAR', season: 1987 })
    expect(s).toBe(before2)
  })

  it('reroll is rejected outside the roster phase', () => {
    let s = reducer(initialState(), { type: 'NEW_GAME', franchise: 'CHI', season: 1996, ceilingTotal: 600 })
    const before = s
    s = reducer(s, { type: 'REROLL_TEAM', franchise: 'LAL' })
    expect(s).toBe(before)
  })

  it('runningTotal always equals the sum of locked slot ratings', () => {
    const ratings = [12, 34, 56, 78, 90, 11]
    const s = playGame({ ratings })
    const locked = s.slots.reduce((sum, x) => sum + (x.rating ?? 0), 0)
    expect(s.runningTotal).toBe(locked)
    expect(s.runningTotal).toBe(ratings.reduce((a, b) => a + b, 0))
    expect(s.result.total).toBe(s.runningTotal)
    expect(s.result.ceiling).toBe(600)
  })

  it('filled slots record their franchise + season for team-color display', () => {
    let s = reducer(initialState(), { type: 'NEW_GAME', franchise: 'CHI', season: 1996, ceilingTotal: 600 })
    s = reducer(s, { type: 'SETTLE' })
    s = reducer(s, { type: 'ASSIGN', playerId: 'p0', ability: ABILITY_KEYS[0], rating: 50, nextFranchise: 'LAL', nextSeason: 2001 })
    const slot = s.slots.find((x) => x.ability === ABILITY_KEYS[0])
    expect(slot.franchise).toBe('CHI')
    expect(slot.season).toBe(1996)
  })

  it('forced assignment never deadlocks regardless of ability order', () => {
    const order = [...ABILITY_KEYS].reverse()
    const s = playGame({ assignOrder: order })
    expect(s.phase).toBe('reveal')
    expect(s.slots.every((x) => x.status === 'filled')).toBe(true)
  })

  it('FINISH_REVEAL -> result; RESET -> fresh start', () => {
    let s = playGame()
    s = reducer(s, { type: 'FINISH_REVEAL' })
    expect(s.phase).toBe('result')
    s = reducer(s, { type: 'RESET' })
    expect(s).toEqual(initialState())
  })
})
