#!/usr/bin/env python
"""01 — Ingest: load the season tables, join them, and reduce to the configured rating
unit. Spec §2, §3.

`rating_unit` (config.yml) selects the grain:
  team_split -> one row per (player_id, season, team) STINT; a traded player becomes
                multiple rows, each carrying only that team's stats. (current default)
  season     -> one row per (player_id, season), traded players collapsed to the
                combined season-total row.

Either way we also capture per-team membership for roster building.

Writes:
  data/work/ingested.parquet        one row per rating unit
  data/work/team_membership.parquet per-team rows (player_id, season, team, mp)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pandas as pd
from common import (
    load_config, read_table, work_path, collapse_to_season, keep_team_stints,
    is_agg_team,
)


def main():
    cfg = load_config()
    unit = cfg.get("rating_unit", "team_split")
    if unit == "team_split":
        reduce_rows, KEY = keep_team_stints, ["player_id", "season", "team"]
    elif unit == "season":
        reduce_rows, KEY = collapse_to_season, ["player_id", "season"]
    else:
        raise SystemExit(f"[01_ingest] unknown rating_unit {unit!r} (use team_split|season)")

    # --- load the four season tables (the Advanced table is the spine, §2) ---
    advanced = read_table(cfg, "Advanced.csv", [
        "season", "lg", "player", "player_id", "age", "team", "pos", "g", "mp",
        "x3p_ar", "f_tr", "orb_percent", "drb_percent", "trb_percent",
        "ast_percent", "stl_percent", "blk_percent", "tov_percent", "ts_percent",
        "usg_percent", "dbpm", "dws",
    ])
    per100 = read_table(cfg, "Per 100 Poss.csv", [
        "season", "player_id", "team", "x3p_per_100_poss", "x2p_per_100_poss",
    ])
    totals = read_table(cfg, "Player Totals.csv", [
        "season", "player_id", "team",
        "x3p", "x3pa", "x3p_percent", "x2p", "x2pa", "x2p_percent",
        "ft", "fta", "ft_percent", "ast", "tov", "trb", "stl", "blk", "pts",
    ])
    pergame = read_table(cfg, "Player Per Game.csv", [
        "season", "player_id", "team", "pts_per_game",
    ])  # loaded per §2; pts_per_game is used only as a roster tie-break in §5

    # --- reduce each table to the rating unit (§3). `team` is kept and is part of the
    # join key under team_split; under season it is collapsed away by the reducer. ---
    adv1 = reduce_rows(advanced[[
        "season", "lg", "player", "player_id", "age", "team", "pos", "g", "mp",
        "x3p_ar", "f_tr", "orb_percent", "drb_percent", "trb_percent",
        "ast_percent", "stl_percent", "blk_percent", "tov_percent", "ts_percent",
        "usg_percent", "dbpm", "dws",
    ]])
    # other tables: keep only the join key + their stat columns (drop their own mp/team
    # when not in KEY to avoid colliding with the advanced spine).
    drop_extra = [c for c in ("team", "mp") if c not in KEY]
    per100_1 = reduce_rows(
        per100[["season", "player_id", "team", "mp",
                "x3p_per_100_poss", "x2p_per_100_poss"]]
    ).drop(columns=drop_extra)
    totals_1 = reduce_rows(
        totals[["season", "player_id", "team", "mp",
                "x3p", "x3pa", "x3p_percent", "x2p", "x2pa", "x2p_percent",
                "ft", "fta", "ft_percent", "ast", "tov", "trb", "stl", "blk", "pts"]]
    ).drop(columns=drop_extra)

    # --- join on the rating-unit key; advanced is the spine ---
    df = adv1.merge(totals_1, on=KEY, how="left").merge(per100_1, on=KEY, how="left")

    # optional at-rim source (Player Shooting, 1997+) — merged if present (§7)
    if cfg.get("at_rim", {}).get("enabled"):
        shooting = read_table(cfg, "Player Shooting.csv", [
            "season", "player_id", "team", "fg_percent_from_x0_3_range",
            "percent_fga_from_x0_3_range",
        ])
        sh1 = reduce_rows(
            shooting[["season", "player_id", "team",
                      "fg_percent_from_x0_3_range", "percent_fga_from_x0_3_range"]]
        ).drop(columns=[c for c in ("team",) if c not in KEY])
        df = df.merge(sh1, on=KEY, how="left")

    # --- team membership for rosters: the per-team (non-aggregate) rows (§3) ---
    tm = totals[["season", "player_id", "team", "mp", "lg"]].copy()
    tm = tm[~is_agg_team(tm["team"])]
    tm = tm.merge(pergame[["season", "player_id", "team", "pts_per_game"]],
                  on=["season", "player_id", "team"], how="left")

    os.makedirs(os.path.dirname(work_path(cfg, "x")), exist_ok=True)
    df.to_parquet(work_path(cfg, "ingested.parquet"), index=False)
    tm.to_parquet(work_path(cfg, "team_membership.parquet"), index=False)

    print(f"[01_ingest] rating_unit={unit} | rows: {len(df):,} | "
          f"team-membership rows: {len(tm):,} | columns: {len(df.columns)}")


if __name__ == "__main__":
    main()
