# How the six attributes are calculated

Every player in Six Spins is rated on six attributes — **Shooting, Scoring, Playmaking,
Defense, Rebounding, and Clutch**. This document describes exactly how each number is
produced. Two rules hold throughout (spec §0):

- **Deterministic** — a plain script computes every value. No LLM ever produces a rating.
- **Ranked against the whole universe** — every player is ranked against all NBA/BAA
  player-seasons from 1947 on, never against the curated pool. Editing the pool never
  re-rates anyone.

The code lives in `pipeline/` (`03_normalize.py`, `04_score.py`, `05_curate.py`,
`common.py`) and every tunable is in `pipeline/config.yml`.

## The shared pipeline (applies to all six)

The same six-step flow produces every attribute:

1. **Normalize** (`03_normalize.py`). Percentages (3P%, FT%, 2P%, measured mid-range FG%)
   are empirical-Bayes shrunk toward each *season's* league mean so small samples regress:
   `p_shrunk = (makes + μ·K) / (attempts + K)`.
2. **Assemble components** (`04_score.py` `component_values`). Each attribute is a small set
   of raw stats. Rate/ratio stats are additionally **volume-credibility shrunk** toward the
   universe mean by their backing minutes/attempts —
   `value_adj = μ + (value − μ)·n/(n + K)` — so a low-minute specialist with a gaudy rate
   can't rank beside a high-volume star.
3. **Rank each component** into a 0–100 percentile: `100·(rank − 0.5)/N`, ties averaged.
   Era-relative components rank *within season* instead of across the whole universe.
4. **Weighted-average** the component ranks into a composite. Weights renormalize over
   whichever components are actually present, so a missing component (e.g. a player with no
   3-point attempts) drops out cleanly rather than counting as a zero.
5. **Rank the composite again**, then reshape it through a **bell curve** (`curve`: mean 50,
   sd 18, floor 5) so elite ratings are scarce. The second ranking gives a clean ordinal
   0–100 feel; the curve makes 90+ a genuine outlier.
6. **Curate to a decade peak** (`05_curate.py`). The shipped rating is the **per-ability max
   of a player's season composites** within a `(player, franchise, decade)` cell,
   re-ranked across the decade-grain universe and mapped onto a **2K-style scale**
   (`decade_curve`: median ~75, floor 55, cap 99). Rosters are the top players by total
   minutes on that franchise that decade; the ratings reflect the player at his peak there.

### The "sentiment accolade" signal

A recurring ingredient is a **recorded vote share** — MVP, All-NBA, All-Defensive, DPOY,
Finals MVP, All-Star, Clutch Player of the Year. It's the one non-box-score input, included
because some skills (point-of-attack defense, clutch shot-making) barely register in a box
score. Each accolade is **smoothed** across adjacent seasons (recognition is a reputation
that persists) and **de-saturated** (honored seasons are ranked among themselves across
`[floor, 100]` by magnitude; everyone else sits at a neutral baseline), so First-Team
recognition separates from a token stray vote. It is still fully deterministic: recorded
voting data, not a model output.

## The six attributes

### Shooting

Efficiency-led shooting **skill** — make-rate plus free-throw touch. Volume and impact live
in Scoring, so great-but-lower-volume shooters (Bird) aren't buried.

- `fg3_pct` **0.43** — 3-point make rate (EB-shrunk)
- `ft_pct` **0.35** — free-throw touch (era-neutral)
- `score3` **0.22** — per-game 3-point volume, gated by a TS% efficiency guardrail
- `mid_range` **0.15** — measured 10–16ft / 16ft–3PT make rate (non-shooters only)

A **shot-profile gate** splits players by whether ≥10% of their FGA are 3s. A genuine
shooter is scored on `{fg3, ft, score3}`. A non-shooter *drops* `fg3` (its neutral prior
was falsely crediting non-shooters as above-average from deep) and swaps in a **measured**
mid-range make rate — present only where 1997+ shot-location data shows real mid-range
attempts, so rim-running dunkers and pre-data eras get no phantom jump-shooting credit.
Because a non-shooter's shooting is *inferred* (FT% + mid-range), it can't be confirmed
elite and is **hard-capped at 82**.

### Scoring

Volume-led and **era-relative**: components are ranked *within season*, so each year's
scoring leader rates elite in any era.

