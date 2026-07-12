import { ABILITY_KEYS } from '../constants.js'

// Player comp: find the real player-season that "plays most like" the assembled GOAT.
// We match on PROFILE SHAPE, not raw level: z-score each attribute across the pool, then
// weight the distance by how much the GOAT EMPHASIZES each attribute (its above-average
// strengths count more). This surfaces players strong in the same things — a rim-heavy
// GOAT -> a rim protector, a playmaking GOAT -> a floor general — instead of always
// collapsing to the single most well-rounded player. Returns { player, match } or null.
export function findComp(players, slots) {
  if (!players || !players.length) return null
  const n = ABILITY_KEYS.length

  // pool mean / std per attribute
  const mean = new Array(n).fill(0)
  for (const p of players) for (let i = 0; i < n; i++) mean[i] += p.ratings[ABILITY_KEYS[i]] ?? 0
  for (let i = 0; i < n; i++) mean[i] /= players.length
  const varr = new Array(n).fill(0)
  for (const p of players) for (let i = 0; i < n; i++) {
    const x = (p.ratings[ABILITY_KEYS[i]] ?? 0) - mean[i]
    varr[i] += x * x
  }
  const std = varr.map((v) => Math.sqrt(v / players.length) || 1)

  const target = ABILITY_KEYS.map((_, i) => slots[i]?.rating ?? 0)
  const tz = target.map((v, i) => (v - mean[i]) / std[i])
  // weight attributes the GOAT is above-average in; everything keeps a small base weight
  const w = tz.map((z) => 0.25 + Math.max(0, z))

  let best = null
  let bestD = Infinity
  for (const p of players) {
    let d = 0
    for (let i = 0; i < n; i++) {
      const pz = ((p.ratings[ABILITY_KEYS[i]] ?? 0) - mean[i]) / std[i]
      const diff = tz[i] - pz
      d += w[i] * diff * diff
    }
    if (d < bestD) { bestD = d; best = p }
  }
  if (!best) return null

  // % match = 100 minus the mean absolute per-attribute difference on actual ratings
  let mad = 0
  for (let i = 0; i < n; i++) mad += Math.abs((best.ratings[ABILITY_KEYS[i]] ?? 0) - target[i])
  mad /= n
  const match = Math.max(0, Math.min(100, Math.round(100 - mad)))
  return { player: best, match }
}

// Color-code the match strength, drawn from the Hardwood/Claude palette (theme-aware tokens,
// so the % stays legible on both themes and on the forced-light share card).
export function matchColor(m) {
  if (m >= 90) return 'var(--good)'  // strong — green
  if (m >= 80) return 'var(--slate)' // solid — slate
  if (m >= 70) return 'var(--gold)'  // loose — gold
  return 'var(--crit)'               // weak — red
}
