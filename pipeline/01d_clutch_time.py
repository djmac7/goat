#!/usr/bin/env python
"""01d — Clutch-TIME scoring for the CLUTCH rating.

The game-winner signal (01c) is binary and rare — it only fires on a go-ahead dagger in
the final 24s. The archetype fans actually mean by "clutch" is broader: a player who
POURS IN POINTS in the closing minutes of a tight playoff game, ESPECIALLY when his team
is behind and has to score to win. This stage measures exactly that.

Reads the same play-by-play as 01c (data/raw2 — kaggle:eoinamoore/…, PlayByPlay.parquet)
and, over PLAYOFF games only, sums each player's points scored in the NBA-official
"clutch" window — last 5:00 of the 4th quarter or any overtime, score within 5 — with
points scored while TIED OR BEHIND weighted far above points scored while ahead (a
comeback closer outranks a frontrunner padding a lead). Made field goals score their
shot value; made free throws score 1 (crunch-time FTs are half the story when trailing).

  ct_pts = Σ points · (ct_trailing_weight if tied/behind-before-the-make else ct_leading_weight)

04_score wires this as a LIFT-ONLY arm of clutch_best (fmax against the playoff-box and
game-winner arms): it can only raise a proven crunch-time scorer, never drag anyone.

player_id is joined by normalized name + season against Advanced.csv, identically to 01c
(with pipeline/id_overrides.csv for ambiguities). Coverage: play-by-play starts ~1997;
pre-1997 seasons produce no rows and 04_score renormalizes the component away.

Deterministic: pinned parquet + pure pandas; no network, no clock.

Writes: data/work/clutch_time.parquet
"""
import sys, os, re, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
from common import load_config, work_path, repo_path

SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}


def norm_name(s):
    """lowercase, strip diacritics/punctuation/generational suffixes (mirror of 01b/01c)."""
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z ]", "", s)
    return " ".join(p for p in s.split() if p not in SUFFIXES)


def _clock_secs(c):
    m = re.match(r"PT(\d+)M([\d.]+)S", str(c))
    return int(m.group(1)) * 60 + float(m.group(2)) if m else np.nan


def extract_clutch_scoring(pbp_path, games, cfg):
    """Scan the play-by-play row-group by row-group, returning per (norm_name, season)
    the trailing-weighted clutch-time playoff points (ct_pts)."""
    cl = cfg.get("clutch", {})
    win = float(cl.get("ct_window_secs", 300.0))     # last N seconds of the period
    margin = float(cl.get("ct_margin", 5.0))         # "within 5" — close game
    trail_w = float(cl.get("ct_trailing_weight", 1.0))
    lead_w = float(cl.get("ct_leading_weight", 0.25))

    gt = games.set_index("gameId")
    f = pq.ParquetFile(pbp_path)
    cols = ["gameId", "period", "clock", "scoreHome", "scoreAway", "isFieldGoal",
            "shotResult", "shotValue", "actionType", "description",
            "playerFullName", "playerteamId", "gameDateTimeEst"]
    parts = []
    for rg in range(f.num_row_groups):
        t = f.read_row_group(rg, columns=cols).to_pandas()
        # clutch WINDOW: 4th period or OT, within the last `win` seconds
        t = t[(t["period"] >= 4) & t["playerFullName"].notna()]
        if t.empty:
            continue
        t["sec"] = t["clock"].map(_clock_secs)
        t = t[t["sec"] <= win]
        if t.empty:
            continue
        # PLAYOFFS only + home/away, via the games table (same as 01c)
        t["gameId"] = t["gameId"].astype(str)
        t = t.join(gt, on="gameId")
        t = t[t["gameType"] == "Playoffs"].copy()
        if t.empty:
            continue
        # SCORING events + points on the FINAL frame: made FG (shot value) or made FT (1).
        # The dataset mixes two source formats ("Made Shot"/"Free Throw" and "2pt"/"freethrow");
        # isFieldGoal + shotResult are normalized for FGs, but FT make/miss is only reliable via
        # the description ("MISS …" for a miss), so key FTs off that.
        at = t["actionType"].astype(str).str.lower().str.replace(" ", "", regex=False)
        desc_up = t["description"].astype(str).str.upper()
        res = t["shotResult"].astype(str)
        made_fg = (t["isFieldGoal"] == 1) & (res == "Made")
        made_ft = at.str.contains("freethrow", na=False) \
            & ~desc_up.str.contains("MISS", na=False) & ~res.str.contains("Miss", na=False)
        t = t[made_fg | made_ft]
        if t.empty:
            continue
        pts = np.where(made_ft.loc[t.index], 1.0,
                       pd.to_numeric(t["shotValue"], errors="coerce").fillna(2.0).to_numpy())
        sH = pd.to_numeric(t["scoreHome"], errors="coerce").to_numpy()
        sA = pd.to_numeric(t["scoreAway"], errors="coerce").to_numpy()
        home = (t["playerteamId"] == t["hometeamId"]).to_numpy()
        me_after = np.where(home, sH, sA).astype(float)
        opp_after = np.where(home, sA, sH).astype(float)
        me_before = me_after - pts               # score before this make (scores are post-event)
        opp_before = opp_after
        # WINDOW margin: close before the shot (|lead| <= margin); trailing = tied-or-behind
        close = np.abs(me_before - opp_before) <= margin
        trailing = me_before <= opp_before
        w = np.where(trailing, trail_w, lead_w)
        keep = np.isfinite(me_before) & np.isfinite(opp_before) & close
        t = t[keep].copy()
        if t.empty:
            continue
        t["ct"] = (pts * w)[keep]
        d = pd.to_datetime(t["gameDateTimeEst"], errors="coerce")
        t["season"] = (d.dt.year + (d.dt.month >= 9).astype(int)).astype("Int64")
        t["n"] = t["playerFullName"].map(norm_name)
        # pre-aggregate this row-group to keep memory flat; keep gameId so the sample-size
        # gate (distinct clutch-window games) survives games that straddle a row-group edge.
        parts.append(t.groupby(["n", "season", "gameId"], as_index=False)["ct"].sum())
    if not parts:
        return pd.DataFrame(columns=["n", "season", "ct_pts", "ct_g"])
    agg = (pd.concat(parts, ignore_index=True)
           .groupby(["n", "season"])
           .agg(ct_pts=("ct", "sum"), ct_g=("gameId", "nunique"))
           .reset_index())
    return agg