- `pts_rate` **0.62** — points per game (leads)
- `scoring_accolade` **0.16** — MVP / All-NBA vote share + scoring title (sentiment)
- `ts_eff` **0.14** — real true-shooting % (counts 3s at full value)
- `usg` **0.08** — usage / shot-creation load

Efficiency uses *real* TS% (not a 3pt-neutral version) so efficient high-volume shooters
(Curry) aren't erased, while volume still leads so classic 2pt scorers (Malone, Giannis)
stay elite.

### Playmaking

Creation-led — volume, rate, and load — with usage-fair ball security.

- `ast_total` **0.31** — per-game assists (absolute volume; separates GOAT creators)
- `ast_pct` **0.28** — assist rate (credibility-shrunk on minutes)
- `creation_load` **0.18** — assist% × usage (creating *while* carrying a scoring load —
  lifts LeBron / Luka / Harden primary-engine years)
- `ast_security` **0.15** — assist% ÷ turnover% (usage-fair ball security)
- `star_accolade` **0.08** — MVP share + All-Star selection (sentiment)

Assist rate is the base multiplicand throughout, so a low-assist scorer stays low no matter
his usage.

### Defense

One merged rating covering both perimeter and interior defense. Two archetype
sub-composites are built and a player's box credit is the **max** of the two, re-ranked — so
a pure perimeter stopper isn't dragged down by real-but-low block stats, and vice versa:

- **Perimeter**: steal rate + per-game steals + defensive box plus/minus
- **Interior**: block rate + per-game blocks + defensive-rebound rate + defensive box +/−

Final blend:

- `box_best` **0.55** — max(perimeter, interior), re-ranked
- `def_accolade` **0.45** — All-Defensive + DPOY vote share (the only signal that sees both
  point-of-attack containment and no-swat rim anchoring)

### Rebounding

Rate is the primary signal, with per-game volume added so high-minute anchors aren't
outranked by low-minute rate compilers.

- `trb_pct` **0.42** — total-rebound rate (credibility-shrunk on minutes)
- `trb_total` **0.28** — per-game rebounds (absolute volume)
- `dreb_pct` **0.20** — defensive-rebound rate
- `oreb_pct` **0.10** — offensive-rebound rate (trimmed so it doesn't penalize
  rim-protecting bigs who don't crash the offensive glass)

### Clutch

Performing when it matters, built from playoff production. Like Defense, the box credit is
the **best of three archetypes** (a NaN-tolerant max), so a dagger-hitter isn't averaged
down by a dipped playoff efficiency and a deep-run workhorse isn't dragged by having no
buzzer-beaters:

- **Playoff body of work**: playoff PPG (era-relative) + playoff games (deep runs) +
  playoff-vs-regular-season TS% retention
- **Game-winners**: go-ahead daggers, playoff ones weighted 20×, scaled by how many in a
  season
- **Clutch-time scoring**: trailing-weighted points in the last 5:00 of tight playoff games

Final blend:

- `clutch_best` **0.90** — max of the three archetypes above
- `clutch_accolade` **0.10** — Finals MVP + MVP-share echo + Clutch-POY share

The accolade is applied as a **lift only** (a max, not a drag), so a proven closer with no
Finals MVP (Haliburton) keeps full game-winner credit. Playoff box data goes back to 1947;
game-winners and clutch-time need 1997+ play-by-play, and earlier seasons simply renormalize
away rather than being zero-dragged.

## What the player sees: OVR

The in-game **Overall (OVR)** is *not* a seventh attribute — it's a curved rollup of the six
picked attributes computed in the app (`app/src/ui/helpers.js`, `computeOvr`), anchored so a
99 OVR requires a near-flawless six-pick board. The pipeline ships the six attribute ratings
and a Monte Carlo percentile table; the app derives the OVR at render time.

## Where to tune

Everything is in `pipeline/config.yml` (weights, shrinkage `K`, era cutoff, curves, sample
floors) and `pipeline/pool.yml` (which team-decades are curated). After any change,
regenerate `data/goat-data.json` and re-run the Monte Carlo together (`python
pipeline/run.py`) — a stale percentile table lies. The QA name-regression checks
(`pipeline/qa.py`, config `qa.expect_top` / `signature_floor`) are the cheapest way to catch
a broken weight.
