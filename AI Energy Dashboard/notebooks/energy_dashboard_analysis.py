# %% [markdown]
# # ISO 50001 monthly energy performance: analysis engine for the dashboard
#
# **What this notebook does (all deterministic, no LLM):**
# 1. Loads monthly energy data per *plant* and *SEU* (significant energy use).
# 2. Fits an **Energy Baseline (EnB)** per SEU on the baseline period (ISO 50001 cl. 6.5; ISO 50006).
# 3. Computes **EnPI** results: expected vs actual energy, deviation, SEC, CUSUM (cl. 6.4, 9.1.1).
# 4. Ranks which SEUs drive each plant's energy and its **excess** energy (Pareto, cl. 6.3).
# 5. Explains **why** energy is high: splits the change into *volume*, *weather* and *efficiency* effects, detects the **pattern** (drift / step / spike), and checks the **events log**.
# 6. Attaches **hypotheses, verification checks and corrective actions** from `data/knowledge_base.json` (ISO 50002-style "verify on site" thinking).
# 7. Finds **future improvement** opportunities (base load, weather sensitivity, best-demonstrated gap).
# 8. Exports **`output/dashboard_data.json`**, the single file that the dashboard (built in Google AI Studio) reads, plus a ready-to-open reference dashboard (`output/dashboard.html`).
#
# **Golden rule:** the LLM / dashboard never calculates an EnPI. Every number comes from this notebook, so it is auditable.
#
# **How to run:** VS Code (Python + Jupyter extensions) or Google Colab. Run all cells top to bottom.
# Only the **CONFIG** cell below normally needs editing.

# %%
# 1. Setup and configuration
import itertools
import json
import math
import warnings
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

warnings.filterwarnings("ignore", category=RuntimeWarning)
pd.set_option("display.width", 170)
pd.set_option("display.max_columns", 40)

# Project root = the folder that contains data/ (works if the notebook is opened from notebooks/).
# In Google Colab: upload the data folder to /content and use ROOT = Path("/content")
ROOT = Path.cwd()
if not (ROOT / "data").exists() and (ROOT.parent / "data").exists():
    ROOT = ROOT.parent
DATA, OUT = ROOT / "data", ROOT / "output"
OUT.mkdir(exist_ok=True)

CONFIG = dict(
    # ---- input files (inside data/) ----
    energy_file="energy_monthly_demo.csv",
    register_file="seu_register_demo.csv",
    events_file="events_demo.csv",              # optional; set None if you have no events log
    # Excel input: set the three *_file values above to one workbook name (e.g. "energy_input.xlsx") and name the sheets:
    energy_sheet="energy_monthly", register_sheet="seu_register", events_sheet="events",   # ignored for CSV files
    kb_file="knowledge_base.json",
    answer_key_file="demo_answer_key.json",     # DEMO ONLY (self-check); set None for real data
    data_is_synthetic=True,                     # shown as a banner in the dashboard
    # ---- ISO 50001 baseline / reporting ----
    baseline_start="2023-10-01",
    baseline_end="2025-09-01",                  # 12-24 months is typical
    report_month=None,                          # None = latest month in the data
    window_months=12,                           # "last 12 months" window used for ranking and diagnosis
    band_pct=5.0,                               # alarm band: +/- % deviation from expected
    # ---- model acceptance (ISO 50006 / IPMVP-style guidance; tune to your procedure) ----
    max_p=0.05, min_r2=0.75, cv_rmse_max_pct=15.0, cv_flat_ok_pct=3.0,
    # ---- ranking / improvement triggers ----
    pareto_cutoff=0.80,                         # SEUs making up the first 80% of plant energy are flagged significant
    low_production_frac=0.82,                   # production below this fraction of the baseline mean counts as a "turndown" month
    baseload_share_trigger=0.60,                # share of energy not proportional to production
    # ---- confidentiality helpers (use before sending data to any cloud tool) ----
    anonymize=False, scale_energy=1.0, scale_production=1.0,
)

# !! PLACEHOLDERS: replace with your real tariffs and emission factors (per GJ of the carrier) !!
TARIFF_IDR_PER_GJ = {"electricity": 400_000, "steam": 200_000, "fuel_gas": 100_000}
EMISSION_T_PER_GJ = {"electricity": 0.24, "steam": 0.07, "fuel_gas": 0.056}

# Conversion to GJ for the `energy_value` + `unit` input style (exact SI/IEA factors except t_steam).
UNIT_TO_GJ = {"GJ": 1.0, "MJ": 0.001, "kWh": 0.0036, "MWh": 3.6, "MMBtu": 1.055056, "Gcal": 4.1868,
              "t_steam": 2.7}   # !! PLACEHOLDER: GJ per tonne of steam depends on pressure/temperature and condensate return; use your own !!

VARS = ["production_ton", "ambient_temp_c"]     # candidate relevant variables (ISO 50001 cl. 6.4/6.5)
BASELINE_END = pd.Timestamp(CONFIG["baseline_end"])
BASELINE_START = pd.Timestamp(CONFIG["baseline_start"])
print("Project root:", ROOT)

# %% [markdown]
# ## 2. Load and validate the data
# Required columns in the energy file: `period, plant, seu, carrier, energy_gj, production_ton, ambient_temp_c`
# (optional `data_quality` = measured | estimated | missing).
# The SEU register adds names and the **SEU type** (pump, compressor, ...), which selects the right checks and actions from the knowledge base.

# %%
def read_table(name, sheet=None):
    """Read a CSV, or one sheet of an Excel file (put your data in an Excel Table / plain range with a header row)."""
    path = DATA / name
    if path.suffix.lower() in (".xlsx", ".xlsm"):
        return pd.read_excel(path, sheet_name=sheet or 0)
    return pd.read_csv(path)


energy = read_table(CONFIG["energy_file"], CONFIG.get("energy_sheet"))
register = read_table(CONFIG["register_file"], CONFIG.get("register_sheet"))

# Units: provide `energy_gj` directly, OR `energy_value` + `unit` (converted with UNIT_TO_GJ in the CONFIG cell).
if "energy_gj" not in energy.columns:
    assert {"energy_value", "unit"} <= set(energy.columns), "Provide either energy_gj, or energy_value + unit"
    unknown = sorted(set(energy["unit"].dropna()) - set(UNIT_TO_GJ))
    assert not unknown, f"Unknown unit(s) {unknown}: add them to UNIT_TO_GJ in the CONFIG cell"
    if "t_steam" in set(energy["unit"]):
        print("WARNING: steam tonnes converted with the PLACEHOLDER factor in UNIT_TO_GJ['t_steam']; set your own enthalpy-based value.")
    energy["energy_gj"] = energy["energy_value"] * energy["unit"].map(UNIT_TO_GJ)

REQUIRED = ["period", "plant", "seu", "carrier", "energy_gj", "production_ton", "ambient_temp_c"]
miss = [c for c in REQUIRED if c not in energy.columns]
assert not miss, f"Missing required columns in energy file: {miss}"
if "data_quality" not in energy.columns:
    energy["data_quality"] = "measured"
energy["period"] = pd.to_datetime(energy["period"]).dt.to_period("M").dt.to_timestamp()
assert not energy.duplicated(["period", "plant", "seu"]).any(), "Duplicate (period, plant, seu) rows"
energy.loc[energy["energy_gj"].isna(), "data_quality"] = "missing"

events = None
if CONFIG["events_file"] and (DATA / CONFIG["events_file"]).exists():
    events = read_table(CONFIG["events_file"], CONFIG.get("events_sheet"))
    events["start"], events["end"] = pd.to_datetime(events["start"]), pd.to_datetime(events["end"])

if CONFIG["anonymize"]:                                   # keeps % deviations, hides absolute scale and names
    pmap = {p: f"SITE_{i + 1}" for i, p in enumerate(sorted(energy["plant"].unique()))}
    for df_ in (energy, register) + ((events,) if events is not None else ()):
        df_["plant"] = df_["plant"].map(pmap)
    register["plant_name"] = register["plant"].str.replace("_", " ").str.title()
    energy["energy_gj"] *= CONFIG["scale_energy"]
    energy["production_ton"] *= CONFIG["scale_production"]