def join_player_id(agg, cfg):
    """Attach the Basketball-Reference player_id by (normalized name, season): exact ->
    single-token -> id_overrides.csv. Identical tiered match to 01b/01c."""
    adv = pd.read_csv(os.path.join(repo_path(cfg["paths"]["raw"]), "Advanced.csv"),
                      usecols=["season", "player", "player_id", "lg"])
    adv = adv[adv["lg"].astype("string").str.upper().isin(["NBA", "BAA"])]
    adv["n"] = adv["player"].map(norm_name)
    names = adv[["season", "n", "player_id"]].drop_duplicates()
    ambiguous = names.groupby(["season", "n"])["player_id"].nunique()
    ambiguous = set(ambiguous[ambiguous > 1].index)
    lut = names[~names.set_index(["season", "n"]).index.isin(ambiguous)] \
        .set_index(["season", "n"])["player_id"]
    agg["player_id"] = [lut.get((s, n)) for s, n in zip(agg["season"], agg["n"])]

    for token_of in (lambda n: n.split()[-1] if n else "",
                     lambda n: n.split()[0] if n else ""):
        unmatched = agg["player_id"].isna()
        if not unmatched.any():
            break
        names_t = names.copy()
        names_t["t"] = names_t["n"].map(token_of)
        uniq = names_t.groupby(["season", "t"])["player_id"].nunique()
        uniq_keys = set(uniq[uniq == 1].index)
        tlut = names_t[names_t.set_index(["season", "t"]).index.isin(uniq_keys)] \
            .drop_duplicates(["season", "t"]).set_index(["season", "t"])["player_id"]
        box_t = agg.loc[unmatched, "n"].map(token_of)
        box_uniq = box_t.groupby([agg.loc[unmatched, "season"], box_t]).transform("size") == 1
        agg.loc[unmatched, "player_id"] = [tlut.get((s, t)) if u else None
            for s, t, u in zip(agg.loc[unmatched, "season"], box_t, box_uniq)]

    ov_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "id_overrides.csv")
    if os.path.exists(ov_path):
        ov_lut = pd.read_csv(ov_path).set_index(["season", "norm_name"])["player_id"]
        agg["player_id"] = [ov_lut.get((s, n)) if pd.isna(p) else p
                            for s, n, p in zip(agg["season"], agg["n"], agg["player_id"])]
    return agg


def main():
    cfg = load_config()
    if not cfg.get("clutch", {}).get("enabled"):
        print("[01d_clutch_time] clutch disabled — skipping"); return
    raw2 = repo_path(cfg["paths"]["raw2"])
    pbp = os.path.join(raw2, "PlayByPlay.parquet")
    if not os.path.exists(pbp):
        raise SystemExit(f"[FATAL] missing {pbp} — download the box-score dataset into {raw2}/")

    games = pd.read_csv(os.path.join(raw2, "Games.csv"),
                        usecols=["gameId", "gameType", "hometeamId", "awayteamId"])
    games["gameId"] = games["gameId"].astype(str)

    print("[01d_clutch_time] scanning play-by-play for clutch-time playoff scoring "
          "(last 5:00, within 5, trailing-weighted)…")
    agg = extract_clutch_scoring(pbp, games, cfg)
    agg = join_player_id(agg, cfg)

    matched = agg["player_id"].notna()
    total = float(agg["ct_pts"].sum()) or 1.0
    rate = float(agg.loc[matched, "ct_pts"].sum()) / total
    print(f"[01d_clutch_time] player-seasons with clutch-time scoring: {len(agg):,} | "
          f"weighted points id-matched: {rate:.2%}")
    min_rate = float(cfg.get("clutch", {}).get("ct_min_match_rate",
                     cfg.get("clutch", {}).get("gw_min_match_rate", 0.90)))
    if rate < min_rate:
        miss = agg[~matched].groupby("n")["ct_pts"].sum().sort_values(ascending=False)
        print(miss.head(20).to_string())
        raise SystemExit(f"[FATAL] clutch-time id match {rate:.2%} < {min_rate:.0%} — "
                         f"extend pipeline/id_overrides.csv with the names above.")

    out = (agg[matched].groupby(["player_id", "season"], as_index=False)
           .agg(ct_pts=("ct_pts", "sum"), ct_g=("ct_g", "sum")))
    out["season"] = out["season"].astype(int)
    out = out.sort_values(["player_id", "season"]).reset_index(drop=True)
    os.makedirs(os.path.dirname(work_path(cfg, "x")), exist_ok=True)
    out.to_parquet(work_path(cfg, "clutch_time.parquet"), index=False)
    print(f"[01d_clutch_time] wrote {len(out):,} rows -> clutch_time.parquet "
          f"(total weighted clutch pts {out['ct_pts'].sum():,.0f})")


if __name__ == "__main__":
    main()
