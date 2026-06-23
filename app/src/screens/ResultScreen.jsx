import { useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { ABILITIES } from '../constants.js'
import Avatar from '../ui/Avatar.jsx'
import TeamLogo from '../ui/TeamLogo.jsx'
import PlayerComp from '../ui/PlayerComp.jsx'
import { findComp } from '../game/comp.js'
import { playerPhotoUrl } from '../ui/assets.js'
import { ratingTier, percentileTier, TIER_BLURB, TIER_COLOR, teamDisplay } from '../ui/helpers.js'
import { ordinalSuffix } from '../ui/ordinal.js'

// Result card (App spec §6): the viral surface. Renders the full run as a clean, branded,
// download-as-image card that shines as a STATIC image (no motion reliance). Play Again +
// Daily stub.
export default function ResultScreen({ game, state, onPlayAgain }) {
  const total = state.result.total
  const ceiling = state.result.ceiling
  const percentile = Math.round(game.getPercentile(total))
  const tier = percentileTier(percentile)
  const comp = useMemo(() => findComp(game.players, state.slots), [game.players, state.slots])
  const cardRef = useRef(null)
  const [saving, setSaving] = useState(false)

  async function saveImage() {
    if (!cardRef.current) return
    setSaving(true)
    try {
      // both image CDNs send CORS *, so they inline cleanly; the transparent placeholder
      // keeps the export from throwing if any single image ever fails to load.
      const TRANSPARENT = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
      const url = await toPng(cardRef.current, { pixelRatio: 2, backgroundColor: '#ffffff', imagePlaceholder: TRANSPARENT })
      const a = document.createElement('a')
      a.href = url
      a.download = `build-the-goat-${total}.png`
      a.click()
    } catch (e) {
      console.error('[result] image export failed', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="screen result-screen">
      <div className="result-screen__head">Share your results</div>
      <div className="result-card tier-edge" ref={cardRef} style={{ '--tier-color': TIER_COLOR[tier] }}>
        <div className="result-card__brand">
          <span className="result-card__logo">BUILD THE <b>GOAT</b></span>
          <span className="result-card__tag">82-0 inspired</span>
        </div>

        <div className="result-card__headline">
          <div className="result-card__pct">
            {percentile}<span className="result-card__ord">{ordinalSuffix(percentile)}</span>
            <span className="result-card__pctword">pctl</span>
          </div>
          <div className="result-card__score">
            <span className="result-card__total">{total}</span>
            <span className="result-card__ceil">/ {ceiling}</span>
          </div>
        </div>
        <div className="result-card__blurb">{TIER_BLURB[tier]}</div>

        <div className="result-card__rows">
          {state.slots.map((slot, i) => {
            const meta = ABILITIES[i]
            const player = game.playersById.get(slot.playerId)
            const team = teamDisplay(game, slot.franchise, slot.season)
            const color = team?.color || '#2a2a36'
            return (
              <div className="rrow" key={slot.ability} style={{ '--team': color }}>
                <Avatar name={player?.name} src={playerPhotoUrl(player)} color={color} size={40} rounded={9} />
                <span className="rrow__player">
                  <span className="rrow__ability">{meta.label}</span>
                  <span className="rrow__name">{player?.name || '—'}</span>
                  <span className="rrow__teamline">
                    <TeamLogo franchise={slot.franchise} color={color} size={15} badge={false} />
                    <span className="rrow__team" style={{ color }}>{team?.label || ''}</span>
                  </span>
                </span>
                <span className={'rrow__rating tier-' + ratingTier(slot.rating)}>{slot.rating}</span>
              </div>
            )
          })}
        </div>

        <PlayerComp comp={comp} />

        <div className="result-card__foot">build-the-goat · all-time NBA</div>
      </div>

      <div className="result-actions">
        <button className="btn-primary" onClick={saveImage} disabled={saving}>
          {saving ? 'Saving…' : '⬇ Save image'}
        </button>
        <button className="btn-secondary" onClick={onPlayAgain}>
          Play again <kbd className="kbd">R</kbd>
        </button>
        <button className="btn-ghost" disabled>Daily · soon</button>
      </div>
    </div>
  )
}
