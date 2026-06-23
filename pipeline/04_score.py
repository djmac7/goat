#!/usr/bin/env python
"""04 — Score: for each of the six categories, percentile-rank each component across
the universe, weighted-average into a composite, then percentile-rank the composite
into the final 0-100 rating. Spec §7, §8.

Two rounds of ranking on purpose (§7): component ranks put inputs on one scale so they
can be averaged; the composite rank gives the clean, ordinal 0-100 game feel.

Writes: data/work/scored.parquet  (universe + six integer ratings + composites)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
import pandas as pd
from common import (load_config, work_path, percentile_rank, percentile_rank_within,
                    weighted_composite, credibility_shrink, bell_curve, scoring_guardrail)

RATINGS = ["shooting", "scoring", "playmaking",
           "perimeter_d", "rim_protection", "rebounding"]


def component_values(df: pd.DataFrame, cfg: dict) -> dict:
    """Map each component key -> its prepared (already normalized/shrunk) raw value.
    Per-100 and as-is inputs are taken straight; percentages use the §6 shrunk cols;
    AST/TO floors turnovers at 0.5 to avoid a 0-TO scrub spiking (§7).

    Scoring-VOLUME components (score2/score3) are season points gated by the TS%
    guardrail so volume only rewards efficient-enough scorers (lifts Kobe/MJ, not
    chuckers). Every category also carries an ABSOLUTE volume component so usage/
    minutes matter, not just rates: score3/score2 (offense), ast_total, stl_total,
    blk_total (defense), trb_total (boards)."""
    num = lambda c: pd.to_numeric(df[c], errors="coerce")
    season_mean = lambda s: s.groupby(df["season"]).transform("mean")

    # (a) TS%-based gate for shooting's 3pt scoring volume
    gs = cfg["shooting_guardrail"]
    ts = num("ts_percent")
    g_ts = scoring_guardrail(ts, season_mean(ts), float(gs["band"]), float(gs["gmin"]))

    # (b) 3pt-NEUTRAL efficiency for the SCORING category: every FG counts as 2 pts, so a
    # player isn't penalized for not shooting 3s (the extra point value of a 3 is already
    # captured in the points total / pts_rate).
    fg, fga = num("x2p") + num("x3p"), num("x2pa") + num("x3pa")
    adj_ts = (2.0 * fg + num("ft")) / (2.0 * (fga + 0.44 * num("fta"))).clip(lower=1.0)

    return {
        # SHOOTING — shooting SKILL: 3pt make-rate + FT touch, with a light volume floor.
        # Volume/impact lives in `scoring`, so efficiency leads here (great lower-volume shooters
        # like Bird aren't buried). EB-shrinkage on the %s guards tiny-sample flukes.
        "shooting": {
            "fg3_pct": df["fg3_pct_shrunk"],
            "ft_pct": df["ft_pct_shrunk"],
            "score3": (3.0 * num("x3p")) * g_ts,     # light volume floor (TS%-gated 3pt scoring)
        },
        # SCORING — VOLUME-led, ERA-RELATIVE (components ranked within season; see
        # era_relative_ratings). Per-game points lead so a season's scoring leader rates elite
        # in any era; efficiency is light and 3pt-NEUTRAL (adj_ts) so non-3pt shooters aren't
        # docked. Works in every era (pts/usg exist back to 1980).
        "scoring": {
            "pts_rate": num("pts") / num("g").clip(lower=1.0),  # PPG (era-relative volume — leads)
            "usg": num("usg_percent"),                          # shot-creation load
            "adj_ts": adj_ts,                                   # 3pt-neutral shot-making efficiency
        },
        "playmaking": {
            "ast_total": num("ast"),                 # §5 override: absolute season assists (volume)
            "ast_pct": num("ast_percent"),           # creation rate
            # usage-fair ball security: creation rate vs turnover rate (per play used). Credits
            # protecting the ball relative to offensive load, so high-usage engines (LeBron)
            # aren't penalized; replaces raw ast/to, which double-counted low-TO pass specialists.
            "ast_security": num("ast_percent") / pd.to_numeric(df["tov_percent"], errors="coerce").clip(lower=1.0),
        },
        "perimeter_d": {
            "stl_pct": num("stl_percent"),
            "dbpm": num("dbpm"),
            "stl_total": num("stl"),                 # absolute season steals (volume)
        },
        "rim_protection": {
            "blk_pct": num("blk_percent"),
            "dbpm": num("dbpm"),
            "blk_total": num("blk"),                 # absolute season blocks (volume)
        },
        "rebounding": {
            "trb_pct": num("trb_percent"),
            "trb_total": num("trb"),                 # §5 override: absolute season rebounds (volume)
            "oreb_pct": num("orb_percent"),
            "dreb_pct": num("drb_percent"),
        },
    }


def main():
    cfg = load_config()
    df = pd.read_parquet(work_path(cfg, "normalized.parquet"))
    weights = cfg["weights"]
    comps = component_values(df, cfg)

    # --- §7 volume credibility: shrink configured rate/ratio components toward the
    # universe mean by their backing volume BEFORE ranking (see config `credibility`) ---
    cred = cfg.get("credibility", {})
    num = lambda c: pd.to_numeric(df[c], errors="coerce")
    volume_series = {                                   # derived volume keys
        "fga": num("x2pa").fillna(0) + num("x3pa").fillna(0),
        "ast_plus_tov": (num("ast").fillna(0) + num("tov").fillna(0)),
    }
    resolve_vol = lambda key: volume_series[key] if key in volume_series else num(key)
    n_shrunk = 0
    for cat in RATINGS:
        for name, vals in comps[cat].items():
            spec = cred.get(name)
            if spec is None:
                continue
            comps[cat][name] = credibility_shrink(
                vals, resolve_vol(spec["volume"]), float(spec["K"]))
            n_shrunk += 1
    print(f"[04_score] applied volume-credibility shrinkage to {n_shrunk} components")

    era_rel = set(cfg.get("era_relative_ratings", []))
    crv = cfg.get("curve")
    for cat in RATINGS:
        # 1st round: percentile-rank each component. era-relative cats (scoring) rank
        # WITHIN season so the result normalizes eras; the rest rank across the universe.
        if cat in era_rel:
            ranks = {name: percentile_rank_within(vals, df["season"])
                     for name, vals in comps[cat].items()}
        else:
            ranks = {name: percentile_rank(vals) for name, vals in comps[cat].items()}
        rank_df = pd.DataFrame(ranks, index=df.index)
        for name in ranks:
            df[f"_rk_{cat}_{name}"] = rank_df[name]
        # weighted-average -> composite (weights renormalized over present components)
        composite = weighted_composite(rank_df, weights[cat])
        df[f"_comp_{cat}"] = composite
        # 2nd round: percentile-rank the composite -> flat 0-100 ...
        final = percentile_rank(composite)
        # ... then bell-curve it so elite ratings are scarce (config `curve`; monotonic).
        # sd may be overridden per rating (scoring uses a softer sd so era-relative
        # scoring leaders reliably clear 90 while keeping a real efficiency component).
        if crv:
            sd = crv.get("sd_by_rating", {}).get(cat, crv["sd"])
            final = bell_curve(final, float(crv["mean"]), float(sd))
        df[cat] = pd.Series(np.round(final), index=df.index).astype("Int64")

    df.to_parquet(work_path(cfg, "scored.parquet"), index=False)

    summary = {c: (float(np.nanmean(df[c].astype(float))),
                   int(df[c].min()), int(df[c].max())) for c in RATINGS}
    print("[04_score] ratings written. mean / min / max per ability:")
    for c in RATINGS:
        m, lo, hi = summary[c]
        print(f"   {c:15s} mean={m:5.1f}  min={lo:3d}  max={hi:3d}")


if __name__ == "__main__":
    main()
