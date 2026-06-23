import { useState } from 'react'
import GoatCard from '../ui/GoatCard.jsx'
import TeamYearReel from '../ui/TeamYearReel.jsx'
import RosterBoard from '../ui/RosterBoard.jsx'
import Avatar from '../ui/Avatar.jsx'
import { playerPhotoUrl } from '../ui/assets.js'
import { teamDisplay } from '../ui/helpers.js'

// Small circular-arrow "reroll" glyph (inline SVG — no emoji).
function RerollIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  )
}

// Drives the `spinning` and `roster` phases (App spec §4). Team and Year are independent:
// the spin shows a Team reel + a Year reel; Reroll Team re-rolls only the franchise (same
// year), Reroll Year only the season (same franchise). The two rerolls live top-right,
// inline with the spin counter.
export default function GameScreen({ game, state, actions, canRerollTeam, canRerollYear, currentRoster }) {
  const team = teamDisplay(game, state.currentFranchise, state.currentSeason)
  const openAbilities = state.slots.filter((s) => s.status === 'open').map((s) => s.ability)
  // mobile: collapse the "your GOAT" card to give the player list room (always shown on desktop)
  const [cardOpen, setCardOpen] = useState(false)

  return (
    <div className="screen game-screen">
      <div className="game-top">
        <div className="game-header">
          <div className="spin-counter">
            <span className="spin-counter__now">SPIN {state.spinNumber}</span>
            <span className="spin-counter__of">of 6</span>
          </div>
          <div className="reroll-group">
            <button className="reroll-mini" disabled={!canRerollTeam} onClick={actions.rerollTeam}
                    aria-label="Reroll Team" title={state.rerollTeamUsed ? 'Reroll Team (used)' : 'Reroll Team'}>
              <RerollIcon /><span className="reroll-mini__label">Team</span>
            </button>
            <button className="reroll-mini" disabled={!canRerollYear} onClick={actions.rerollYear}
                    aria-label="Reroll Year" title={state.rerollYearUsed ? 'Reroll Year (used)' : 'Reroll Year'}>
              <RerollIcon /><span className="reroll-mini__label">Year</span>
            </button>
          </div>
        </div>
        <button
          className={'goat-toggle' + (cardOpen ? ' open' : '')}
          onClick={() => setCardOpen((o) => !o)}
          aria-expanded={cardOpen}
        >
          <span className="goat-toggle__label">Your GOAT</span>
          <span className="goat-toggle__faces">
            {state.slots.map((slot) => {
              const isFilled = slot.status === 'filled'
              const player = isFilled ? game.playersById.get(slot.playerId) : null
              const color = isFilled ? teamDisplay(game, slot.franchise, slot.season).color : '#c9ccd2'
              return isFilled ? (
                <Avatar key={slot.ability} name={player?.name} src={playerPhotoUrl(player)} color={color} size={26} rounded={13} />
              ) : (
                <span key={slot.ability} className="goat-toggle__ph" />
              )
            })}
          </span>
          <svg className="goat-toggle__chev" width="20" height="20" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <div className={'goat-card-wrap' + (cardOpen ? ' open' : '')}>
          <GoatCard
            slots={state.slots}
            game={game}
            runningTotal={state.runningTotal}
            lastLockKey={state.lastLock?.ability}
            compact
            hideRatings
          />
        </div>
      </div>

      <div className="game-bottom">
        {state.phase === 'spinning' && (
          <div className="spin-stage">
            <div className="spin-stage__title">
              {state.spinAxis === 'team' ? 'Rerolling team…' : state.spinAxis === 'year' ? 'Rerolling year…' : 'Spinning…'}
            </div>
            <TeamYearReel
              franchises={game.franchises}
              seasons={game.seasons}
              targetFranchise={state.currentFranchise}
              targetSeason={state.currentSeason}
              animateTeam={state.spinAxis === 'both' || state.spinAxis === 'team'}
              animateYear={state.spinAxis === 'both' || state.spinAxis === 'year'}
              spinKey={`${state.spinNumber}:${state.spinAxis}:${state.currentFranchise}:${state.currentSeason}`}
              onSettle={actions.settle}
            />
          </div>
        )}

        {state.phase === 'roster' && (
          <RosterBoard
            team={team}
            players={currentRoster}
            openAbilities={openAbilities}
            onAssign={actions.assign}
          />
        )}
      </div>
    </div>
  )
}