energy = energy.merge(register[["plant", "seu", "plant_name", "seu_name", "seu_type"]],
                      on=["plant", "seu"], how="left")
unreg = energy[energy["seu_type"].isna()][["plant", "seu"]].drop_duplicates()
if len(unreg):
    print("WARNING: SEUs missing from the register (generic advice will be used):\n", unreg)
    energy["seu_type"] = energy["seu_type"].fillna("generic")
    energy["seu_name"] = energy["seu_name"].fillna(energy["seu"])
    energy["plant_name"] = energy["plant_name"].fillna(energy["plant"])

REPORT_MONTH = pd.Timestamp(CONFIG["report_month"]) if CONFIG["report_month"] else energy["period"].max()
all_months = sorted(energy["period"].unique())
W = CONFIG["window_months"]
months_w12 = [m for m in all_months if REPORT_MONTH - pd.DateOffset(months=W - 1) <= m <= REPORT_MONTH]
months_w3 = months_w12[-3:]
months_m1 = [REPORT_MONTH]
print(f"{len(energy)} rows | plants: {energy['plant'].nunique()} | SEUs: {energy[['plant','seu']].drop_duplicates().shape[0]}")
print(f"Baseline {BASELINE_START:%Y-%m}..{BASELINE_END:%Y-%m} | report month {REPORT_MONTH:%Y-%m} | window {months_w12[0]:%Y-%m}..{months_w12[-1]:%Y-%m}")

# %%
# Data-quality log (ISO 50001 cl. 6.6: plan for data collection; bad data = bad EnPI)
dq_rows = []
for (plant, seu), g in energy.groupby(["plant", "seu"]):
    base = g[(g["period"] >= BASELINE_START) & (g["period"] <= BASELINE_END)]
    win = g[g["period"].isin(months_w12)]
    for label, sub in (("baseline", base), ("report window", win)):
        for q in ("missing", "estimated"):
            n = int((sub["data_quality"] == q).sum())
            if n:
                dq_rows.append(dict(plant=plant, seu=seu, period=label, issue=q, months=n,
                                    detail=", ".join(f"{p:%Y-%m}" for p in sub.loc[sub["data_quality"] == q, "period"])))
dq = pd.DataFrame(dq_rows)
print("No data-quality issues." if dq.empty else dq.to_string(index=False))

# %% [markdown]
# ## 3. Energy Baseline (EnB) per SEU
# Model: **E = a + b·Production + c·Temperature** fitted on the baseline period (ISO 50001 cl. 6.5, ISO 50006).
# For every SEU the notebook tries all variable combinations (none / production / temperature / both) and keeps the one with the best *adjusted R²* **whose slopes are all statistically significant** (p ≤ `max_p`).
# This automatically drops a production term where there is no real production dependence (e.g. HVAC).
# Quality gate: R² and CV(RMSE). Models that fail are flagged **review**; **re-baselining is a controlled event, never automatic.**

# %%
def fit_ols(X, y):
    n, k = X.shape
    beta = np.linalg.lstsq(X, y, rcond=None)[0]
    resid = y - X @ beta
    dof = n - k
    sse = float(resid @ resid)
    s2 = sse / dof
    se = np.sqrt(np.diag(s2 * np.linalg.inv(X.T @ X)))
    pvals = 2 * stats.t.sf(np.abs(beta / se), dof)
    sst = float(((y - y.mean()) ** 2).sum())
    r2 = 1 - sse / sst if sst > 0 else 0.0
    return dict(beta=beta, pvals=pvals, r2=r2, adj_r2=1 - (1 - r2) * (n - 1) / dof, rmse=math.sqrt(s2), n=n)


def select_model(g):
    g = g.dropna(subset=["energy_gj"])
    avail = [v for v in VARS if g[v].notna().mean() >= 0.8]
    g = g.dropna(subset=avail)
    y = g["energy_gj"].to_numpy(float)
    cands = [()] + [c for r in range(1, len(avail) + 1) for c in itertools.combinations(avail, r)]
    fits = []
    for vs in cands:
        X = np.column_stack([np.ones(len(g))] + [g[v].to_numpy(float) for v in vs])
        if len(g) - X.shape[1] < 4:
            continue
        f = fit_ols(X, y)
        fits.append((vs, f, all(f["pvals"][1:] <= CONFIG["max_p"])))
    # valid = every slope significant AND a physically plausible (non-negative) production slope
    def plausible(x):
        vs_, f_, _ = x
        return all(b >= 0 for v_, b in zip(vs_, f_["beta"][1:]) if v_ == "production_ton")
    valid = [x for x in fits if x[2] and x[0] and plausible(x)]
    vs, f, _ = max(valid, key=lambda x: x[1]["adj_r2"]) if valid else fits[0]
    ybar = float(y.mean())
    cv = f["rmse"] / ybar * 100
    ok = cv <= CONFIG["cv_rmse_max_pct"] and (f["r2"] >= CONFIG["min_r2"] or cv <= CONFIG["cv_flat_ok_pct"])
    return dict(
        variables=list(vs), intercept=float(f["beta"][0]),
        coefs={v: float(b) for v, b in zip(vs, f["beta"][1:])},
        p_values={v: float(p) for v, p in zip(vs, f["pvals"][1:])},
        r2=float(f["r2"]), adj_r2=float(f["adj_r2"]), cv_rmse_pct=float(cv), sigma_pct=float(cv),
        n_points=int(f["n"]), y_ref=ybar,
        means={v: float(g[v].mean()) for v in avail},
        ranges={v: [float(g[v].min()), float(g[v].max())] for v in avail}, quality="good" if ok else "review")


base_df = energy[(energy["period"] >= BASELINE_START) & (energy["period"] <= BASELINE_END)]
models = {key: select_model(g) for key, g in base_df.groupby(["plant", "seu"])}

mt = pd.DataFrame([dict(plant=k[0], seu=k[1], vars="+".join(m["variables"]) or "(mean only)", n=m["n_points"],
                        R2=round(m["r2"], 3), CV_RMSE_pct=round(m["cv_rmse_pct"], 2), quality=m["quality"],
                        intercept=round(m["intercept"], 1),
                        **{f"coef_{v[:4]}": round(c, 3) for v, c in m["coefs"].items()}) for k, m in models.items()])
mt

# %% [markdown]
# ## 4. EnPI table: expected vs actual, deviation, SEC, CUSUM, and the "why" decomposition
# For each SEU-month:
# * `expected_gj` = EnB model at the *actual* production and temperature
# * `deviation = actual − expected` (positive = worse than the baseline predicts)
# * `cusum_gj` = running total of deviation since the baseline ended (a rising line = a persistent loss)
#
# **Decomposition (the "why is it high" engine).** Compared with an *average baseline month* (`y_ref`, the mean baseline energy), the change in energy splits exactly into
# `change = volume effect + weather effect + efficiency effect`, where
# volume = b·(P − P̄), weather = c·(T − T̄), efficiency = actual − expected.
# Volume and weather are *explained by conditions*; only the **efficiency effect** is a real performance change.

