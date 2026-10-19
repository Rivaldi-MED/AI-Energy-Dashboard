import React, { useState } from 'react';
import { PlantItem, Meta, TimeWindow, SeuItem } from '../types';
import {
  formatEnergy,
  formatSignedEnergy,
  formatPercent,
  formatCurrencyIdr,
  formatNumber,
  formatMonthLabel,
  getStatusMeta,
  STATUS_MAP,
} from '../utils/formatters';
import { SeuDetail } from './SeuDetail';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import { Building2, AlertTriangle, ArrowRight, Table } from 'lucide-react';

interface PlantViewProps {
  plant: PlantItem;
  meta: Meta;
  selectedSeuId?: string;
  onSelectSeuId: (id: string) => void;
}

export const PlantView: React.FC<PlantViewProps> = ({
  plant,
  meta,
  selectedSeuId,
  onSelectSeuId,
}) => {
  const [windowType, setWindowType] = useState<TimeWindow>('last_12m');

  // Find currently active SEU (fallback to worst SEU if not chosen)
  const defaultSeu = [...plant.seus].sort((a, b) => {
    const rankDiff = (STATUS_MAP[b.status]?.rank ?? 0) - (STATUS_MAP[a.status]?.rank ?? 0);
    if (rankDiff !== 0) return rankDiff;
    return b.savings.annualized_excess_gj - a.savings.annualized_excess_gj;
  })[0];

  const activeSeu = plant.seus.find((s) => s.seu === selectedSeuId) || defaultSeu;
  const kpi = plant.kpis[windowType];

  // Window display names
  const windowNames: Record<TimeWindow, string> = {
    report_month: `Report Month (${formatMonthLabel(meta.report_month)})`,
    last_3m: 'Last 3 Months',
    last_12m: 'Last 12 Months',
  };

  // Pareto data: Energy share % vs Excess share %
  const paretoSorted = [...plant.pareto].sort((a, b) => b.energy_gj_12m - a.energy_gj_12m);
  const paretoChartData = paretoSorted.map((p) => ({
    name: p.seu_name,
    shortName: p.seu_name.length > 20 ? p.seu_name.slice(0, 18) + '...' : p.seu_name,
    seu: p.seu,
    energySharePct: p.share_pct,
    excessSharePct: p.share_of_excess_pct,
    significant: p.significant,
    energyGj: p.energy_gj_12m,
    excessGj: p.excess_gj_12m,
  }));

  // Deviation bars for the selected window
  const devSorted = [...plant.seus].sort(
    (a, b) => b.windows[windowType].deviation_gj - a.windows[windowType].deviation_gj
  );

  const maxDevAbs = Math.max(
    1,
    ...devSorted.map((s) => Math.abs(s.windows[windowType].deviation_gj))
  );

  return (
    <div className="space-y-6">
      {/* Plant Summary Callout */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-xs border-l-4 border-l-blue-600">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
                {plant.plant_name}
              </h2>
            </div>
            <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed font-medium">
              {plant.summary}
            </p>
            {plant.activity_note && (
              <p className="mt-2 text-xs text-blue-800 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 p-2.5 rounded-lg border border-blue-200 dark:border-blue-900">
                <strong>Activity Note:</strong> {plant.activity_note}
              </p>
            )}
          </div>

          {/* Time Window Selector */}
          <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg shrink-0 self-start no-print">
            {(['report_month', 'last_3m', 'last_12m'] as TimeWindow[]).map((w) => (
              <button
                key={w}
                onClick={() => setWindowType(w)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  windowType === w
                    ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 shadow-xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
                }`}
              >
                {w === 'report_month' ? `Month (${formatMonthLabel(meta.report_month)})` : w === 'last_3m' ? '3 Months' : '12 Months'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Tiles Row for chosen window */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Energy Used</div>
          <div className="text-xl font-bold font-mono text-neutral-900 dark:text-neutral-50 mt-1">
            {formatNumber(kpi.actual_gj)} <span className="text-xs font-normal text-neutral-500">{meta.unit_energy}</span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-0.5">
            exp: {formatNumber(kpi.expected_gj)} {meta.unit_energy}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Deviation vs Model</div>
          <div className={`text-xl font-bold font-mono mt-1 ${
            kpi.deviation_pct > meta.band_pct
              ? 'text-red-600 dark:text-red-400'
              : kpi.deviation_pct < -meta.band_pct
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-neutral-900 dark:text-neutral-50'
          }`}>
            {formatPercent(kpi.deviation_pct)}
          </div>
          <div className="text-[11px] text-neutral-500 mt-0.5">
            {formatSignedEnergy(kpi.deviation_gj, meta.unit_energy)}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Specific Energy (SEC)</div>
          <div className="text-xl font-bold font-mono text-neutral-900 dark:text-neutral-50 mt-1">
            {kpi.sec_gj_per_ton.toFixed(2)} <span className="text-xs font-normal text-neutral-500">GJ/t</span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-0.5">
            {kpi.baseline_sec_gj_per_ton ? `base: ${kpi.baseline_sec_gj_per_ton.toFixed(2)} (${formatPercent(kpi.sec_vs_baseline_pct)})` : `prod: ${formatNumber(kpi.production_ton)} t`}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Cost Impact</div>
          <div className="text-xl font-bold font-mono text-neutral-900 dark:text-neutral-50 mt-1">
            {formatCurrencyIdr(kpi.cost_impact_idr)}
          </div>
          <div className="text-[11px] text-neutral-500 mt-0.5">
            tariffs placeholder
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs col-span-2 sm:col-span-1">
          <div className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">CO₂ Impact</div>
          <div className="text-xl font-bold font-mono text-neutral-900 dark:text-neutral-50 mt-1">
            {formatNumber(kpi.co2_impact_t, 0)} <span className="text-xs font-normal text-neutral-500">t CO₂</span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-0.5">
            scope 1 & 2 placeholder
          </div>
        </div>
      </div>

      {/* Question 1: Pareto Chart (Energy Share vs Excess Share) */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-xs">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
            Q1
          </span>
          <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
            Which SEUs drive the plant's energy vs excess? (Pareto Analysis)
          </h3>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
          Compares overall energy consumption share (%) against avoidable excess share (%). The biggest energy consumer is often not the driver of efficiency loss.
        </p>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={paretoChartData}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
              <XAxis type="number" unit="%" domain={[0, 100]} tick={{ fontSize: 10 }} />
              <YAxis
                type="category"
                dataKey="shortName"
                width={160}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0].payload;
                  return (
                    <div className="bg-neutral-900 text-white p-3 rounded-lg text-xs shadow-lg space-y-1">
                      <div className="font-bold border-b border-neutral-700 pb-1">{item.name}</div>
                      <div>Energy Share: <strong>{item.energySharePct.toFixed(1)}%</strong> ({formatNumber(item.energyGj)} GJ)</div>
                      <div>Excess Share: <strong>{item.excessSharePct.toFixed(1)}%</strong> ({formatNumber(item.excessGj)} GJ)</div>
                      <div className="text-[11px] text-neutral-400">
                        {item.significant ? 'Inside significant energy use cutoff (ISO 50001)' : 'Below significant use cutoff'}
                      </div>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
              <Bar dataKey="energySharePct" name="Energy Share (% of Plant)" fill="#2563eb" radius={[0, 4, 4, 0]} />
              <Bar dataKey="excessSharePct" name="Excess Share (% of Plant Excess)" fill="#ea580c" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Question 2: Which SEUs push energy above expectation? */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-xs">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
            Q2
          </span>
          <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
            Which SEUs push energy above expectation? ({windowNames[windowType]})
          </h3>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
          Actual minus expected from each SEU's baseline model. Bars to the right use more energy than expected. Click any SEU to explain below.
        </p>

        <div className="space-y-2">
          {devSorted.map((s) => {
            const w = s.windows[windowType];
            const statusMeta = getStatusMeta(s.status);
            const isSelected = activeSeu.seu === s.seu;
            const devPctBar = Math.min(100, Math.max(3, (Math.abs(w.deviation_gj) / maxDevAbs) * 100));
            const isPos = w.deviation_gj >= 0;

            return (
              <div
                key={s.seu}
                onClick={() => onSelectSeuId(s.seu)}
                className={`p-3 rounded-lg border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 shadow-xs'
                    : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 bg-neutral-50/40 dark:bg-neutral-800/40'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-neutral-900 dark:text-neutral-100">
                      {s.seu_name}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusMeta.badgeClass}`}>
                      <span aria-hidden="true">{statusMeta.icon}</span>
                      {statusMeta.label}
                    </span>
                    <span className="text-[11px] text-neutral-500 capitalize">
                      {String(s.pattern.type).replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className={`font-mono text-xs font-bold ${
                      isPos ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {formatSignedEnergy(w.deviation_gj, meta.unit_energy)}
                    </span>
                    <span className="ml-2 text-[11px] font-mono text-neutral-500">
                      ({formatPercent(w.deviation_pct)})
                    </span>
                  </div>
                </div>

                {/* Deviation Bar */}
                <div className="w-full bg-neutral-200 dark:bg-neutral-700 h-2 rounded-full overflow-hidden flex">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isPos ? 'bg-orange-500 dark:bg-orange-600' : 'bg-emerald-500 dark:bg-emerald-600'
                    }`}
                    style={{ width: `${devPctBar}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SEU Selection Chips */}
      <div>
        <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
          Select SEU to Inspect:
        </div>
        <div className="flex flex-wrap gap-2 no-print">
          {plant.seus.map((s) => {
            const isSelected = activeSeu.seu === s.seu;
            const statusMeta = getStatusMeta(s.status);
            return (
              <button
                key={s.seu}
                onClick={() => onSelectSeuId(s.seu)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:border-neutral-100 shadow-xs'
                    : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-700 hover:border-neutral-400'
                }`}
              >
                <span className={`text-[10px] ${statusMeta.textClass}`}>{statusMeta.icon}</span>
                <span>{s.seu_name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Primary Detail Screen: The SEU Deep Dive */}
      <SeuDetail
        plant={plant}
        seu={activeSeu}
        windowType={windowType}
        meta={meta}
        onWindowChange={setWindowType}
      />

      {/* Plant All SEUs Table View */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-xs">
        <div className="flex items-center gap-2 mb-3">
          <Table className="w-4 h-4 text-neutral-500" />
          <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
            All SEUs of {plant.plant_name} (Overview Table)
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
                <th className="py-2 px-3 font-semibold">SEU</th>
                <th className="py-2 px-3 font-semibold">Status</th>
                <th className="py-2 px-3 font-semibold">Pattern</th>
                <th className="py-2 px-3 font-semibold text-right">Dev 3M</th>
                <th className="py-2 px-3 font-semibold text-right">Excess GJ/yr</th>
                <th className="py-2 px-3 font-semibold text-right">Excess Cost/yr</th>
                <th className="py-2 px-3 font-semibold text-right">Base Load</th>
                <th className="py-2 px-3 font-semibold text-right">R²</th>
                <th className="py-2 px-3 font-semibold text-right">CV(RMSE)</th>
                <th className="py-2 px-3 font-semibold">Model</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
              {plant.seus.map((s) => {
                const statusMeta = getStatusMeta(s.status);
                const isSelected = s.seu === activeSeu.seu;

                return (
                  <tr
                    key={s.seu}
                    onClick={() => onSelectSeuId(s.seu)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-50/60 dark:bg-blue-950/40 font-medium'
                        : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-semibold text-neutral-900 dark:text-neutral-100">
                      {s.seu_name}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${statusMeta.badgeClass}`}>
                        <span>{statusMeta.icon}</span>
                        {statusMeta.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 capitalize text-neutral-600 dark:text-neutral-400">
                      {String(s.pattern.type).replace('_', ' ')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {formatPercent(s.windows.last_3m.deviation_pct)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {formatNumber(s.savings.annualized_excess_gj)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-medium">
                      {formatCurrencyIdr(s.savings.annualized_excess_cost_idr)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {s.model.base_load_share_pct.toFixed(0)}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {s.model.r2.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {s.model.cv_rmse_pct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 capitalize">
                      {s.model.quality}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
