#!/usr/bin/env python
"""QA / sanity checks (§11). Run after scoring, before shipping.

HARD failures (exit 1): NaN/null ratings, a spike at 100 (tie/scaling bug).
SOFT diagnostics (warn): expected names not near the top, high D-slot correlation,
starved pool slots, skewed distribution. These are tuning signals, not build-breakers.

Determinism (§11) is checked by `run.py --verify-determinism`, which builds twice and
diffs the bytes; here we just print the output hash.
"""
import sys, os, json, hashlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
import pandas as pd
from common import load_config, work_path, repo_path

RATINGS = ["shooting", "scoring", "playmaking",
           "perimeter_d", "rim_protection", "rebounding"]

GREEN, RED, YEL, RST = "\033[32m", "\033[31m", "\033[33m", "\033[0m"


def _norm(s: str) -> str:
    return "".join(ch for ch in str(s).lower() if ch.isalnum())


def main():
    cfg = load_config()
    scored = pd.read_parquet(work_path(cfg, "scored.parquet"))
    with open(repo_path(cfg["paths"]["out"])) as f:
        gd = json.load(f)

    hard_fail, soft_warn = [], []
    N = len(scored)
    print(f"== QA on {N:,} universe rows ==\n")

    # 1. No NaNs / nulls in any of the six ratings for any shipped player
    null_players = [p["id"] for p in gd["players"]
                    if any(p["ratings"].get(c) is None for c in RATINGS)]
    nan_universe = int(sum(scored[c].isna().sum() for c in RATINGS))
    if null_players or nan_universe:
        hard_fail.append(f"null/NaN ratings: {len(null_players)} players, "
                         f"{nan_universe} universe cells")
    print(f"{'PASS' if not (null_players or nan_universe) else 'FAIL'}  no NaNs/nulls "
          f"(universe NaN cells={nan_universe}, shipped null players={len(null_players)})")

    # 2. Distribution ~uniform 0-100 (mean ~50, no spike at 100)
    for c in RATINGS:
        vals = scored[c].astype(float)
        mean = float(vals.mean())
        spike = float((vals == 100).mean())
        flag = ""
        if not (45 <= mean <= 55):
            soft_warn.append(f"{c}: mean {mean:.1f} off-center"); flag = YEL + " (mean off)" + RST
        if spike > 0.02:
            hard_fail.append(f"{c}: spike at 100 = {spike:.1%} (tie/scaling bug)")
            flag = RED + " (SPIKE@100)" + RST
        print(f"      {c:15s} mean={mean:5.1f}  frac@100={spike:5.2%}{flag}")

    # 3. Orthogonality of the two defensive slots (should be moderate, not ~1.0)
    corr = float(np.corrcoef(scored["perimeter_d"].astype(float),
                             scored["rim_protection"].astype(float))[0, 1])
    if corr > 0.85:
        soft_warn.append(f"perimeter_d vs rim_protection corr {corr:.2f} ~ 1 "
                         f"(consider BLK%-only rim protection, §7)")
    print(f"\n{'PASS' if corr <= 0.85 else 'WARN'}  orthogonality: "
          f"corr(perimeter_d, rim_protection) = {corr:.2f}")

    # 4. Pool fillability: a handful of pool players >= 90 in each ability
    pool_ids = {pid for roster in gd["pool"]["rosters"].values() for pid in roster}
    team_split = gd["meta"].get("rating_unit", "team_split") == "team_split"
    pool = scored[RATINGS].copy()
    if team_split and "team" in scored.columns:
        pool["id"] = [f"{p}_{int(s)}_{t}" for p, s, t in
                      zip(scored["player_id"], scored["season"], scored["team"])]
    else:
        pool["id"] = [f"{p}_{int(s)}" for p, s in zip(scored["player_id"], scored["season"])]
    pool = pool[pool["id"].isin(pool_ids)]
    print(f"\n      pool fillability (players >= 90), {len(pool)} pool player-seasons:")
    for c in RATINGS:
        n90 = int((pool[c].astype(float) >= 90).sum())
        if n90 < 3:
            soft_warn.append(f"{c}: only {n90} pool players >= 90 (slot starved, fix via pool)")
        print(f"      {c:15s} {n90} >= 90  {'' if n90>=3 else YEL+'(starved)'+RST}")

    # 5. Name regression: expected names surface near the top (§11 table)
    k = int(cfg["qa"]["top_k"])
    print(f"\n      expected names within top {k} (soft):")
    for c, names in cfg["qa"]["expect_top"].items():
        # rank by the continuous composite, not the rounded rating — otherwise the
        # ~0.5% tie-band at 100 breaks ties in row order and hides the true leaders.
        rank_col = f"_comp_{c}" if f"_comp_{c}" in scored.columns else c
        top = scored.nlargest(k, rank_col)
        present = {_norm(x) for x in top["player"]}
        found = [nm for nm in names if _norm(nm) in present]
        miss = [nm for nm in names if _norm(nm) not in present]
        ok = len(found) >= max(1, len(names) // 2)
        color = GREEN if ok else YEL
        if not ok:
            soft_warn.append(f"{c}: only {len(found)}/{len(names)} expected names in top {k}")
        print(f"      {color}{c:15s} {len(found)}/{len(names)}{RST}"
              + (f"  missing: {miss}" if miss else ""))

    # output hash (determinism handled by run.py --verify-determinism)
    h = hashlib.sha256(open(repo_path(cfg["paths"]["out"]), "rb").read()).hexdigest()
    print(f"\n      goat-data.json sha256 = {h[:16]}…")

    print("\n== summary ==")
    for w in soft_warn:
        print(f"  {YEL}WARN{RST} {w}")
    for fmsg in hard_fail:
        print(f"  {RED}FAIL{RST} {fmsg}")
    if hard_fail:
        print(f"\n{RED}QA FAILED{RST} ({len(hard_fail)} hard, {len(soft_warn)} warnings)")
        sys.exit(1)
    print(f"\n{GREEN}QA PASSED{RST} ({len(soft_warn)} soft warnings to consider while tuning)")


if __name__ == "__main__":
    main()