# %%
tariff = pd.Series(TARIFF_IDR_PER_GJ)
ef = pd.Series(EMISSION_T_PER_GJ)
parts = []
for (plant, seu), g in energy.sort_values("period").groupby(["plant", "seu"], sort=False):
    m = models.get((plant, seu))
    if m is None:
        print(f"skip {plant}/{seu}: no baseline data")
        continue
    g = g.copy()
    exp = np.full(len(g), m["intercept"], dtype=float)
    for v, c in m["coefs"].items():
        exp = exp + c * g[v].to_numpy(float)
    g["expected_gj"] = exp
    g["imputed"] = g["energy_gj"].isna()
    g["actual_f"] = g["energy_gj"].fillna(g["expected_gj"])        # missing months are imputed with the model (flagged)
    g["deviation_gj"] = g["actual_f"] - g["expected_gj"]
    g["deviation_pct"] = g["deviation_gj"] / g["expected_gj"] * 100
    g["sec"] = g["actual_f"] / g["production_ton"]
    g["cusum_gj"] = pd.Series(np.where(g["period"] > BASELINE_END, g["deviation_gj"], 0.0), index=g.index).cumsum()
    pm = m["means"]
    g["vol_gj"] = m["coefs"].get("production_ton", 0.0) * (g["production_ton"] - pm.get("production_ton", 0.0)) if "production_ton" in m["coefs"] else 0.0
    g["wx_gj"] = m["coefs"].get("ambient_temp_c", 0.0) * (g["ambient_temp_c"] - pm.get("ambient_temp_c", 0.0)) if "ambient_temp_c" in m["coefs"] else 0.0
    g["eff_gj"] = g["deviation_gj"]
    g["change_gj"] = g["actual_f"] - m["y_ref"]
    out = np.zeros(len(g), dtype=bool)                       # month outside the operating range the baseline was fitted on
    for v in m["coefs"]:
        lo, hi = m["ranges"][v]
        pad = 0.10 * (hi - lo)
        out |= ((g[v] < lo - pad) | (g[v] > hi + pad)).to_numpy()
    g["outside_range"] = out
    g["cost_idr"] = g["deviation_gj"] * g["carrier"].map(tariff)
    g["co2_t"] = g["deviation_gj"] * g["carrier"].map(ef)
    parts.append(g)
enpi = pd.concat(parts, ignore_index=True)

# Self-check: the decomposition must add up exactly (volume + weather + efficiency = change vs average baseline month)
resid = (enpi["vol_gj"] + enpi["wx_gj"] + enpi["eff_gj"] - enpi["change_gj"]).abs().max()
assert resid < 1e-6, f"Decomposition does not add up (max residual {resid})"
print(f"Decomposition identity holds (max residual {resid:.2e} GJ). EnPI rows: {len(enpi)}")
enpi[enpi["period"] == REPORT_MONTH][["plant", "seu", "actual_f", "expected_gj", "deviation_gj", "deviation_pct", "sec", "cusum_gj"]].round(2)

# %% [markdown]
# ## 5. Pattern detection on the last 12 months of deviation
# Each SEU's monthly deviation% is classified as one of: **within band, drift, step, spike, persistent offset/high/low**.
# * *Spike*: a single month far outside the band whose neighbours are inside it.
# * Otherwise three shapes compete by BIC (constant vs linear drift vs one-step change); a complex shape must beat "constant" by a margin, so noise is not read as a trend.
# The detected shape drives which checks and actions are suggested (a drift suggests fouling/wear; a step suggests a change of line-up/setpoint).

# %%
def classify_pattern(dev, band, sigma, margin=2.0, step_penalty=3.0, min_effect=0.5, clear_gap=6.0):
    """Classify a monthly deviation-% series. Returns type, direction, onset, magnitude, slope and a confidence flag."""
    y = np.asarray(dev, float)
    n = len(y)
    ok = ~np.isnan(y)
    sig = max(sigma, 0.5)
    res = dict(type="insufficient_data", direction=0, onset_idx=None, magnitude_pct=None, slope_pct_per_month=None,
               spike_idx=[], spike_current=False, confidence="n/a", change_idx=None, change_pct=None)
    if ok.sum() < 6:
        return res
    # 1) isolated spikes: one month far outside the band whose neighbours are inside it
    spikes = []
    for i in range(n):
        if ok[i] and abs(y[i]) > max(2 * band, 3 * sig):
            nb = [y[j] for j in (i - 1, i + 1) if 0 <= j < n and ok[j]]
            if nb and all(abs(v) <= band for v in nb):
                spikes.append(i)
    res["spike_idx"] = spikes
    res["spike_current"] = (n - 1) in spikes
    keep = ok.copy()
    keep[spikes] = False
    t = np.arange(n)[keep].astype(float)
    v = y[keep]
    m = len(v)
    if m < 6:
        return res
    # 2) shapes compete by BIC: constant vs linear drift vs one step change
    floor = (0.5 * sig) ** 2
    def bic(sse, k):
        return m * math.log(max(sse / m, floor)) + k * math.log(m)
    scores = {"const": bic(float(((v - v.mean()) ** 2).sum()), 1)}
    A = np.column_stack([np.ones(m), t])
    coef = np.linalg.lstsq(A, v, rcond=None)[0]
    total_lin = float(coef[1] * (t[-1] - t[0]))
    lin = bic(float(((v - A @ coef) ** 2).sum()), 2)
    best = None
    for tau in range(3, m - 2):                              # >= 3 points on each side
        sse = float(((v[:tau] - v[:tau].mean()) ** 2).sum() + ((v[tau:] - v[tau:].mean()) ** 2).sum())
        if best is None or sse < best[0]:
            best = (sse, tau)
    step_mag = float(v[best[1]:].mean() - v[:best[1]].mean()) if best else 0.0
    step = bic(best[0], 3) + step_penalty if best else np.inf   # penalty: a ramp should not be over-called as a step
    if best and abs(step_mag) >= min_effect * band:              # best-guess change month, kept even if the shape is called a drift
        res["change_idx"], res["change_pct"] = int(t[best[1]]), step_mag
    # a complex shape needs (a) a BIC win over "constant" by `margin` and (b) a practical effect size
    if abs(total_lin) >= min_effect * band and lin + margin < scores["const"]:
        scores["linear"] = lin
    if best and abs(step_mag) >= min_effect * band and step + margin < scores["const"]:
        scores["step"] = step
    shape = min(scores, key=scores.get)
    others = sorted(s for k, s in scores.items() if k != shape)
    gap = (others[0] - scores[shape]) if others else 99.0
    res["confidence"] = "clear" if gap >= clear_gap else "tentative"
    if shape == "linear":
        res.update(type="drift" if coef[1] > 0 else "improving_trend", direction=1 if coef[1] > 0 else -1,
                   slope_pct_per_month=float(coef[1]), onset_idx=int(t[0]), magnitude_pct=total_lin)
    elif shape == "step":
        res.update(type="step", direction=1 if step_mag > 0 else -1, onset_idx=int(t[best[1]]), magnitude_pct=step_mag)
    else:
        mu = float(v.mean())
        if mu >= band:
            res.update(type="persistent_high", direction=1, magnitude_pct=mu)
        elif mu <= -band:
            res.update(type="persistent_low", direction=-1, magnitude_pct=mu)
        else:
            se = float(v.std(ddof=1)) / math.sqrt(m)
            if abs(mu) >= 0.4 * band and abs(mu) / max(se, 1e-9) >= 3:      # steady offset inside the band (a CUSUM would climb)
                res.update(type="persistent_offset", direction=1 if mu > 0 else -1, magnitude_pct=mu)
            else:
                res.update(type="within_band", magnitude_pct=mu)
    if res["spike_current"] or (spikes and res["type"] == "within_band"):
        res["type_before_spike"] = res["type"]
        res["type"] = "spike"
        res["direction"] = 1 if y[spikes[-1]] > 0 else -1
        res["magnitude_pct"] = float(y[spikes[-1]])
        res["confidence"] = "clear"
    return res


# Deterministic unit tests (fixed series with small repeatable "noise", so the test never flakes)
_noise = np.array([0.6, -0.4, 0.3, -0.7, 0.5, -0.2, 0.7, -0.5, 0.1, -0.6, 0.4, -0.3])
assert classify_pattern(0.5 * np.arange(1, 13) + _noise, 5, 1.5)["type"] == "drift"
assert classify_pattern(np.r_[np.zeros(4), np.full(8, 8.0)] + _noise, 5, 1.5)["type"] == "step"
assert classify_pattern(np.r_[np.zeros(5), [25.0], np.zeros(6)] + _noise, 5, 1.5)["type"] == "spike"
assert classify_pattern(_noise, 5, 1.5)["type"] == "within_band"
assert classify_pattern(np.r_[np.zeros(6), np.full(6, -6.0)] + _noise, 5, 1.5)["direction"] == -1
assert classify_pattern(np.full(12, 3.0) + _noise, 5, 1.5)["type"] == "persistent_offset"
print("pattern classifier unit tests passed")

