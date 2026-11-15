# data/ — historical datasets (not shipped)

Populate per `training/README.md` §1 (Open-Meteo ERA5 archive, NWP
previous-runs, published flood-extent labels only). No synthetic data.
Layout: `data/raw/<city>_<var>.csv`, `data/processed/parquet/`,
`data/holdout_*.csv` for `training/evaluate.py`.
