# Guide: from your monthly energy data to an ISO 50001 dashboard

Audience: process / energy engineer who knows the plant and the standard, and is new to the Python + AI Studio side.

## 0. How the pieces fit

```
Excel / CSV (your monthly data)
        │
        ▼
Notebook  notebooks/energy_dashboard_analysis.ipynb      <- ALL numbers are computed here (deterministic, auditable)
        │  writes
        ▼
output/dashboard_data.json  ──►  Google AI Studio app (built from prompts/AI_STUDIO_PROMPT.md)   <- ONLY displays
        │
        └─►  output/dashboard.html  (offline reference dashboard, no AI needed)
```

Golden rule: the LLM never calculates an EnPI. It builds the screen and (optionally) answers questions from the JSON.
That is what lets you defend every number in an internal audit.

What the notebook does, mapped to the standard:

| Step in notebook | ISO 50001 / 50002 link | Output used by the dashboard |
|---|---|---|
| EnB per SEU (regression on production and/or ambient temperature) | cl. 6.5, ISO 50006 | `model` (R², CV(RMSE), p-values, base-load share) |
| Expected vs actual, deviation, SEC, CUSUM | cl. 6.4, 9.1.1 | `series`, `windows`, `trend` |
| Pareto of energy and excess per plant | cl. 6.3 | `pareto` ("which SEU drives the plant") |
| Split: volume + weather + efficiency | cl. 9.1.1 analysis | `why.decomposition_text`, `windows.*_gj` |
| Pattern: drift / step / spike / offset | cl. 9.1.1, 10.2 | `pattern` |
| Hypotheses, verify-first checks, corrective actions | ISO 50002 style evidence-before-conclusion | `diagnosis`, `corrective_actions` |
| Future improvements (base load, weather, best demonstrated month) | cl. 10.2 | `improvements`, `savings.stretch_*` |
| Missing / estimated / out-of-range months | cl. 6.6 | `data_quality`, `model.months_outside_range_12m` |

## 1. Set up your tools (once)

**Option A: VS Code (recommended to learn)**
1. Install Python 3.11+ and VS Code. In VS Code install the extensions **Python** and **Jupyter**.
2. Open the `dashboard/` folder (File → Open Folder).
3. Terminal → `python -m venv .venv`, activate it, then `pip install -r requirements.txt`.
4. Open `notebooks/energy_dashboard_analysis.ipynb`, choose the `.venv` kernel (top right), **Run All**.

**Option B: Docker (same result on any machine)**
```bash
docker compose up --build        # then open http://localhost:8888  (token printed in the log)
```
The Dockerfile in this folder was written but **not built or tested** by the author of this kit (no Docker daemon was available). If the build fails, use Option A and tell me the error.

**Option C: Google Colab**: upload the `dashboard/` folder to `/content`, set `ROOT = Path("/content")` in the first cell, Run all.

## 2. Run the demo first (10 minutes)
1. Run all cells. It takes about 5 seconds.
2. The last analysis cell prints a self-check table: **10/10 planted stories found**. The demo data has deliberately planted faults (drift, step, spike, a load-driven SEC rise, a high base load, a model with no production driver), so you can see the tool finds them.
3. Open `output/dashboard.html` in a browser. This is what "good" looks like.

## 3. Prepare YOUR data (what to give me, or fill in yourself)

Use the files in `data/templates/` (CSV, or the one workbook `energy_input_TEMPLATE.xlsx` with 3 sheets).

| # | What | Where it goes | Rules that matter |
|---|---|---|---|
| 1 | **SEU register**: plant, SEU code, name, type (pump, compressor, extruder, steam_dryer, cooling, compressed_air, boiler, chiller, hvac, process_heating), energy carrier, metering note | `seu_register` | The SEU **type** selects the hypotheses and actions from `knowledge_base.json`. Only include SEUs you have energy data for. |
| 2 | **Monthly energy per SEU** | `energy_monthly`: `period, plant, seu, carrier, energy_gj, production_ton, ambient_temp_c, data_quality` | One row per month x plant x SEU. Aim for **24 months** in the baseline; treat 12 as the practical minimum (the code only refuses a fit with fewer than 4 degrees of freedom, so it will not stop you from fitting a weak model, check R² and CV(RMSE)). Give `energy_gj`, or `energy_value` + `unit` (kWh, MWh, GJ, MJ, MMBtu, Gcal, t_steam). |
| 3 | **Production per plant per month** (same value on every SEU row of that plant) | `production_ton` | Use the number that actually drives the SEU (tonnes of resin, feed, or throughput). If an SEU has no production driver (HVAC, lighting) the notebook drops it by itself when the p-value is poor. |
| 4 | **Ambient temperature** (monthly mean; wet-bulb is better for cooling towers) | `ambient_temp_c` | Leave blank if you do not have it; the weather term is then skipped. |
| 5 | **Data quality flag**: `measured`, `estimated` or `missing` | `data_quality` | Never fill a gap silently. Missing months (blank energy) are left out of the baseline fit; in the monthly series they are shown as "imputed" (filled with the expected value so the CUSUM stays continuous), excluded from pattern detection, and listed in the data-quality log. |
| 6 | **Events log** (turnaround, grade trial, equipment change, meter outage, feed constraint) | `events` sheet | Optional but valuable: it lets the "why" text cite what actually happened. |
| 7 | **Baseline period**: start and end month, and the reason (for example "first 24 months after the 20XX revamp") | `CONFIG["baseline_start"]`, `["baseline_end"]` | The baseline should represent normal, stable operation. Changing it later is a controlled re-baselining event, not a tweak. |
| 8 | **Tariffs and emission factors** per carrier | `TARIFF_IDR_PER_GJ`, `EMISSION_T_PER_GJ` in the CONFIG cell | The shipped values are **placeholders**. Replace them or ignore the cost and CO2 numbers. |
| 9 | **Steam conversion** | `UNIT_TO_GJ["t_steam"]` | Placeholder 2.7 GJ/t. Use an enthalpy-based value for your header pressure and condensate return. |
| 10 | **Your own knowledge** (past audit findings, MOCs, recurring failure modes, HAZOP/maintenance history) | `data/knowledge_base.json` | Optional now, valuable later: it replaces generic hypotheses with plant-specific ones. |