# %% [markdown]
# ## 6. Window aggregates, status, verdict, savings
# Windows: **report month**, **last 3 months**, **last 12 months**.
# **Status** (traffic light, from the last-3-month mean deviation vs the ±band): `critical` ≥ 2×band, `high` ≥ band, `watch` = a worsening drift/step that has not crossed the band yet, `improved` ≤ −band, else `normal`.
# **Verdict** explains the situation in words: *performance_loss*, *early_warning*, *improvement*, *activity_driven* (SEC up only because production is low), *resolved_spike*, *normal*.

# %%
def agg(df, months):
    s = df[df["period"].isin(months)]
    a, e, p = s["actual_f"].sum(), s["expected_gj"].sum(), s["production_ton"].sum()
    return dict(
        actual_gj=a, expected_gj=e, deviation_gj=a - e, deviation_pct=(a - e) / e * 100 if e else None,
        production_ton=p, sec_gj_per_ton=a / p if p else None,
        volume_gj=s["vol_gj"].sum(), weather_gj=s["wx_gj"].sum(), efficiency_gj=s["eff_gj"].sum(),
        change_vs_baseline_gj=s["change_gj"].sum(),
        cost_impact_idr=s["cost_idr"].sum(), co2_impact_t=s["co2_t"].sum(),
        n_months=int(len(s)), n_imputed=int(s["imputed"].sum()), n_estimated=int((s["data_quality"] == "estimated").sum()))


def fmt_m(ts):
    return None if ts is None else pd.Timestamp(ts).strftime("%Y-%m")


def evaluate_seu(g, m, kb, ev_df):
    band = CONFIG["band_pct"]
    g = g.sort_values("period")
    wdf = g[g["period"].isin(months_w12)].reset_index(drop=True)
    pat = classify_pattern(wdf["deviation_pct"].where(~wdf["imputed"]).to_numpy(), band, m["sigma_pct"])
    last3 = wdf["deviation_pct"].tail(3).mean()
    cur = wdf["deviation_pct"].iloc[-1]
    # status
    projected = None
    if pat["type"] == "drift" and pat["slope_pct_per_month"] and 0 < last3 < band:
        projected = (band - last3) / pat["slope_pct_per_month"]
    if last3 >= 2 * band or cur >= 2 * band:
        status = "critical" if last3 >= 2 * band else "high"
    elif last3 >= band:
        status = "high"
    elif last3 <= -band and not pat["spike_current"]:
        status = "improved"
    elif pat["type"] in ("drift", "step", "persistent_offset") and pat["direction"] > 0 and (last3 > 0.4 * band or (projected is not None and projected <= 6)):
        status = "watch"
    else:
        status = "normal"
    # first month of the current continuous run above the band
    run_start = None
    for i in range(len(wdf) - 1, -1, -1):
        if wdf.loc[i, "deviation_pct"] >= band:
            run_start = wdf.loc[i, "period"]
        else:
            break
    onset = wdf.loc[pat["onset_idx"], "period"] if pat["onset_idx"] is not None and pat["onset_idx"] < len(wdf) else None
    spike_months = [wdf.loc[i, "period"] for i in pat["spike_idx"]]
    # months where SEC is high only because production is low (not a performance loss)
    base_rows = g[(g["period"] >= BASELINE_START) & (g["period"] <= BASELINE_END) & ~g["imputed"]]
    base_sec = base_rows["actual_f"].sum() / base_rows["production_ton"].sum()
    wdf["sec_vs_base_pct"] = (wdf["sec"] / base_sec - 1) * 100
    # SEC clearly above baseline while production is clearly low and energy still follows the model = load effect, not efficiency loss
    p_ref = m["means"].get("production_ton")
    has_prod = "production_ton" in m["coefs"] and p_ref
    low_prod = (wdf["production_ton"] <= CONFIG["low_production_frac"] * p_ref) if has_prod else pd.Series(False, index=wdf.index)
    act_months = wdf.loc[low_prod & (wdf["sec_vs_base_pct"] >= band) & (wdf["deviation_pct"].abs() < band), "period"].tolist()
    change_month = wdf.loc[pat["change_idx"], "period"] if pat["change_idx"] is not None and pat["change_idx"] < len(wdf) else None
    # events near the anomaly
    seu_events, near_events = [], []
    if ev_df is not None:
        plant, seu = g["plant"].iloc[0], g["seu"].iloc[0]
        e = ev_df[(ev_df["plant"] == plant) & (ev_df["seu"].isin([seu, "*"]))]
        lo, hi = months_w12[0], months_w12[-1] + pd.offsets.MonthEnd(0)
        e = e[(e["start"] <= hi) & (e["end"] >= lo)]
        anchors = ([onset] if onset is not None else []) + spike_months + ([run_start] if run_start is not None else []) + ([change_month] if change_month is not None else [])
        for _, r in e.iterrows():
            rec = dict(event_type=r["event_type"], description=r["description"], start=r["start"].strftime("%Y-%m-%d"), end=r["end"].strftime("%Y-%m-%d"))
            seu_events.append(rec)
            if any(r["start"] - pd.DateOffset(months=1) <= a <= r["end"] + pd.DateOffset(months=1) for a in anchors) or r["event_type"] == "production_turndown" and act_months:
                near_events.append(rec)
    # verdict
    if status in ("critical", "high"):
        verdict = "performance_loss"
    elif status == "watch":
        verdict = "early_warning"
    elif status == "improved":
        verdict = "improvement"
    elif len(act_months) >= 2:
        verdict = "activity_driven"
    elif pat["type"] == "spike":
        verdict = "resolved_spike"
    else:
        verdict = "normal"
    return dict(wdf=wdf, pat=pat, status=status, verdict=verdict, last3=last3, cur=cur, projected=projected, run_start=run_start,
                onset=onset, change_month=change_month, spike_months=spike_months, act_months=act_months, base_sec=base_sec, events=seu_events, near_events=near_events)


kb = json.loads((DATA / CONFIG["kb_file"]).read_text())
seu_eval = {}
for (plant, seu), g in enpi.groupby(["plant", "seu"], sort=False):
    seu_eval[(plant, seu)] = evaluate_seu(g, models[(plant, seu)], kb, events)

summary = pd.DataFrame([dict(plant=k[0], seu=k[1], status=v["status"], verdict=v["verdict"], pattern=v["pat"]["type"],
                             last3_dev_pct=round(v["last3"], 2), onset=fmt_m(v["onset"]), spikes=[fmt_m(s) for s in v["spike_months"]],
                             activity_months=len(v["act_months"])) for k, v in seu_eval.items()])
summary

# %% [markdown]
# ## 7. Plant roll-up and Pareto: which SEUs drive each plant's energy and excess
# * **Share of plant energy** and cumulative share (Pareto) = which SEUs are significant (cl. 6.3).
# * **Excess** = last-12-month positive net deviation. **Share of plant excess** = which SEU is responsible for the loss.
# * **Contribution (pts)** = SEU deviation ÷ plant expected energy, i.e. how many percentage points of plant EnPI this SEU adds.

# %%
plant_frames, plant_info = {}, {}
for plant, g in enpi.groupby("plant", sort=False):
    pf = g.groupby("period").agg(actual_f=("actual_f", "sum"), expected_gj=("expected_gj", "sum"), deviation_gj=("deviation_gj", "sum"),
                                 production_ton=("production_ton", "first"), vol_gj=("vol_gj", "sum"), wx_gj=("wx_gj", "sum"),
                                 eff_gj=("eff_gj", "sum"), change_gj=("change_gj", "sum"), cost_idr=("cost_idr", "sum"),
                                 co2_t=("co2_t", "sum"), n_prod=("production_ton", "nunique"),
                                 imputed=("imputed", "sum"), estimated=("data_quality", lambda s: (s == "estimated").sum())).reset_index()
    assert (pf["n_prod"] == 1).all(), f"{plant}: production_ton differs between SEUs in the same month (plant production must be one value)"
    pf["deviation_pct"] = pf["deviation_gj"] / pf["expected_gj"] * 100
    pf["sec"] = pf["actual_f"] / pf["production_ton"]
    pf["cusum_gj"] = pd.Series(np.where(pf["period"] > BASELINE_END, pf["deviation_gj"], 0.0)).cumsum()
    bb = pf[(pf["period"] >= BASELINE_START) & (pf["period"] <= BASELINE_END)]
    plant_info[plant] = dict(plant_name=g["plant_name"].iloc[0], base_sec=bb["actual_f"].sum() / bb["production_ton"].sum())
    plant_frames[plant] = pf


