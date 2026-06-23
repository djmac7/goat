// Headless game logic (App spec §3). PURE reducer — no data, no randomness, no clock.
// Team and Year are INDEPENDENT axes: a spin lands on a (franchise, season) cell, Reroll
// Team swaps only the franchise (same season), Reroll Year swaps only the season (same
// franchise). All non-determinism (which cell, which rating) is supplied by the caller in
// the action payload, so the rules are unit-testable and the Monte Carlo mirrors them.
import { ABILITY_KEYS } from '../constants.js'

export function initialState() {
  return {
    phase: 'start', // start | spinning | roster | reveal | result
    spinNumber: 1, // 1..6
    slots: ABILITY_KEYS.map((ability) => ({ ability, status: 'open', playerId: null, rating: null, franchise: null, season: null })),
    currentFranchise: null,
    currentSeason: null,
    spinAxis: 'both', // both | team | year — which reel(s) animate this spin
    usedPlayerIds: [],
    rerollTeamUsed: false,
    rerollYearUsed: false,
    runningTotal: 0,
    ceilingTotal: null,
    lastLock: null, // {ability, playerId, rating, franchise, season}
    result: null, // { total, ceiling } once the 6th slot locks
  }
}

const openSlotIndex = (slots, ability) =>
  slots.findIndex((s) => s.ability === ability && s.status === 'open')

export function reducer(state, action) {
  switch (action.type) {
    case 'NEW_GAME':
      return {
        ...initialState(),
        phase: 'spinning',
        spinAxis: 'both',
        currentFranchise: action.franchise,
        currentSeason: action.season,
        ceilingTotal: action.ceilingTotal ?? null,
      }

    case 'SETTLE':
      if (state.phase !== 'spinning') return state
      return { ...state, phase: 'roster' }

    // Reroll Team: new franchise, SAME season. Caller passes a franchise legal for the season.
    case 'REROLL_TEAM':
      if (state.phase !== 'roster' || state.rerollTeamUsed) return state
      return { ...state, rerollTeamUsed: true, currentFranchise: action.franchise, phase: 'spinning', spinAxis: 'team' }

    // Reroll Year: new season, SAME franchise. Caller passes a season legal for the franchise.
    case 'REROLL_YEAR':
      if (state.phase !== 'roster' || state.rerollYearUsed) return state
      return { ...state, rerollYearUsed: true, currentSeason: action.season, phase: 'spinning', spinAxis: 'year' }

    // Forced move: lock one player's rating into one open slot. payload:
    // { playerId, ability, rating, nextFranchise, nextSeason }
    case 'ASSIGN': {
      if (state.phase !== 'roster') return state
      const idx = openSlotIndex(state.slots, action.ability)
      if (idx < 0) return state
      // (a player may be drafted into more than one slot — no one-player-once restriction)

      const franchise = state.currentFranchise
      const season = state.currentSeason
      const slots = state.slots.map((s, i) =>
        i === idx
          ? { ...s, status: 'filled', playerId: action.playerId, rating: action.rating, franchise, season }
          : s
      )
      const usedPlayerIds = [...state.usedPlayerIds, action.playerId]
      const runningTotal = state.runningTotal + action.rating
      const filled = slots.filter((s) => s.status === 'filled').length
      const lastLock = { ability: action.ability, playerId: action.playerId, rating: action.rating, franchise, season }

      if (filled >= 6) {
        return {
          ...state, slots, usedPlayerIds, runningTotal, lastLock,
          phase: 'reveal', result: { total: runningTotal, ceiling: state.ceilingTotal },
        }
      }
      return {
        ...state, slots, usedPlayerIds, runningTotal, lastLock,
        currentFranchise: action.nextFranchise,
        currentSeason: action.nextSeason,
        spinAxis: 'both',
        phase: 'spinning',
        spinNumber: state.spinNumber + 1,
      }
    }

    case 'FINISH_REVEAL':
      if (state.phase !== 'reveal') return state
      return { ...state, phase: 'result' }

    case 'RESET':
      return initialState()

    default:
      return state
  }
}
