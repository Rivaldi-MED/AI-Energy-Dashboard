"""Generate a SYNTHETIC multi-plant monthly energy dataset for testing the dashboard notebook.

Nothing here is real plant data. Magnitudes are plausible but invented.
Each SEU gets a known "story" (drift, step, spike, high base load, ...) so you can check
that the notebook finds what we planted. The answer key is written to data/demo_answer_key.json.

Run:  python scripts/make_demo_data.py      (from the dashboard/ folder)
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

rng = np.random.default_rng(2026)
OUT = Path(__file__).resolve().parent.parent / "data"
OUT.mkdir(exist_ok=True)

N_MONTHS = 36                      # 2023-10 .. 2026-09
BASELINE_MONTHS = 24               # first 24 months = baseline (EnB) period
months = pd.date_range("2023-10-01", periods=N_MONTHS, freq="MS")

# --------------------------------------------------------------------------------------
# seu: (code, name, type, carrier, a, b, c, noise, story)
#   energy_gj = a + b*production_ton + c*ambient_temp_c   (then multiplicative noise + story)
#   story = None | ("drift", rate_per_month, start_idx) | ("step", frac, start_idx) | ("spike", frac, idx)
# --------------------------------------------------------------------------------------
PLANTS = {
    "PLANT_A": dict(name="Plant A - HDPE", prod_mean=8200, prod_sd=800, seus=[
        ("reactor_loop",  "Loop reactor circulation pumps", "pump",       "electricity", 9000, 0.55,   0, 0.015, None),
        ("recovery_comp", "Recovery / recycle compressor",  "compressor", "electricity", 6000, 0.35,  45, 0.015, ("drift", 0.005, 24)),
        ("extruder",      "Pelletizing extruder drive",     "extruder",   "electricity", 3500, 0.80,   0, 0.015, ("spike", 0.25, 30)),
        ("dryer_steam",   "Powder dryer / purge steam",     "steam_dryer","steam",       8000, 1.10,  60, 0.015, ("step", 0.08, 28)),
        ("cooling_water", "Cooling water pumps + fans",     "cooling",    "electricity", 2500, 0.12, 180, 0.020, None),
    ]),
    "PLANT_B": dict(name="Plant B - PP", prod_mean=6000, prod_sd=600, prod_dip=(27, 28, 29, 0.70), seus=[
        ("compressed_air", "Compressed air system",         "compressed_air","electricity", 7500, 0.25,   0, 0.012, None),
        ("boiler_fuel",    "Steam boiler fuel gas",         "boiler",     "fuel_gas",    12000, 2.00,  40, 0.012, ("drift", 0.0035, 24)),
        ("chiller",        "Chilled water plant",           "chiller",    "electricity", 2000, 0.10, 250, 0.020, None),
        ("process_pumps",  "Process pumps",                 "pump",       "electricity", 2500, 0.60,   0, 0.015, None),
    ]),
    "PLANT_C": dict(name="Plant C - Compounding", prod_mean=3500, prod_sd=350, seus=[
        ("extruder_lines", "Compounding extruder lines",    "extruder",   "electricity", 2000, 1.60,   0, 0.015, ("step", -0.06, 30)),
        ("cooling_water",  "Cooling water pumps + fans",    "cooling",    "electricity", 1200, 0.15,  90, 0.020, None),
        ("hvac_lighting",  "HVAC and lighting",             "hvac",       "electricity", 3000, 0.00, 140, 0.020, None),
        ("dryers_hot_air", "Hot-air dryers (gas fired)",    "process_heating","fuel_gas",  2000, 1.20,  30, 0.018, ("drift", 0.0045, 24)),
        ("air_compressors","Air compressors",               "compressed_air","electricity", 2200, 0.30,   0, 0.015, ("step", 0.04, 32)),
    ]),
}

MISSING = {("PLANT_B", "chiller"): [10, 11]}                     # meter outage
ESTIMATED = {("PLANT_A", "reactor_loop"): [15], ("PLANT_C", "hvac_lighting"): [30]}

# site ambient temperature (tropical: small seasonal swing)
temp = 28.2 + 1.4 * np.sin(2 * np.pi * (months.month - 4) / 12) + rng.normal(0, 0.35, N_MONTHS)

rows, register, key = [], [], []
for pid, p in PLANTS.items():
    prod = rng.normal(p["prod_mean"], p["prod_sd"], N_MONTHS)
    if "prod_dip" in p:
        *idx, f = p["prod_dip"]
        prod[list(idx)] *= f
    for (code, name, typ, carrier, a, b, c, noise, story) in p["seus"]:
        register.append(dict(plant=pid, plant_name=p["name"], seu=code, seu_name=name, seu_type=typ,
                             carrier=carrier, metering="sub-metered",
                             notes="synthetic demo data"))
        if story:
            key.append(dict(plant=pid, seu=code, story=story[0], magnitude=story[1], start_or_month_index=story[2],
                            start_or_month=str(months[story[2]].date())))
        for i, m in enumerate(months):
            e = (a + b * prod[i] + c * temp[i]) * (1 + rng.normal(0, noise))
            if story:
                kind, mag, at = story
                if kind == "drift" and i >= at:
                    e *= 1 + mag * (i - at + 1)
                elif kind == "step" and i >= at:
                    e *= 1 + mag
                elif kind == "spike" and i == at:
                    e *= 1 + mag
            q = "measured"
            if i in MISSING.get((pid, code), []):
                e, q = np.nan, "missing"
            elif i in ESTIMATED.get((pid, code), []):
                q = "estimated"
            rows.append(dict(period=m.date().isoformat(), plant=pid, seu=code, carrier=carrier,
                             energy_gj=None if np.isnan(e) else round(float(e), 1),
                             production_ton=round(float(prod[i]), 1), ambient_temp_c=round(float(temp[i]), 2),
                             data_quality=q))

key.append(dict(plant="PLANT_B", seu="(all)", story="production_turndown", magnitude=-0.30,
                start_or_month_index=27, start_or_month="2026-01-01..2026-03-01",
                note="SEC rises but energy tracks the model: NOT a performance problem"))
key.append(dict(plant="PLANT_B", seu="compressed_air", story="high_base_load", magnitude=None,
                start_or_month_index=None, start_or_month=None, note="intercept ~83% of energy at mean load"))
key.append(dict(plant="PLANT_C", seu="hvac_lighting", story="no_production_driver", magnitude=None,
                start_or_month_index=None, start_or_month=None, note="b=0 -> production should be dropped from model"))

pd.DataFrame(rows).to_csv(OUT / "energy_monthly_demo.csv", index=False)
pd.DataFrame(register).to_csv(OUT / "seu_register_demo.csv", index=False)
(OUT / "demo_answer_key.json").write_text(json.dumps(
    dict(note="Planted stories in the SYNTHETIC demo data. Baseline = first 24 months (2023-10..2025-09).",
         stories=key), indent=2))
print("rows:", len(rows), "| plants:", len(PLANTS), "| SEUs:", len(register))