def window_agg(frame, months):
    s = frame[frame["period"].isin(months)]
    a, e, p = s["actual_f"].sum(), s["expected_gj"].sum(), s["production_ton"].sum()
    return dict(actual_gj=a, expected_gj=e, deviation_gj=a - e, deviation_pct=(a - e) / e * 100, production_ton=p, sec_gj_per_ton=a / p,
                volume_gj=s["vol_gj"].sum(), weather_gj=s["wx_gj"].sum(), efficiency_gj=s["eff_gj"].sum(),
                change_vs_baseline_gj=s["change_gj"].sum(), cost_impact_idr=s["cost_idr"].sum(), co2_impact_t=s["co2_t"].sum())


pareto_rows = []
for plant, g in enpi.groupby("plant", sort=False):
    w = g[g["period"].isin(months_w12)]
    t = w.groupby("seu").agg(energy=("actual_f", "sum"), expected=("expected_gj", "sum"), dev=("deviation_gj", "sum")).reset_index()
    t["share_pct"] = t["energy"] / t["energy"].sum() * 100
    t = t.sort_values("energy", ascending=False).reset_index(drop=True)
    t["cum_share_pct"] = t["share_pct"].cumsum()
    t["significant"] = (t["cum_share_pct"] - t["share_pct"]) < CONFIG["pareto_cutoff"] * 100
    t["excess_gj"] = t["dev"].clip(lower=0)
    t["share_of_excess_pct"] = t["excess_gj"] / t["excess_gj"].sum() * 100 if t["excess_gj"].sum() > 0 else 0.0
    t["contribution_pts"] = t["dev"] / t["expected"].sum() * 100
    t.insert(0, "plant", plant)
    pareto_rows.append(t)
pareto = pd.concat(pareto_rows, ignore_index=True)
pareto["status"] = [seu_eval[(r.plant, r.seu)]["status"] for r in pareto.itertuples()]
pareto.round(2)

# %% [markdown]
# ## 8. Diagnosis, corrective actions and future improvements
# For each SEU the knowledge base supplies **likely causes (hypotheses), what to verify first, and corrective actions** for the detected pattern, and **improvement ideas** triggered by the numbers:
# * `high_baseload`: a large share of energy does not scale with production (opportunity at low load)
# * `weather_sensitive`: temperature is a significant driver
# * `bdp_gap`: best-demonstrated performance beats typical performance by more than noise (stretch target)
# * `always`: monitoring/metering practices
#
# These are **hypotheses to verify on site**, never conclusions. Where an events-log entry overlaps the anomaly, it is shown as the *first* explanation to check.

# %%
def kb_for(seu_type):
    return kb["types"].get(seu_type) or kb["generic"]


def fnum(x, d=1):
    return f"{x:,.{d}f}"


