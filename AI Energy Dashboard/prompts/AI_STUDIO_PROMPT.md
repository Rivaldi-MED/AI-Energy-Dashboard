# AI Studio prompt: ISO 50001 energy performance dashboard

**How to use:** open Google AI Studio → Build mode → paste everything between the two `=====` lines
into the prompt box. Attach (or import from GitHub) these files first:

| File | Purpose |
|---|---|
| `output/dashboard_data_slim.json` | Schema + realistic example records (7 SEUs). Used to design the UI. |
| `output/dashboard_data.json` | The FULL data. The finished app loads this one. |
| `notebooks/energy_dashboard_analysis.ipynb` | Context only: shows where every number comes from. |
| `output/dashboard.html` | Optional reference of the content and layout that already works. Restyle it, do not copy it blindly. |

If your AI Studio build screen cannot attach files, put the whole `dashboard/` folder in a GitHub repo
and use **Add files (+) → Import from GitHub**, then paste the prompt. Rule of thumb: the app must
read its numbers from the JSON file and never from text typed into the prompt.

=====

## Role
You are a senior front-end engineer and an industrial energy-management specialist (ISO 50001
energy performance, ISO 50002 energy audits). Build a **monthly energy performance dashboard** for
plant engineers and managers of petrochemical / polymer plants.

## Purpose (what the dashboard must answer, in this order)
1. **Which SEU (significant energy use) is impacting each plant's energy the most?**
2. **Why is its energy high?** Separate load effects (production, weather) from real efficiency loss,
   and say whether the pattern is a drift, a step change, a spike or a persistent offset.
3. **What corrective action should be taken**, how urgent, and what is it worth (energy, cost, CO2)?
4. **What can be improved in future** (base load, weather sensitivity, best-demonstrated-performance gap)?

## Data contract (single source of truth)
Load `dashboard_data.json` (same schema as `dashboard_data_slim.json`, `schema_version` "1.0").
Try `fetch("/dashboard_data.json")` first; if that fails, show a **drag-and-drop / file-picker
area** so the user can load a new month's file with no code change. Validate that
`schema_version === "1.0"` and the keys `meta`, `company`, `plants`, `data_quality`, `method` exist;
otherwise show a clear, friendly error naming the missing key.

```
meta        { report_month, window_months, baseline{start,end}, band_pct, unit_energy ("GJ"), currency ("IDR"),
              data_is_synthetic, tariff_note, ... }
company     { totals_last_12m{actual_gj, expected_gj, deviation_gj, deviation_pct, cost_impact_idr, co2_impact_t},
              plant_ranking[], top_seus[{plant, plant_name, seu, seu_name, status, pattern,
                                         annualized_excess_gj, annualized_excess_cost_idr,
                                         annualized_excess_co2_t, priority}], summary }
plants[]    { plant, plant_name, summary, activity_note|null,
              kpis{report_month, last_3m, last_12m}   // each: actual_gj, expected_gj, deviation_gj, deviation_pct,
                                                      // production_ton, sec_gj_per_ton, volume_gj, weather_gj,
                                                      // efficiency_gj, change_vs_baseline_gj, cost_impact_idr,
                                                      // co2_impact_t, baseline_sec_gj_per_ton, sec_vs_baseline_pct
              pareto[{seu, seu_name, energy_gj_12m, share_pct, cum_share_pct, significant, excess_gj_12m,
                      share_of_excess_pct, contribution_to_plant_dev_pts, status}],
              trend[{period, actual_gj, expected_gj, deviation_pct, cusum_gj, production_ton, sec_gj_per_ton, in_baseline}],
              seus[{ seu, seu_name, seu_type, carrier,
                     status: critical|high|watch|improved|normal,
                     verdict: performance_loss|early_warning|activity_driven|improvement|resolved_spike|normal,
                     pattern{type: drift|step|spike|persistent_offset|improving_trend|within_band,
                             confidence: clear|tentative, since, likely_change_month, magnitude_pct,
                             slope_pct_per_month, spike_months[], projected_months_to_band},
                     model{variables[], intercept, coefs{}, p_values{}, r2, cv_rmse_pct, n_points,
                           quality, baseline_sec_gj_per_ton, base_load_share_pct, base_load_gj_per_year,
                           weather_gj_per_year_per_degC, baseline_ranges, months_outside_range_12m},
                     windows{report_month, last_3m, last_12m},   // same fields as plant kpis + n_months, n_imputed, n_estimated
                     why{headline, pattern_text, decomposition_text, event_text|null, activity_text|null},
                     diagnosis{label, likely_causes[], verify_first[], note|null},
                     corrective_actions{priority: immediate|short_term|planned|monitor|none, items[], target},
                     improvements[{trigger: always|high_baseload|weather_sensitive|bdp_gap, title,
                                   potential_gj_per_year|null, basis}],
                     savings{annualized_excess_gj, annualized_excess_cost_idr, annualized_excess_co2_t,
                             achieved_saving_gj_12m, stretch_pct, stretch_gj_per_year},
                     events[], series[{period, actual_gj, expected_gj, deviation_pct, cusum_gj, sec_gj_per_ton,
                                       production_ton, data_quality, in_baseline, outside_baseline_range}] }] }
data_quality[{plant, seu, scope, issue, months, detail}]
method      { iso_mapping{}, definitions{}, limitations[] }
```

## Non-negotiable rules
1. **Do not calculate energy-performance figures in the app.** No regression, baseline, expected value,
   deviation, EnPI, savings, cost or CO2 calculations. Display what the JSON provides. You may sort,
   filter, group, format numbers and pick which window (report month / last 3 months / last 12 months) to show.
