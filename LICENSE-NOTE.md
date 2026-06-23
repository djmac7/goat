# Data provenance & license note (§1)

The raw season tables come from the Kaggle dataset
**sumitrodatta/nba-aba-baa-stats** ("NBA Stats (1947–present)"), which is itself
derived from **Basketball-Reference**.

- Basketball-Reference's ToS prohibits scraping. Using a pre-built bulk CSV for a
  **free, non-commercial fan project** is the pragmatic choice the project owner is
  accepting (same risk posture already taken on logos/photos in the main spec).
- The underlying numbers are **facts** (not copyrightable). The concern is the
  **compiled database**: so we
  - **cite the source** (Basketball-Reference via Kaggle), and
  - **do not redistribute the raw CSVs** as our own dataset — `data/raw/` is
    gitignored. We ship **only our derived ratings** (`goat-data.json`).
- If this stops being a free fan project, license bulk data commercially
  (Sports Reference / Sportradar).

Snapshot pinned for this build: see `snapshot` in `pipeline/config.yml`.