def build_seu(plant, seu):
    g = enpi[(enpi["plant"] == plant) & (enpi["seu"] == seu)].sort_values("period")
    m, ev = models[(plant, seu)], seu_eval[(plant, seu)]
    pat, wdf, band = ev["pat"], ev["wdf"], CONFIG["band_pct"]
    meta = g.iloc[0]
    windows = {"report_month": agg(g, months_m1), "last_3m": agg(g, months_w3), "last_12m": agg(g, months_w12)}
    w12 = windows["last_12m"]
    # savings
    last3_dev = g[g["period"].isin(months_w3)]["deviation_gj"].mean()
    ann_gj = max(last3_dev, 0) * 12 if ev["status"] in ("watch", "high", "critical") else 0.0   # noise inside the band is not "excess"
    carrier = meta["carrier"]
    ann_cost, ann_co2 = ann_gj * TARIFF_IDR_PER_GJ.get(carrier, 0), ann_gj * EMISSION_T_PER_GJ.get(carrier, 0)
    # best-demonstrated-performance (stretch) beyond recovering to the model
    gg = g[~g["imputed"] & (g["data_quality"] != "estimated")]
    roll = gg["deviation_pct"].rolling(3).mean().dropna()
    noise = 2 * m["sigma_pct"] / math.sqrt(3)
    stretch_pct = max(-float(roll.quantile(0.10)) - noise, 0.0) if len(roll) >= 12 else 0.0
    exp12 = w12["expected_gj"]
    stretch_gj = stretch_pct / 100 * exp12
    # base load / weather sizing from the model
    pm = m["means"]
    prod_part = m["coefs"].get("production_ton", 0.0) * pm.get("production_ton", 0.0)
    base_share = max(0.0, 1 - prod_part / m["y_ref"])            # share of energy NOT proportional to production
    base_gj_year = base_share * m["y_ref"] * 12
    wx_per_degc = m["coefs"].get("ambient_temp_c", 0.0) * 12     # GJ/year per +1 degC

    # ---- the "why" text ----
    typ = pat["type"]
    dev12 = w12["deviation_pct"]
    if typ == "drift":
        pat_txt = f"Gradual drift of about {pat['slope_pct_per_month']:+.2f} %/month over the last {len(wdf)} months (now {ev['last3']:+.1f}% vs expected)."
        tent = " Pattern shape is tentative (a step change cannot be fully ruled out)." if pat["confidence"] == "tentative" else ""
    elif typ == "step":
        pat_txt = f"Step change of {pat['magnitude_pct']:+.1f} percentage points from {fmt_m(ev['onset'])}, stable since."
        tent = " Pattern shape is tentative (a gradual drift cannot be fully ruled out)." if pat["confidence"] == "tentative" else ""
    elif typ == "spike":
        pat_txt = f"One-off spike of {pat['magnitude_pct']:+.1f}% in {', '.join(fmt_m(s) for s in ev['spike_months'])}" + (" (current month)." if pat["spike_current"] else "; back to normal since.")
    elif typ == "persistent_offset":
        pat_txt = f"Steady offset of {pat['magnitude_pct']:+.1f}% vs expected throughout the window (inside the ±{band:.0f}% band, but it accumulates in the CUSUM)."
    elif typ == "persistent_high":
        pat_txt = f"Persistently high: {pat['magnitude_pct']:+.1f}% vs expected throughout the window."
    elif typ in ("persistent_low", "improving_trend"):
        pat_txt = f"Persistently below expected ({ev['last3']:+.1f}% over the last 3 months)."
        if ev["change_month"] is not None:
            pat_txt += f" Largest shift around {fmt_m(ev['change_month'])}."
    else:
        pat_txt = f"Within the ±{band:.0f}% band (last 3 months {ev['last3']:+.1f}%)."
    if typ in ("drift", "step"):
        pat_txt += tent
    if ev["spike_months"] and typ not in ("spike",):
        pat_txt += f" Also an isolated spike in {', '.join(fmt_m(s) for s in ev['spike_months'])}."
    dec = windows["last_12m"]
    dec_txt = (f"Last 12 months vs 12 average baseline months: {fnum(dec['change_vs_baseline_gj'], 0)} GJ change = "
               f"production {fnum(dec['volume_gj'], 0)} + weather {fnum(dec['weather_gj'], 0)} + efficiency {fnum(dec['efficiency_gj'], 0)} GJ.")
    masked = -(dec["volume_gj"] + dec["weather_gj"])
    if dec["efficiency_gj"] > 0 and masked >= 0.5 * dec["efficiency_gj"] and ev["status"] in ("critical", "high", "watch"):
        dec_txt += f" Lower production/weather load hid about {fnum(masked, 0)} GJ, so total energy alone would understate the efficiency loss."
    ev_txt = ("Overlapping event(s) to check first: " + "; ".join(f"{e['event_type']} ({e['start'][:7]}..{e['end'][:7]}): {e['description']}" for e in ev["near_events"])) if ev["near_events"] else None
    act_txt = (f"SEC was ≥{band:.0f}% above the baseline in {len(ev['act_months'])} low-production month(s) ({', '.join(fmt_m(x) for x in ev['act_months'])}) while total energy still followed the model: "
               "lower production spread fixed energy over fewer tons, not an efficiency loss.") if len(ev["act_months"]) >= 2 else None
    name = meta["seu_name"]
    if ev["verdict"] == "performance_loss":
        headline = f"{name}: {ev['last3']:+.1f}% above expected (last 3 months), about {fnum(ann_gj, 0)} GJ/year at the current run-rate."
    elif ev["verdict"] == "early_warning":
        proj = f", projected to cross the ±{band:.0f}% band in ~{ev['projected']:.0f} months" if ev["projected"] else ""
        headline = f"{name}: still inside the band ({ev['last3']:+.1f}%) but worsening{proj}."
    elif ev["verdict"] == "improvement":
        headline = f"{name}: {ev['last3']:+.1f}% below expected: a saving to confirm and lock in."
    elif ev["verdict"] == "activity_driven":
        headline = f"{name}: normal performance; SEC rose only because production was low."
    elif ev["verdict"] == "resolved_spike":
        headline = f"{name}: normal now; one-off spike earlier in the window."
    else:
        headline = f"{name}: within the ±{band:.0f}% band."

    # ---- diagnosis, actions from the knowledge base ----
    t = kb_for(meta["seu_type"])
    key = {"drift": "drift", "step": "step", "spike": "spike", "persistent_high": "step"}.get(typ)
    sec_kb = t.get(key) or kb["generic"].get(key) or kb["generic"]["drift"]
    diag = dict(label="Hypotheses to verify on site (not conclusions)", likely_causes=[], verify_first=[], note=None)
    actions = dict(priority="none", items=[], target=None)
    if ev["verdict"] in ("performance_loss", "early_warning"):
        diag["likely_causes"] = list(sec_kb["likely_causes"])
        diag["verify_first"] = list(sec_kb["verify"])
        actions["items"] = list(sec_kb["corrective"])
        if ev["near_events"]:
            diag["likely_causes"].insert(0, "Event in the log overlapping the onset (check first): " + "; ".join(e["description"] for e in ev["near_events"]))
        if ev["status"] == "critical" or (ev["status"] == "high" and typ in ("step", "spike")):
            actions["priority"] = "immediate"
        elif ev["status"] == "high":
            actions["priority"] = "short_term"
        else:
            actions["priority"] = "monitor"
        actions["target"] = f"Return deviation to within ±{band:.0f}% of expected; recoverable ≈ {fnum(ann_gj, 0)} GJ/year."
    elif ev["verdict"] == "improvement":
        diag["note"] = kb["verdict_notes"]["improvement"]
        diag["verify_first"] = ["Confirm the cause (equipment change, practice change, or meter/data change)", "Check that the metering and data source are unchanged"]
        if ev["near_events"]:
            diag["verify_first"].insert(0, "Logged event overlapping the change (probable cause, confirm): " + "; ".join(e["description"] for e in ev["near_events"]))
        actions["items"] = ["Document what changed and the measured saving", "Standardize the new practice (procedure/setpoints)", "Consider re-baselining only through the controlled procedure"]
        actions["priority"] = "planned"
    elif ev["verdict"] == "activity_driven":
        diag["note"] = kb["verdict_notes"]["activity_driven"]
        actions["items"] = ["No equipment corrective action needed", "Review operating strategy at low throughput (see future improvements)"]
    elif ev["verdict"] == "resolved_spike":
        diag["note"] = ("One-off event explained by a logged event: " + "; ".join(e["description"] for e in ev["near_events"])) if ev["near_events"] else "One-off event; back within band. Add the cause to the events log."
        diag["likely_causes"] = list(t.get("spike", kb["generic"]["spike"])["likely_causes"])
        actions["items"] = list(t.get("spike", kb["generic"]["spike"])["corrective"])
    else:
        diag["note"] = kb["verdict_notes"]["normal"]

    # ---- future improvements ----
    imps = []
    ti = t.get("improvements", kb["generic"]["improvements"])
    if base_share >= CONFIG["baseload_share_trigger"]:
        for s in ti.get("high_baseload", []):
            imps.append(dict(trigger="high_baseload", title=s, potential_gj_per_year=None,
                             basis=f"{base_share * 100:.0f}% of this SEU's energy (≈{fnum(base_gj_year, 0)} GJ/year) does not scale with production; size the saving by audit measurement."))
    if "ambient_temp_c" in m["coefs"]:
        for s in ti.get("weather_sensitive", []):
            imps.append(dict(trigger="weather_sensitive", title=s, potential_gj_per_year=None,
                             basis=f"Each +1 °C ambient adds about {fnum(wx_per_degc, 0)} GJ/year (p={m['p_values']['ambient_temp_c']:.3f})."))
    if stretch_pct > 0:
        for s in ti.get("bdp_gap", []):
            imps.append(dict(trigger="bdp_gap", title=s, potential_gj_per_year=round(stretch_gj, 1),
                             basis=f"Best 10% of months ran ≈{stretch_pct:.1f}% below the model beyond noise: stretch target ≈ {fnum(stretch_gj, 0)} GJ/year."))
    if m["quality"] == "review":
        imps.append(dict(trigger="model_quality", title="Review this SEU's baseline model (R² / CV(RMSE) below criteria): add a relevant variable or split the model by product/grade.", potential_gj_per_year=None,
                         basis=f"R²={m['r2']:.2f}, CV(RMSE)={m['cv_rmse_pct']:.1f}%."))
    for s in ti.get("always", []):
        imps.append(dict(trigger="always", title=s, potential_gj_per_year=None, basis="Good practice for continual improvement (ISO 50001 cl. 10.2)."))

    series = [dict(period=fmt_m(r.period), actual_gj=round(r.actual_f, 1), expected_gj=round(r.expected_gj, 1), deviation_pct=round(r.deviation_pct, 2),
                   cusum_gj=round(r.cusum_gj, 1), sec_gj_per_ton=round(r.sec, 4), production_ton=round(r.production_ton, 1),
                   data_quality="imputed" if r.imputed else r.data_quality, in_baseline=bool(r.period <= BASELINE_END),
                   outside_baseline_range=bool(r.outside_range))
              for r in g.itertuples()]
    return dict(
        seu=seu, seu_name=name, seu_type=meta["seu_type"], carrier=carrier,
        status=ev["status"], verdict=ev["verdict"],
        pattern=dict(type=typ, confidence=pat["confidence"], direction=pat["direction"],
                     since=fmt_m(ev["onset"]) if typ == "step" else None, likely_change_month=fmt_m(ev["change_month"]),
                     likely_change_pct=None if pat["change_pct"] is None else round(pat["change_pct"], 2), above_band_since=fmt_m(ev["run_start"]),
                     magnitude_pct=None if pat["magnitude_pct"] is None else round(pat["magnitude_pct"], 2),
                     slope_pct_per_month=None if pat["slope_pct_per_month"] is None else round(pat["slope_pct_per_month"], 3),
                     spike_months=[fmt_m(s) for s in ev["spike_months"]], projected_months_to_band=None if ev["projected"] is None else round(ev["projected"], 1)),
        model=dict(variables=m["variables"], intercept=round(m["intercept"], 2), coefs={k: round(v, 4) for k, v in m["coefs"].items()},
                   p_values={k: round(v, 4) for k, v in m["p_values"].items()}, r2=round(m["r2"], 3), cv_rmse_pct=round(m["cv_rmse_pct"], 2),
                   n_points=m["n_points"], quality=m["quality"], baseline_sec_gj_per_ton=round(ev["base_sec"], 4),
                   base_load_share_pct=round(base_share * 100, 1), base_load_gj_per_year=round(base_gj_year, 1),
                   weather_gj_per_year_per_degC=round(wx_per_degc, 1),
                   baseline_ranges={k: [round(x, 1) for x in v] for k, v in m["ranges"].items()},
                   months_outside_range_12m=int(wdf["outside_range"].sum())),
        windows=windows,
        why=dict(headline=headline, pattern_text=pat_txt, decomposition_text=dec_txt, event_text=ev_txt, activity_text=act_txt),
        diagnosis=diag, corrective_actions=actions,
        improvements=imps,
        savings=dict(annualized_excess_gj=round(ann_gj, 1), annualized_excess_cost_idr=round(ann_cost), annualized_excess_co2_t=round(ann_co2, 1),
                     achieved_saving_gj_12m=round(max(-w12["deviation_gj"], 0), 1) if ev["verdict"] == "improvement" else 0.0,
                     stretch_pct=round(stretch_pct, 2), stretch_gj_per_year=round(stretch_gj, 1)),
        events=ev["events"], series=series)


