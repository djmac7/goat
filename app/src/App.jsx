import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { loadGameData } from './data/loader.js'
import { useGame } from './game/useGame.js'
import GameScreen from './screens/GameScreen.jsx'
import RevealScreen from './screens/RevealScreen.jsx'
import ResultScreen from './screens/ResultScreen.jsx'

export default function App() {
  const [game, setGame] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadGameData().then(setGame).catch((e) => setError(e))
  }, [])

  if (error) {
    return (
      <div className="boot boot--error">
        <div className="boot__title">Couldn’t load game data</div>
        <pre className="boot__msg">{String(error.message || error)}</pre>
      </div>
    )
  }
  if (!game) {
    return (
      <div className="boot">
        <div className="boot__mark">
          <span className="boot__build">BUILD THE</span>
          <span className="boot__goat">GOAT</span>
        </div>
        <div className="boot__spinner" />
        <div className="boot__title">Loading players…</div>
      </div>
    )
  }
  return <Game game={game} />
}

function Game({ game }) {
  const { state, actions, canRerollTeam, canRerollYear, currentRoster } = useGame(game)

  // No title screen — drop straight into a game on load.
  const started = useRef(false)
  useLayoutEffect(() => {
    if (!started.current && state.phase === 'start') {
      started.current = true
      actions.newGame()
    }
  }, [state.phase, actions])

  // End-screen keyboard shortcuts (ignore Cmd/Ctrl combos so browser reload/save still work):
  //   R = play again (reveal & result)   ·   S = share your results (reveal -> result card)
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'r' && (state.phase === 'reveal' || state.phase === 'result')) {
        e.preventDefault()
        actions.newGame()
      } else if (k === 's' && state.phase === 'reveal') {
        e.preventDefault()
        actions.finishReveal()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.phase, actions])

  return (
    <div className="app-frame">
      {(state.phase === 'spinning' || state.phase === 'roster') && (
        <GameScreen
          game={game}
          state={state}
          actions={actions}
          canRerollTeam={canRerollTeam}
          canRerollYear={canRerollYear}
          currentRoster={currentRoster}
        />
      )}

      {state.phase === 'reveal' && (
        <RevealScreen game={game} state={state} onDone={actions.finishReveal} onPlayAgain={actions.newGame} />
      )}

      {state.phase === 'result' && (
        <ResultScreen game={game} state={state} onPlayAgain={actions.newGame} />
      )}
    </div>
  )
}