**Confidentiality:** before sending anything to a cloud tool, set `anonymize=True` in CONFIG. Optionally set `scale_energy` and `scale_production` to a private factor. The notebook then keeps every percentage, status and pattern correct but renames plants to SITE_1, SITE_2 ... and hides absolute scale. **SEU codes and names are not masked**, so rename them in the SEU register too if they are sensitive. Get approval from your data owner / IT before using real production or energy data in any external tool, and do not enable the dashboard's "Ask the data" feature unless that approval covers it.

## 4. Run on your data and check it (do not skip)
1. In the CONFIG cell: set the three file names, baseline dates, `data_is_synthetic=False`, `answer_key_file=None`.
2. Run all. Fix any assertion message (they name the column or row that is wrong).
3. Check the model table first. For each SEU you want: `quality` good, R² at or above 0.75 (CONFIG `min_r2`), CV(RMSE) at or below 15 % (`cv_rmse_max_pct`), production coefficient positive and plausible. Poor model = do not trust that SEU's status.
4. **Reconcile one month by hand** against your existing Excel EnPI. Expected, actual and deviation must match.
5. Read `data_quality` and `months_outside_range_12m`: a deviation measured outside the baseline's operating range is an extrapolation, so treat it as weaker evidence.
6. Read the five SEU statuses for the biggest consumers and ask: does this match what operations already know? If not, look at the events log and metering first, before the equipment.

## 5. Build the dashboard in Google AI Studio
1. Run `python scripts/make_slim_sample.py` (already done for the demo): creates `output/dashboard_data_slim.json`, a small example with the same schema.
2. Open AI Studio → **Build** mode. Open `prompts/AI_STUDIO_PROMPT.md` and paste the text between the `=====` lines.
3. Get the files in. The AI Studio documentation I checked describes **Add files (+) → Import from GitHub** as the supported route. If your screen also lets you attach files directly (as you saw), attach: the slim JSON, the full JSON, the notebook and `dashboard.html`. Otherwise push this folder to a GitHub repo and import it.
4. Let it generate, then iterate in the chat. Useful follow-up prompts:
   - "Add a Pareto that shows energy share and excess share side by side for PLANT_B."
   - "On the SEU detail screen put the why-section above the monthly chart."
   - "Make the action register printable on one A4 page, landscape."
   - "Run the acceptance checklist from the original prompt and show me any item that fails."
5. Test with the **full** JSON. Then test with a deliberately broken file to see the error message.
6. Export to GitHub or ZIP. Note: AI Studio apps that call Gemini use a server-side API key, so if you download a ZIP you must set `GEMINI_API_KEY` yourself.

If the generated app misreads a field, point to the field name in the schema in the prompt and ask it to fix that one binding. Do not accept an app that recomputes deviations itself.

## 6. Monthly routine (about 15 minutes)
1. Append last month's rows to `energy_monthly` (and events).
2. Run the notebook (leave `report_month=None` to use the latest month).
3. Open `output/dashboard.html` for a quick check, then drop `output/dashboard_data.json` into the AI Studio app.
4. Review `Action register`: new `immediate` or `short_term` items go to the energy review meeting; update the events log with what was found.
5. Commit to GitHub: `git add data output && git commit -m "Energy report 2026-10"`.

## 7. Extending it later
- Replace generic hypotheses with plant-specific ones in `knowledge_base.json` (by SEU type and pattern: drift, step, spike, persistent_high). Have an engineer review every entry.
- Add relevant variables (grade mix, operating hours, steam pressure) by extending `VARS` and the input columns, then re-check the model quality.
- Add SQL storage (see `../sql/` in the parent repo) when the data outgrows spreadsheets.
- ISO 50002 audit use: the `verify_first` list per SEU is the measurement and inspection plan; record results in the events log.

## 8. Limits to keep in mind
- Demo data is synthetic. Placeholders for tariffs, emission factors and steam conversion must be replaced.
- Hypotheses and actions come from a generic library and must be verified on site.
- A deviation says that something changed against the baseline, not what changed.
- Re-baselining after a real change follows your controlled procedure, not this tool.