seu_json = {(p, s): build_seu(p, s) for (p, s) in seu_eval}
print(f"built {len(seu_json)} SEU records")
pd.DataFrame([dict(plant=k[0], seu=k[1], status=v["status"], verdict=v["verdict"], priority=v["corrective_actions"]["priority"],
                   annual_excess_GJ=v["savings"]["annualized_excess_gj"], base_load_pct=v["model"]["base_load_share_pct"],
                   n_improvements=len(v["improvements"])) for k, v in seu_json.items()])

# %% [markdown]
# ## 9. Assemble the dashboard JSON
# One file, `output/dashboard_data.json`, holds everything the dashboard needs (KPIs, trends, Pareto, per-SEU diagnosis, actions, improvements, data quality, method notes).
# The dashboard only **displays and sorts** these numbers; it never recomputes them.

# %%
def clean(o):
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (np.floating, float)):
        return None if (math.isnan(o) or math.isinf(o)) else round(float(o), 4)
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, pd.Timestamp):
        return fmt_m(o)
    return o


def kpi_block(frame, months, base_sec):
    k = window_agg(frame, months)
    k["baseline_sec_gj_per_ton"] = base_sec
    k["sec_vs_baseline_pct"] = (k["sec_gj_per_ton"] / base_sec - 1) * 100
    return k


plants_out = []
for plant, pf in plant_frames.items():
    info = plant_info[plant]
    kp = {"report_month": kpi_block(pf, months_m1, info["base_sec"]), "last_3m": kpi_block(pf, months_w3, info["base_sec"]),
          "last_12m": kpi_block(pf, months_w12, info["base_sec"])}
    par = pareto[pareto["plant"] == plant]
    seus = [seu_json[(plant, s)] for s in par["seu"]]                       # ordered by energy (Pareto order)
    pareto_out = [dict(seu=r.seu, seu_name=seu_json[(plant, r.seu)]["seu_name"], energy_gj_12m=r.energy, share_pct=r.share_pct, cum_share_pct=r.cum_share_pct,
                       significant=bool(r.significant), deviation_gj_12m=r.dev, excess_gj_12m=r.excess_gj, share_of_excess_pct=r.share_of_excess_pct,
                       contribution_to_plant_dev_pts=r.contribution_pts, status=r.status) for r in par.itertuples()]
    # plant-level activity-driven months (SEC high but total energy on model)
    wf = pf[pf["period"].isin(months_w12)]
    bp = pf[(pf["period"] >= BASELINE_START) & (pf["period"] <= BASELINE_END)]["production_ton"].mean()
    act = wf[(wf["production_ton"] <= CONFIG["low_production_frac"] * bp) & ((wf["sec"] / info["base_sec"] - 1) * 100 >= CONFIG["band_pct"]) & (wf["deviation_pct"].abs() < CONFIG["band_pct"])]["period"].tolist()
    act_note = (f"Plant production was low and SEC was ≥{CONFIG['band_pct']:.0f}% above baseline in {', '.join(fmt_m(a) for a in act)} but total energy followed the model: "
                "a production/load effect, not an efficiency loss.") if len(act) >= 2 else None
    top = sorted(seus, key=lambda s: -s["savings"]["annualized_excess_cost_idr"])
    lead = [s for s in top if s["savings"]["annualized_excess_gj"] > 0 and s["status"] in ("critical", "high", "watch")][:3]
    k12 = kp["last_12m"]
    summ = (f"{info['plant_name']} used {fnum(k12['actual_gj'], 0)} GJ in the last 12 months, {k12['deviation_pct']:+.1f}% vs the baseline model "
            f"({fnum(k12['deviation_gj'], 0)} GJ). ")
    if lead:
        summ += "Main contributors to excess: " + "; ".join(f"{s['seu_name']} ({s['why']['pattern_text'].rstrip('.')})" for s in lead) + "."
    else:
        summ += "No SEU is currently above the alarm band."
    plants_out.append(dict(
        plant=plant, plant_name=info["plant_name"], summary=summ, activity_note=act_note, kpis=kp, pareto=pareto_out, seus=seus,
        trend=[dict(period=fmt_m(r.period), actual_gj=r.actual_f, expected_gj=r.expected_gj, deviation_pct=r.deviation_pct, cusum_gj=r.cusum_gj,
                    production_ton=r.production_ton, sec_gj_per_ton=r.sec, in_baseline=bool(r.period <= BASELINE_END)) for r in pf.itertuples()],
        n_seu_critical_high=int(sum(s["status"] in ("critical", "high") for s in seus)),
        n_seu_watch=int(sum(s["status"] == "watch" for s in seus)),
        annualized_excess_cost_idr=sum(s["savings"]["annualized_excess_cost_idr"] for s in seus)))

plants_out.sort(key=lambda p: -p["annualized_excess_cost_idr"])
all_seus = [(p["plant"], p["plant_name"], s) for p in plants_out for s in p["seus"]]
top_seus = sorted(all_seus, key=lambda x: -x[2]["savings"]["annualized_excess_cost_idr"])[:10]
tot = {k: sum(p["kpis"]["last_12m"][k] for p in plants_out) for k in ("actual_gj", "expected_gj", "deviation_gj", "cost_impact_idr", "co2_impact_t")}
tot["deviation_pct"] = tot["deviation_gj"] / tot["expected_gj"] * 100
company = dict(
    totals_last_12m=tot, plant_ranking=[p["plant"] for p in plants_out],
    top_seus=[dict(plant=pid, plant_name=pn, seu=s["seu"], seu_name=s["seu_name"], status=s["status"], pattern=s["pattern"]["type"],
                   annualized_excess_gj=s["savings"]["annualized_excess_gj"], annualized_excess_cost_idr=s["savings"]["annualized_excess_cost_idr"],
                   annualized_excess_co2_t=s["savings"]["annualized_excess_co2_t"], priority=s["corrective_actions"]["priority"]) for pid, pn, s in top_seus if s["savings"]["annualized_excess_gj"] > 0],
    summary=(f"Across {len(plants_out)} plants the last 12 months were {tot['deviation_pct']:+.1f}% vs baseline ({fnum(tot['deviation_gj'], 0)} GJ). "
             f"{sum(p['n_seu_critical_high'] for p in plants_out)} SEU(s) are above the alarm band and {sum(p['n_seu_watch'] for p in plants_out)} on watch."))

data_quality = [dict(plant=r.plant, seu=r.seu, scope=r.period, issue=r.issue, months=r.months, detail=r.detail) for r in dq.itertuples()] if len(dq) else []
for pid, _, s in all_seus:
    if s["model"]["months_outside_range_12m"] >= 2:
        data_quality.append(dict(plant=pid, seu=s["seu"], scope="operating range", issue="outside_baseline_range", months=s["model"]["months_outside_range_12m"],
                                 detail="Production/temperature was outside the range the baseline was fitted on; deviation is less reliable in those months (ISO 50006: baseline should cover the operating range)."))
    if s["model"]["quality"] == "review":
        data_quality.append(dict(plant=pid, seu=s["seu"], scope="baseline model", issue="model_review", months=None,
                                 detail=f"R²={s['model']['r2']}, CV(RMSE)={s['model']['cv_rmse_pct']}% outside criteria"))

