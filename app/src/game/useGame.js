// Controller hook: the thin impure layer around the pure reducer (App spec §3). Owns the
// random cell draws (Team × Year grid) and ratings lookups, then dispatches well-formed
// payloads. Team and Year reroll INDEPENDENTLY: Reroll Team picks another franchise legal
// for the current season, Reroll Year another season legal for the current franchise.
import { useMemo, useReducer, useCallback } from 'react'
import { reducer, initialState } from './reducer.js'
import { cellKey } from '../constants.js'

const randItem = (arr) => arr[Math.floor(Math.random() * arr.length)]

export function useGame(game) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)

  const drawCell = useCallback(() => {
    const key = randItem(game.cellList)
    const i = key.indexOf('_')
    return { season: Number(key.slice(0, i)), franchise: key.slice(i + 1) }
  }, [game.cellList])

  const newGame = useCallback(() => {
    const c = drawCell()
    dispatch({ type: 'NEW_GAME', franchise: c.franchise, season: c.season, ceilingTotal: game.ceiling.total })
  }, [dispatch, drawCell, game.ceiling.total])

  const settle = useCallback(() => dispatch({ type: 'SETTLE' }), [dispatch])

  // legal alternates for each axis given the current cell
  const teamAlts = useMemo(
    () => (game.bySeason.get(state.currentSeason) || []).filter((f) => f !== state.currentFranchise),
    [game.bySeason, state.currentSeason, state.currentFranchise]
  )
  const yearAlts = useMemo(
    () => (game.byFranchise.get(state.currentFranchise) || []).filter((s) => s !== state.currentSeason),
    [game.byFranchise, state.currentFranchise, state.currentSeason]
  )

  const canRerollTeam = !state.rerollTeamUsed && state.phase === 'roster' && teamAlts.length > 0
  const canRerollYear = !state.rerollYearUsed && state.phase === 'roster' && yearAlts.length > 0

  const rerollTeam = useCallback(() => {
    if (!canRerollTeam) return
    dispatch({ type: 'REROLL_TEAM', franchise: randItem(teamAlts) })
  }, [dispatch, canRerollTeam, teamAlts])

  const rerollYear = useCallback(() => {
    if (!canRerollYear) return
    dispatch({ type: 'REROLL_YEAR', season: randItem(yearAlts) })
  }, [dispatch, canRerollYear, yearAlts])

  const assign = useCallback(
    (playerId, ability) => {
      const player = game.playersById.get(playerId)
      if (!player) return
      const next = drawCell()
      dispatch({
        type: 'ASSIGN', playerId, ability, rating: player.ratings[ability],
        nextFranchise: next.franchise, nextSeason: next.season,
      })
    },
    [dispatch, game.playersById, drawCell]
  )

  const finishReveal = useCallback(() => dispatch({ type: 'FINISH_REVEAL' }), [dispatch])
  const reset = useCallback(() => dispatch({ type: 'RESET' }), [dispatch])

  // current roster (player objects) for the landed cell
  const currentRoster = useMemo(() => {
    if (state.currentFranchise == null || state.currentSeason == null) return []
    const ids = game.cells.get(cellKey(state.currentSeason, state.currentFranchise)) || []
    return ids.map((id) => game.playersById.get(id)).filter(Boolean)
  }, [game.cells, game.playersById, state.currentFranchise, state.currentSeason])

  return {
    state,
    actions: { newGame, settle, rerollTeam, rerollYear, assign, finishReveal, reset },
    canRerollTeam,
    canRerollYear,
    currentRoster,
  }
}
