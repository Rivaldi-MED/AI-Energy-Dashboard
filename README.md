# ISO 50001 Energy Performance Dashboard (React SPA)

A modern, industrial-grade React dashboard for monitoring energy performance indicators (EnPI), baseline regressions, CUSUM deviations, and significant energy uses (SEUs) in petrochemical and manufacturing plants according to ISO 50001:2018 and ISO 50002.

## Key Capabilities

1. **Company Overview**:
   - Executive headline summary and 12-month company totals (Energy used, Deviation %, Avoidable cost IDR, CO₂ tonnes).
   - Q1: Plant ranking by avoidable excess cost.
   - Q2: Top priority SEUs across all operating facilities.
   - Status board mapping all SEUs worst-first with status badges (Critical, High, Watch, Improved, Normal).

2. **Plant Deep-Dive**:
   - Time window selector: Report Month, Last 3 Months, Last 12 Months.
   - Performance KPI cards with SEC vs baseline comparisons.
   - Side-by-side Pareto chart comparing Energy Share (%) vs Avoidable Excess Share (%).
   - Deviation breakdown bars identifying which equipment pushes energy above expectations.

3. **SEU Detail View (The "Why" Screen)**:
   - Root-cause decomposition: Volume effect + Weather effect + Efficiency effect = Net Change vs baseline.
   - Interactive monthly performance charts (Actual vs Expected line chart with shaded baseline area, ±band, event markers, CUSUM accumulation, and monthly deviation % chart).
   - Baseline EnPI model card (R², CV(RMSE), base-load share, baseline SEC, quality validation).
   - Engineering hypotheses and interactive audit verification checklist (preserved in browser).
   - Priority corrective actions, target, and annualized recoverable savings (GJ, Cost, CO₂).
   - Continual improvement opportunities (ISO 50001 cl. 10.2).

4. **Consolidated Action Register**:
   - Cross-plant table of all SEUs requiring action, sorted by urgency (Immediate → Short-term → Planned → Monitor).
   - Export CSV capability and clean print stylesheet.

5. **Methodology & Data Governance**:
   - Complete data quality telemetry log grouped by plant.
   - ISO 50001:2018 clause mappings and technical definitions.
   - Transparent limitations statement.

6. **Flexible Data Loading & AI Assistant**:
   - Auto-loads bundled `dashboard_data.json` with drag-and-drop file picker for monthly updates (schema 1.0 validation).
   - Optional Gemini AI Data Assistant ("Ask the data") behind a toggle for grounded ISO 50001 Q&A.

## Development & Build

```bash
npm install
npm run dev    # Starts full-stack dev server on http://0.0.0.0:3000
npm run build  # Builds Vite client
```
