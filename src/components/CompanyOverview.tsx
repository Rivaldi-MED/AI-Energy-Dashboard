import React from 'react';
import { DashboardData, PlantItem, SeuItem } from '../types';
import {
  formatEnergy,
  formatSignedEnergy,
  formatPercent,
  formatCurrencyIdr,
  formatNumber,
  getStatusMeta,
  PRIORITY_MAP,
  STATUS_MAP,
} from '../utils/formatters';
import { AlertCircle, TrendingUp, DollarSign, Cloud, ArrowUpRight, ChevronRight } from 'lucide-react';

interface CompanyOverviewProps {
  data: DashboardData;
  onSelectSeu: (plantId: string, seuId: string) => void;
  onSelectPlant: (plantId: string) => void;
}

export const CompanyOverview: React.FC<CompanyOverviewProps> = ({
  data,
  onSelectSeu,
  onSelectPlant,
}) => {
  const { company, plants, meta } = data;
  const totals = company.totals_last_12m;

  // Sorted plants by avoidable excess cost
  const sortedPlants = [...plants].sort((a, b) => {
    const costA = a.annualized_excess_cost_idr ?? (a.kpis.last_12m.cost_impact_idr > 0 ? a.kpis.last_12m.cost_impact_idr : 0);
    const costB = b.annualized_excess_cost_idr ?? (b.kpis.last_12m.cost_impact_idr > 0 ? b.kpis.last_12m.cost_impact_idr : 0);
    return costB - costA;
  });

  const maxPlantCost = Math.max(
    1,
    ...sortedPlants.map((p) => p.annualized_excess_cost_idr ?? (p.kpis.last_12m.cost_impact_idr > 0 ? p.kpis.last_12m.cost_impact_idr : 0))
  );

  // Status board: flatten all SEUs across all plants and sort worst first
  interface BoardEntry {
    plant: PlantItem;
    seu: SeuItem;
  }
  const allSeus: BoardEntry[] = [];
  plants.forEach((plant) => {
    plant.seus.forEach((seu) => {
      allSeus.push({ plant, seu });
    });
  });

  allSeus.sort((a, b) => {
    const rankDiff = (STATUS_MAP[b.seu.status]?.rank ?? 0) - (STATUS_MAP[a.seu.status]?.rank ?? 0);
    if (rankDiff !== 0) return rankDiff;
    return (b.seu.windows.last_3m.deviation_pct ?? 0) - (a.seu.windows.last_3m.deviation_pct ?? 0);
  });

  return (
    <div className="space-y-6">
      {/* Executive Callout */}
      <div className="bg-white dark:bg-neutral-900 border-l-4 border-blue-600 rounded-xl p-5 shadow-xs border border-neutral-200 dark:border-neutral-800">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-50 dark:bg-blue-950/60 rounded-lg text-blue-600 dark:text-blue-400 mt-0.5 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
              Company Executive Summary
            </h2>
            <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed font-medium">
              {company.summary}
            </p>
          </div>
        </div>
      </div>

      {/* 12-Month KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Energy */}
        <div className="bg-white dark:bg-neutral-900 rounded-xl p-4 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
            Energy Used (12 mo)
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 tabular-nums">
            {formatNumber(totals.actual_gj)} <span className="text-sm font-normal text-neutral-500">{meta.unit_energy}</span>
          </div>
          <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Expected: {formatEnergy(totals.expected_gj, meta.unit_energy)}
          </div>
        </div>

        {/* Deviation */}
        <div className="bg-white dark:bg-neutral-900 rounded-xl p-4 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
            Versus Baseline Model
          </div>
          <div className={`mt-2 text-2xl font-bold tracking-tight tabular-nums ${
            totals.deviation_pct > meta.band_pct
              ? 'text-red-600 dark:text-red-400'
              : totals.deviation_pct < -meta.band_pct
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-neutral-900 dark:text-neutral-50'
          }`}>
            {formatPercent(totals.deviation_pct)}
          </div>
          <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {formatSignedEnergy(totals.deviation_gj, meta.unit_energy)} vs baseline
          </div>
        </div>

        {/* Cost Impact */}
        <div className="bg-white dark:bg-neutral-900 rounded-xl p-4 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
              Avoidable Cost Impact
            </span>
            <DollarSign className="w-4 h-4 text-neutral-400" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 tabular-nums">
            {formatCurrencyIdr(totals.cost_impact_idr)}
          </div>
          <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 truncate" title={meta.tariff_note}>
            12-month excess cost ({meta.tariff_note.slice(0, 24)}...)
          </div>
        </div>

        {/* CO2 Impact */}
        <div className="bg-white dark:bg-neutral-900 rounded-xl p-4 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
              CO₂ Impact (12 mo)
            </span>
            <Cloud className="w-4 h-4 text-neutral-400" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 tabular-nums">
            {formatNumber(totals.co2_impact_t, 0)} <span className="text-sm font-normal text-neutral-500">t CO₂</span>
          </div>
          <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Scope 1 & 2 placeholder factors
          </div>
        </div>
      </div>

      {/* Question 1: Plant Ranking by Avoidable Cost */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-xs">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
              Q1
            </span>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
              Which plant carries the most avoidable energy cost?
            </h3>
          </div>
          <span className="text-xs text-neutral-500">Annualized Excess Cost</span>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
          Annualised excess cost = recent positive deviation × 12 at energy carriers tariffs. Click a plant to inspect its SEUs.
        </p>

        <div className="space-y-3">
          {sortedPlants.map((plant) => {
            const cost = plant.annualized_excess_cost_idr ?? (plant.kpis.last_12m.cost_impact_idr > 0 ? plant.kpis.last_12m.cost_impact_idr : 0);
            const pctBar = Math.min(100, Math.max(4, (cost / maxPlantCost) * 100));
            const critHigh = plant.n_seu_critical_high ?? plant.seus.filter((s) => s.status === 'critical' || s.status === 'high').length;
            const watchCount = plant.n_seu_watch ?? plant.seus.filter((s) => s.status === 'watch').length;

            return (
              <div
                key={plant.plant}
                onClick={() => onSelectPlant(plant.plant)}
                className="group p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:border-blue-400 dark:hover:border-blue-600 bg-neutral-50/60 dark:bg-neutral-800/40 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 cursor-pointer transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <div>
                    <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 flex items-center gap-1.5">
                      {plant.plant_name}
                      <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      {critHigh > 0 && <span className="text-orange-600 dark:text-orange-400 font-medium">{critHigh} high/critical</span>}
                      {critHigh > 0 && watchCount > 0 && ' · '}
                      {watchCount > 0 && <span className="text-amber-600 dark:text-amber-400">{watchCount} watch</span>}
                      {critHigh === 0 && watchCount === 0 && <span>all SEUs within band</span>}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-sm text-neutral-900 dark:text-neutral-100 tabular-nums">
                      {formatCurrencyIdr(cost)}
                    </span>
                    <span className="block text-[11px] text-neutral-500">per year</span>
                  </div>
                </div>

                {/* Bar */}
                <div className="w-full bg-neutral-200 dark:bg-neutral-700 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-600 dark:bg-blue-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${pctBar}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Question 2: Top SEUs to act on */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-xs">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
            Q2
          </span>
          <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
            Top Priority Significant Energy Uses (SEUs) to Act On
          </h3>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
          Ordered by annualized excess cost. Click any row to examine the root-cause diagnosis, EnPI model, and action checklist.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400">
                <th className="py-2.5 px-3 font-semibold">#</th>
                <th className="py-2.5 px-3 font-semibold">Plant</th>
                <th className="py-2.5 px-3 font-semibold">SEU Name</th>
                <th className="py-2.5 px-3 font-semibold">Status</th>
                <th className="py-2.5 px-3 font-semibold">Pattern</th>
                <th className="py-2.5 px-3 font-semibold text-right">Excess GJ/yr</th>
                <th className="py-2.5 px-3 font-semibold text-right">Excess Cost/yr</th>
                <th className="py-2.5 px-3 font-semibold">Priority</th>
                <th className="py-2.5 px-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
              {company.top_seus.map((item, idx) => {
                const statusMeta = getStatusMeta(item.status);
                const priorityMeta = PRIORITY_MAP[item.priority] || PRIORITY_MAP.none;

                return (
                  <tr
                    key={`${item.plant}-${item.seu}`}
                    onClick={() => onSelectSeu(item.plant, item.seu)}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 cursor-pointer transition-colors group"
                  >
                    <td className="py-3 px-3 font-mono text-neutral-400">{idx + 1}</td>
                    <td className="py-3 px-3 font-medium text-neutral-700 dark:text-neutral-300">
                      {item.plant_name}
                    </td>
                    <td className="py-3 px-3 font-semibold text-neutral-900 dark:text-neutral-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                      {item.seu_name}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusMeta.badgeClass}`}>
                        <span aria-hidden="true">{statusMeta.icon}</span>
                        {statusMeta.label}
                      </span>
                    </td>
                    <td className="py-3 px-3 capitalize text-neutral-600 dark:text-neutral-400">
                      {String(item.pattern).replace('_', ' ')}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-medium text-neutral-800 dark:text-neutral-200">
                      {formatNumber(item.annualized_excess_gj)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-neutral-900 dark:text-neutral-100">
                      {formatCurrencyIdr(item.annualized_excess_cost_idr)}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${priorityMeta.badgeClass}`}>
                        {priorityMeta.label}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-neutral-400 group-hover:text-blue-600">
                      <ChevronRight className="w-4 h-4" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Status Board: Every SEU, worst first */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-xs">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
            Status Board: Every SEU across all plants (worst first)
          </h3>
          <span className="text-xs text-neutral-500">{allSeus.length} Total SEUs</span>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
          Status combines the 3-month deviation size with persistence checks (CUSUM & alarm band). Click any tile to inspect.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {allSeus.map(({ plant, seu }) => {
            const statusMeta = getStatusMeta(seu.status);
            const dev3m = seu.windows.last_3m.deviation_pct;

            return (
              <button
                key={`${plant.plant}-${seu.seu}`}
                onClick={() => onSelectSeu(plant.plant, seu.seu)}
                className={`text-left p-3 rounded-lg border bg-white dark:bg-neutral-800/80 hover:shadow-xs transition-all cursor-pointer border-l-4 ${statusMeta.borderClass} border-neutral-200 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-500`}
              >
                <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 truncate">
                  {plant.plant_name}
                </div>
                <div className="font-semibold text-xs text-neutral-900 dark:text-neutral-100 truncate mt-0.5">
                  {seu.seu_name}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className={`inline-flex items-center gap-1 font-semibold ${statusMeta.textClass}`}>
                    <span aria-hidden="true">{statusMeta.icon}</span>
                    {statusMeta.label}
                  </span>
                  <span className="font-mono text-neutral-600 dark:text-neutral-400">
                    {formatPercent(dev3m)} (3mo)
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
