#!/usr/bin/env python
"""03 — Normalize: per-100 volume (already in dataset, carried as-is) + empirical-Bayes
shrinkage of the percentage stats toward each season's league mean. Spec §5, §6.

Volume components (made 3s/2s) come from the per-100-possessions columns; never a
raw total or per-game value (§5). Percentages (3P%, FT%, 2P%, and at-rim FG%) are
shrunk per §6 before any ranking happens.

Writes: data/work/normalized.parquet  (adds *_shrunk columns + the season mu used)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
import pandas as pd
from common import load_config, work_path, shrink, league_rate_by_season


def main():
    cfg = load_config()
    df = pd.read_parquet(work_path(cfg, "universe.parquet"))
    K = cfg["shrink_K"]

    # --- §6 shrinkage: shrink each pct toward the SEASON's league rate mu ---
    specs = [
        ("fg3", "x3p", "x3pa", "fg3_pct_shrunk"),
        ("ft", "ft", "fta", "ft_pct_shrunk"),
        ("fg2", "x2p", "x2pa", "fg2_pct_shrunk"),
    ]
    for kkey, makes, att, outcol in specs:
        mu = league_rate_by_season(df, makes, att)
        df[f"mu_{kkey}"] = mu
        df[outcol] = shrink(df[makes], df[att], mu, float(K[kkey]))

    # --- §7 at-rim (1997+): shrink 0-3ft FG% on estimated 0-3ft attempts ---
    ar = cfg.get("at_rim", {})
    if ar.get("enabled") and "fg_percent_from_x0_3_range" in df.columns:
        season_ok = df["season"] >= int(ar["min_season"])
        p = pd.to_numeric(df["fg_percent_from_x0_3_range"], errors="coerce")
        share = pd.to_numeric(df["percent_fga_from_x0_3_range"], errors="coerce")
        # estimate 0-3ft attempts from total FGA * share-of-FGA in that range
        fga = pd.to_numeric(df.get("x2pa", 0), errors="coerce").fillna(0) \
            + pd.to_numeric(df.get("x3pa", 0), errors="coerce").fillna(0)
        n_rim = (fga * share).where(season_ok & p.notna())
        makes_rim = (p * n_rim)
        # league mu for at-rim FG%, by season, over rows that have it
        valid = season_ok & p.notna() & n_rim.notna()
        tmp = pd.DataFrame({"season": df["season"], "m": makes_rim, "a": n_rim})[valid]
        rate = (tmp.groupby("season")["m"].sum() / tmp.groupby("season")["a"].sum())
        mu_rim = df["season"].map(rate)
        df["at_rim_shrunk"] = np.where(
            valid,
            (makes_rim.fillna(0) + mu_rim * float(ar["K"])) / (n_rim.fillna(0) + float(ar["K"])),
            np.nan,
        )
    else:
        df["at_rim_shrunk"] = np.nan

    df.to_parquet(work_path(cfg, "normalized.parquet"), index=False)
    n_rim_present = int(df["at_rim_shrunk"].notna().sum())
    print(f"[03_normalize] shrank 3P%/FT%/2P% toward season means | "
          f"at-rim present on {n_rim_present:,} rows")


if __name__ == "__main__":
    main()
