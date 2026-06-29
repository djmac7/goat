// The viral payload (App spec §6, virality pass). A Wordle-style TEXT share that pastes
// natively into iMessage / WhatsApp / X / Stories — no download, no attachment, previews
// inline, and CARRIES ITS OWN URL so every share is a distribution vector.
//
// The six tier-colored squares (one per ability, in the fixed ABILITIES order) encode the
// SHAPE of your GOAT — strong where, weak where — WITHOUT revealing which players/team-years
// you stole. That spoiler gap is the hook: "you went blue on defense? who'd you even get?!"
import { ABILITIES } from '../constants.js'
import { ratingTier, percentileTier } from './helpers.js'
import { ordinalSuffix } from './ordinal.js'

// rating tier -> heat square (warm = weak, cool = elite). Monotonic so the row reads at a glance.
const TIER_SQUARE = { elite: '🟦', great: '🟩', good: '🟨', mid: '🟧', low: '🟥' }

// The brag line (per percentile tier) — louder than the in-app blurb because a share has to
// earn the tap. Carries the accolade emoji so the flex is legible at a glance in a feed.
const SHARE_VERDICT = {
  goat: 'I built the GOAT 🐐 debate over',
  hof: 'first-ballot Hall of Famer 🏆',
  allnba: 'All-NBA, no debate ⭐',
  allstar: 'bona fide All-Star',
  role: 'solid rotation piece',
  bench: 'barely cracked the rotation',
  bust: 'certified bust 💀',
}

// The hook (per tier) — a competitive dare is the share's job. Higher tiers taunt "top it",
// lower tiers bait "you can do better". Either way it demands a reply, which is the click.
const SHARE_CTA = {
  goat: 'Your turn. Good luck topping it.',
  hof: 'Think you can top it?',
  allnba: 'Think you can top it?',
  allstar: 'Your turn — can you beat it?',
  role: 'Bet you can do better.',
  bench: 'You can definitely beat this.',
  bust: 'You literally cannot do worse — try.',
}

export function ratingSquares(slots) {
  return ABILITIES.map((_, i) => TIER_SQUARE[ratingTier(slots[i]?.rating ?? 0)]).join('')
}

// Live deployed URL (origin + path, no query/hash, no index.html) so the share always
// points back to wherever this is hosted. Empty in non-DOM contexts (tests).
export function shareUrl() {
  if (typeof location === 'undefined') return ''
  return (location.origin + location.pathname).replace(/index\.html$/, '').replace(/\/$/, '') + '/'
}

// Protocol-stripped, trailing-slash-trimmed URL for printing on the card / in text.
export function shareDisplayUrl() {
  return shareUrl().replace(/^https?:\/\//, '').replace(/\/$/, '')
}

// A deep link that reproduces THIS run for whoever taps it: ?d=<date> opens that exact daily
// (playable from the archive); ?seed=<seed> reproduces an unlimited board (challenge-a-friend).
export function shareLink(meta) {
  const base = shareUrl()
  if (!base) return ''
  if (meta?.mode === 'daily' && meta.date) return `${base}?d=${meta.date}`
  if (meta?.seed) return `${base}?seed=${encodeURIComponent(meta.seed)}`
  return base
}

function shareTitle(meta) {
  if (meta?.mode === 'daily' && meta.dayNumber != null) return `SIX SPINS · Daily #${meta.dayNumber}`
  if (meta?.mode === 'challenge') return `SIX SPINS · Challenge`
  return `SIX SPINS 🏀`
}

export function buildShareText({ percentile, total, ceiling, slots, comp, meta, url }) {
  const tier = percentileTier(percentile)
  const link = url != null ? url : shareLink(meta)
  const lines = [
    shareTitle(meta),
    `${percentile}${ordinalSuffix(percentile)} percentile · ${SHARE_VERDICT[tier]}`,
    `${ratingSquares(slots)}  ${total}/${ceiling}`,
  ]
  if (comp?.player) lines.push(`plays like ${comp.player.name} · ${comp.player.team_label}`)
  lines.push(SHARE_CTA[tier])
  if (link) lines.push(`▸ ${link}`)
  return lines.join('\n')
}
