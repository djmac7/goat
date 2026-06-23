import { useEffect, useMemo, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import GoatCard from '../ui/GoatCard.jsx'
import PlayerComp from '../ui/PlayerComp.jsx'
import TierMeter from '../ui/TierMeter.jsx'
import { findComp } from '../game/comp.js'
import { percentileTier, TIER_COLOR, TIER_CELEBRATE } from '../ui/helpers.js'
import { ordinalSuffix } from '../ui/ordinal.js'

// Final reveal (App spec §5): assemble the card, COUNT UP the six ratings in sequence,
// hard pause, then SLAM the percentile as the climax with the ceiling as context.
// High percentiles get confetti + bright treatment; low ones stay muted.
const BEAT_MS = 430
const PAUSE_MS = 750

export default function RevealScreen({ game, state, onDone, onPlayAgain }) {
  const total = state.result.total
  const ceiling = state.result.ceiling
  // round BEFORE picking the tier so the shown number and the accolade always agree
  const percentile = Math.round(game.getPercentile(total))
  const tier = percentileTier(percentile)

  const comp = useMemo(() => findComp(game.players, state.slots), [game.players, state.slots])

  const [revealCount, setRevealCount] = useState(0)
  const [showPct, setShowPct] = useState(false)
  const fired = useRef(false)

  useEffect(() => {
    const timers = []
    for (let i = 1; i <= 6; i++) timers.push(setTimeout(() => setRevealCount(i), i * BEAT_MS))
    timers.push(setTimeout(() => setShowPct(true), 6 * BEAT_MS + PAUSE_MS))
    return () => timers.forEach(clearTimeout)
  }, [])

  useEffect(() => {
    if (showPct && !fired.current && TIER_CELEBRATE.has(tier)) {
      fired.current = true
      const burst = tier === 'goat' ? 160 : tier === 'hof' ? 120 : 90
      confetti({ particleCount: burst, spread: 80, origin: { y: 0.4 }, scalar: 1.1 })
      if (tier === 'goat') {
        setTimeout(() => confetti({ particleCount: 120, spread: 110, origin: { y: 0.5 } }), 250)
      }
    }
  }, [showPct, tier])

  return (
    <div className={'screen reveal-screen tier-bg-' + tier}>
      <GoatCard
        slots={state.slots}
        game={game}
        runningTotal={revealCount >= 6 ? total : sumShown(state.slots, revealCount)}
        revealCount={revealCount}
        ceiling={ceiling}
      />

      {showPct && (
        <div className="pct-slam" style={{ '--tier-color': TIER_COLOR[tier] }}>
          <div className="pct-slam__big">
            <span className="pct-slam__num">{percentile}</span>
            <span className="pct-slam__ord">{ordinalSuffix(percentile)}</span>
          </div>
          <div className="pct-slam__word">percentile</div>
          <TierMeter percentile={percentile} total={total} scoreForPercentile={game.scoreForPercentile} />
          <PlayerComp comp={comp} />
          <div className="pct-slam__actions">
            <button className="btn-primary" onClick={onPlayAgain}>
              Play again <kbd className="kbd">R</kbd>
            </button>
            <button className="btn-secondary" onClick={onDone}>
              Share your results <kbd className="kbd">S</kbd>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function sumShown(slots, n) {
  return slots.slice(0, n).reduce((s, x) => s + (x.rating ?? 0), 0)
}