method = dict(
    iso_mapping={"6.3 Energy review": "SEU ranking (Pareto) and significance flag",
                 "6.4 EnPIs": "Expected vs actual energy, deviation %, SEC (GJ/ton)",
                 "6.5 Energy baseline": "Regression EnB per SEU on the baseline period, with R², CV(RMSE), p-values",
                 "6.6 Planning for energy data collection": "Data-quality log (missing/estimated months, model review flags)",
                 "9.1.1 Monitoring and measurement": "Monthly deviation, CUSUM, alarm band",
                 "10.2 Continual improvement": "Corrective actions, future improvements, stretch targets",
                 "ISO 50002 (energy audits)": "'Verify first' checks per hypothesis are the audit measurements to perform on site"},
    definitions=dict(
        expected_gj="Energy predicted by the EnB model at the actual production and ambient temperature.",
        deviation="Actual minus expected. Positive = worse than the baseline predicts.",
        cusum_gj="Cumulative sum of monthly deviation since the baseline ended. A rising line means a persistent loss.",
        decomposition="Change vs an average baseline month = volume effect + weather effect + efficiency effect (exact). Only the efficiency effect is a performance change.",
        status="critical: last-3-month mean deviation >= 2 x band; high: >= band; watch: worsening drift/step still inside the band; improved: <= -band; normal otherwise.",
        annualized_excess="Mean of the last 3 months' positive deviation x 12, valued at the configured tariff (PLACEHOLDER rates).",
        stretch="Further saving below the model, beyond noise, shown by the best 10% of months (best demonstrated performance)."),
    limitations=["Hypotheses and actions come from a generic knowledge base and must be verified on site.",
                 "Tariffs and emission factors are placeholders unless replaced in the notebook CONFIG.",
                 "Models are statistical; re-baselining after real changes follows the controlled procedure, not this tool.",
                 "A deviation outside the band shows that something changed vs the baseline model, not by itself what changed."])

dashboard = clean(dict(
    schema_version="1.0",
    meta=dict(generated_at=datetime.now().strftime("%Y-%m-%d %H:%M"), report_month=fmt_m(REPORT_MONTH), window_months=W,
              baseline=dict(start=fmt_m(BASELINE_START), end=fmt_m(BASELINE_END)), band_pct=CONFIG["band_pct"],
              unit_energy="GJ", currency="IDR", data_is_synthetic=CONFIG["data_is_synthetic"],
              tariff_idr_per_gj=TARIFF_IDR_PER_GJ, emission_t_per_gj=EMISSION_T_PER_GJ,
              tariff_note="PLACEHOLDER rates: replace in the notebook CONFIG before using cost or CO2 figures."),
    company=company, plants=plants_out, data_quality=data_quality, method=method))

(OUT / "dashboard_data.json").write_text(json.dumps(dashboard, indent=1, ensure_ascii=False))
size_kb = (OUT / "dashboard_data.json").stat().st_size / 1024
print(f"wrote output/dashboard_data.json ({size_kb:,.0f} KB): {len(plants_out)} plants, {len(all_seus)} SEUs")
print("\n" + company["summary"])
for p in plants_out:
    print("-", p["summary"])

# %% [markdown]
# ## 10. Self-check against the planted stories (demo data only)
# The synthetic data contains known problems (`data/demo_answer_key.json`). This table checks that the notebook finds them:
# spikes are detected, drifts are raised as watch/high, steps are localized to the right month, a production turndown is recognized as *not* a performance loss, and a model drops a production term where none exists.
# With real data, set `answer_key_file=None`; instead sanity-check one month by hand against your existing Excel EnPI.

# %%
ak_path = DATA / CONFIG["answer_key_file"] if CONFIG["answer_key_file"] else None
if ak_path and ak_path.exists():
    key = json.loads(ak_path.read_text())["stories"]
    rows = []
    by = {(p["plant"], s["seu"]): s for p in plants_out for s in p["seus"]}
    pby = {p["plant"]: p for p in plants_out}
    for st in key:
        plant, seu, kind = st["plant"], st["seu"], st["story"]
        s = by.get((plant, seu))
        if kind == "spike":
            ok = s["pattern"]["type"] == "spike"
            detail = f"detected {s['pattern']['type']} in {s['pattern']['spike_months']}, status {s['status']} (resolved spike)"
        elif kind == "drift":
            # the planted drift must be raised (watch/high) as a worsening trend
            ok = s["status"] in ("watch", "high", "critical") and s["pattern"]["type"] in ("drift", "persistent_offset", "step")
            detail = f"pattern {s['pattern']['type']} ({s['pattern']['confidence']}), status {s['status']}, last-3m {s['windows']['last_3m']['deviation_pct']:+.1f}%"
        elif kind == "step":
            planted = pd.Timestamp(st["start_or_month"][:7] + "-01")
            lcm = pd.Timestamp(s["pattern"]["likely_change_month"] + "-01") if s["pattern"]["likely_change_month"] else None
            located = lcm is not None and abs((lcm.year - planted.year) * 12 + lcm.month - planted.month) <= 1
            sign_ok = (s["verdict"] == "improvement") if st["magnitude"] < 0 else (s["status"] in ("watch", "high", "critical"))
            ok = located and sign_ok
            detail = (f"pattern {s['pattern']['type']} ({s['pattern']['confidence']}), change month {s['pattern']['likely_change_month']} "
                      f"(planted {st['start_or_month'][:7]}), status {s['status']}, verdict {s['verdict']}")
        elif kind == "production_turndown":
            ok = bool(pby[plant]["activity_note"])
            detail = "plant activity note present" if ok else "no activity note"
        elif kind == "high_base_load":
            ok = s["model"]["base_load_share_pct"] >= CONFIG["baseload_share_trigger"] * 100
            detail = f"base load {s['model']['base_load_share_pct']}%"
        elif kind == "no_production_driver":
            ok = "production_ton" not in s["model"]["variables"]
            detail = f"model variables: {s['model']['variables']}"
        else:
            continue
        rows.append(dict(plant=plant, seu=seu, planted=kind, result="PASS" if ok else "FAIL", detail=detail))
    chk = pd.DataFrame(rows)
    print(chk.to_string(index=False))
    print(f"\n{(chk['result'] == 'PASS').sum()}/{len(chk)} planted stories found")
else:
    print("No answer key configured (expected for real data).")

# %% [markdown]
# ## 11. Build the reference dashboard (single HTML file)
# `app/dashboard_template.html` is a dependency-free dashboard (plain HTML + JavaScript + SVG) that **only reads `dashboard_data.json`**; it never recalculates an EnPI.
# It answers the four questions: *which SEU drives each plant's energy, why is it high, what corrective action, what to improve next.*
# Open `output/dashboard.html` in any browser (works offline). The AI Studio prompt in `prompts/` asks Gemini to build the same thing, so you can compare or restyle it.

# %%
import subprocess
import sys

res = subprocess.run([sys.executable, str(ROOT / "scripts" / "build_dashboard.py")], capture_output=True, text=True)
print(res.stdout.strip() or res.stderr.strip())
assert res.returncode == 0, "dashboard build failed"

# %% [markdown]
# ## 12. Where an LLM fits (and where it does not)
# * **Not** in calculating EnPIs, baselines, deviations, savings: done above, reproducible and auditable.
# * **Yes** in the dashboard's optional *"Ask the data"* panel (Gemini inside the AI Studio app), which only answers from `dashboard_data.json` and cites SEU and period.
# * **Yes** in later work: turning your own audit reports and SOPs into richer knowledge-base entries (RAG), reviewed by an engineer before they are added to `knowledge_base.json`.
#
# **Next steps:** replace the demo files with your data (see `docs/DASHBOARD_GUIDE.md`), re-run, then rebuild or refresh the AI Studio app with the new `dashboard_data.json`.