2. **No invented numbers or text.** Every figure, cause, action and improvement must come from the JSON.
   If a field is null or missing, show "n/a", never a guess.
3. **Language of uncertainty.** `diagnosis` items are **hypotheses to verify on site**, not conclusions.
   Always show `diagnosis.label`. Show `pattern.confidence` ("tentative" gets a visible qualifier).
4. If `meta.data_is_synthetic` is true, show a persistent banner: "Synthetic demo data". Show
   `meta.tariff_note` next to every cost or CO2 figure (placeholder rates).
5. Use `meta.unit_energy` and `meta.currency` for units. Format IDR as millions/billions with a unit label.
6. Never rely on colour alone: status uses colour + icon + text label.
7. A rising SEC with `verdict = activity_driven` is **not** a fault: show it as a load effect with the
   `plants[].activity_note` or `why.activity_text`, and do not put it in the corrective-action list.

## Screens
**A. Company overview**: headline sentence (`company.summary`), 12-month KPI cards (actual vs expected,
deviation %, cost and CO2 impact), plant ranking, and a "Top SEUs to act on" list ordered by
`annualized_excess_cost_idr` with status, pattern and priority chips. Clicking a row opens the SEU detail.

**B. Plant view** (plant selector + window toggle: Report month / Last 3 months / Last 12 months):
- KPI row from `kpis[window]`: actual, expected, deviation %, SEC vs baseline SEC.
- **Which SEUs drive this plant**: a Pareto chart of `share_pct` (energy) next to `share_of_excess_pct`
  (excess), so the user sees that the biggest consumer is not always the biggest problem.
- Trend chart: `actual_gj` vs `expected_gj` per month, shaded baseline period, ±`meta.band_pct` band,
  and a second small chart for `cusum_gj`.
- Status board of all SEUs in the plant, worst first.

**C. SEU detail** (the "why" screen, most important):
1. Header: SEU name, status badge, verdict, pattern chip, priority chip.
2. **Why it is high**: show `why.headline`, `why.pattern_text`, and a **waterfall or stacked bar** of
   `volume_gj` + `weather_gj` + `efficiency_gj` = `change_vs_baseline_gj` for the chosen window
   (read `why.decomposition_text` as the caption). Show `why.event_text` and `why.activity_text` when present.
3. Monthly chart from `series`: actual vs expected, mark the change month (`pattern.likely_change_month`),
   spike months, months with `outside_baseline_range` (hollow marker), and `data_quality != measured`.
4. **Baseline model card**: variables, R², CV(RMSE), p-values, `n_points`, `quality`, base-load share,
   weather sensitivity. Add a small "model valid / review" indicator from `model.quality`.
5. **Diagnosis**: `likely_causes` (hypotheses) and `verify_first` as a checklist the user can tick
   (state kept in the browser only).
6. **Corrective actions**: `corrective_actions.items`, `priority`, `target`, and the savings card
   (`annualized_excess_gj`, cost, CO2). Include a "copy as action plan" button (plain text).
7. **Future improvements**: `improvements[]` as cards with a trigger chip (always / high base load /
   weather sensitive / best-demonstrated gap) and `potential_gj_per_year` when present.

**D. Action register**: one table across all plants and SEUs where `priority != "none"`, sorted
immediate → short_term → planned → monitor, columns: plant, SEU, status, pattern, priority, first
action, annualized excess (GJ, cost, CO2), target. Buttons: **Export CSV** and **Print**.

**E. Data quality & method**: `data_quality` log (grouped by plant), `method.iso_mapping` as a
clause table, `method.definitions`, and `method.limitations` (always visible, not hidden).

**F. (Optional, build it but keep it OFF behind a toggle) "Ask the data"**: a chat box that calls Gemini.
The system instruction must say: answer only from the JSON supplied, cite plant, SEU and period, say
"not in the data" when unsure, never compute new EnPIs. Send only the fields needed for the question
(plant/SEU summary objects), not the full 36-month series. Show a note that data leaves the browser
when this is enabled.

## Design and quality
- Look: calm, professional control-room style; light and dark theme following the system setting;
  a restrained palette (one accent, semantic colours reserved for status); readable at 1366x768 and on a phone.
- Typography: large clear numbers (tabular figures), small muted labels with units.
- Use a mainstream chart library already supported in this environment (for example Recharts).
  Charts need axis titles with units, tooltips with exact values, and an accessible text summary.
- Fast: render the status board first, lazy-render the SEU detail charts.
- Print stylesheet so Screen A, a plant view and the action register print cleanly to PDF.
- Keep all state in memory or `localStorage` with try/catch (it may be unavailable).
- No external tracking, no analytics, no remote fonts that block rendering.

## Acceptance checklist (verify before you finish, then list which items you checked)
- [ ] App renders from `dashboard_data.json` and from a file dropped in, with a clean error for a bad file.
- [ ] For every SEU I can answer in under 30 seconds: how much excess, since when, which pattern, which action.
- [ ] Pareto shows energy share AND excess share side by side.
- [ ] Waterfall/stacked bar values sum to `change_vs_baseline_gj`.
- [ ] Activity-driven SEUs are labelled as load effects and are not in the action register.
- [ ] No number on screen is computed by the app other than formatting, sorting and filtering.
- [ ] Synthetic banner and tariff note appear when required.
- [ ] Works in light and dark mode, and prints cleanly.

=====
