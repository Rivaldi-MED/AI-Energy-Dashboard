import React from 'react';
import { DashboardData } from '../types';
import {
  formatNumber,
  formatCurrencyIdr,
  getStatusMeta,
  PRIORITY_MAP,
} from '../utils/formatters';
import { Download, Printer, ShieldCheck, ExternalLink } from 'lucide-react';

interface ActionRegisterProps {
  data: DashboardData;
  onSelectSeu: (plantId: string, seuId: string) => void;
  onPrint: () => void;
}

export const ActionRegister: React.FC<ActionRegisterProps> = ({
  data,
  onSelectSeu,
  onPrint,
}) => {
  const { plants, meta } = data;

  // Flatten all SEUs across all plants where priority != 'none' and verdict != 'activity_driven'
  interface ActionRow {
    plantId: string;
    plantName: string;
    seuId: string;
    seuName: string;
    status: string;
    pattern: string;
    priority: string;
    firstAction: string;
    allActions: string[];
    annualizedExcessGj: number;
    annualizedExcessCostIdr: number;
    annualizedExcessCo2T: number;
    target: string;
  }

  const rows: ActionRow[] = [];

  plants.forEach((plant) => {
    plant.seus.forEach((seu) => {
      // Exclude activity-driven (not a fault per acceptance rules)
      if (seu.verdict === 'activity_driven') return;

      const priority = seu.corrective_actions?.priority;
      if (priority && priority !== 'none') {
        const firstAction = seu.corrective_actions.items?.[0] || 'Monitor performance';
        rows.push({
          plantId: plant.plant,
          plantName: plant.plant_name,
          seuId: seu.seu,
          seuName: seu.seu_name,
          status: seu.status,
          pattern: seu.pattern.type,
          priority,
          firstAction,
          allActions: seu.corrective_actions.items || [],
          annualizedExcessGj: seu.savings.annualized_excess_gj,
          annualizedExcessCostIdr: seu.savings.annualized_excess_cost_idr,
          annualizedExcessCo2T: seu.savings.annualized_excess_co2_t,
          target: seu.corrective_actions.target || 'N/A',
        });
      }
    });
  });

  // Sort immediate → short_term → planned → monitor
  rows.sort((a, b) => {
    const pA = PRIORITY_MAP[a.priority]?.rank ?? 0;
    const pB = PRIORITY_MAP[b.priority]?.rank ?? 0;
    if (pB !== pA) return pB - pA;
    return b.annualizedExcessCostIdr - a.annualizedExcessCostIdr;
  });

  // Export CSV handler
  const exportCsv = () => {
    const headers = [
      'Plant',
      'SEU Name',
      'Status',
      'Pattern',
      'Priority',
      'First Action Item',
      'Annualized Excess (GJ)',
      'Annualized Excess Cost (IDR)',
      'Annualized Excess CO2 (t)',
      'Target',
    ];

    const csvLines = [headers.join(',')];

    rows.forEach((r) => {
      const line = [
        `"${r.plantName.replace(/"/g, '""')}"`,
        `"${r.seuName.replace(/"/g, '""')}"`,
        `"${r.status}"`,
        `"${r.pattern}"`,
        `"${r.priority}"`,
        `"${r.firstAction.replace(/"/g, '""')}"`,
        r.annualizedExcessGj,
        r.annualizedExcessCostIdr,
        r.annualizedExcessCo2T,
        `"${r.target.replace(/"/g, '""')}"`,
      ];
      csvLines.push(line.join(','));
    });

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `energy_action_register_${meta.report_month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const totalCost = rows.reduce((acc, r) => acc + r.annualizedExcessCostIdr, 0);
  const totalGj = rows.reduce((acc, r) => acc + r.annualizedExcessGj, 0);
  const totalCo2 = rows.reduce((acc, r) => acc + r.annualizedExcessCo2T, 0);

  return (
    <div className="space-y-6">
      {/* Title & Action Buttons */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
              ISO 50001 Corrective Action Register
            </h2>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
            Consolidated action items across all operating units, ordered by urgency: Immediate → Short-Term → Planned → Monitor.
          </p>
        </div>

        <div className="flex items-center gap-2 no-print">
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-300 dark:border-neutral-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={onPrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Register</span>
          </button>
        </div>
      </div>

      {/* Aggregate Register Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Active Action Items</div>
          <div className="text-2xl font-bold font-mono text-neutral-900 dark:text-neutral-50 mt-1">
            {rows.length} <span className="text-xs font-normal text-neutral-500">SEUs</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Total Avoidable Energy</div>
          <div className="text-2xl font-bold font-mono text-neutral-900 dark:text-neutral-50 mt-1">
            {formatNumber(totalGj)} <span className="text-xs font-normal text-neutral-500">{meta.unit_energy}/yr</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Total Avoidable Cost</div>
          <div className="text-2xl font-bold font-mono text-neutral-900 dark:text-neutral-50 mt-1">
            {formatCurrencyIdr(totalCost)}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xs">
          <div className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">CO₂ Abatement Potential</div>
          <div className="text-2xl font-bold font-mono text-neutral-900 dark:text-neutral-50 mt-1">
            {formatNumber(totalCo2)} <span className="text-xs font-normal text-neutral-500">t CO₂/yr</span>
          </div>
        </div>
      </div>

      {/* Action Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300">
                <th className="py-3 px-3.5 font-semibold">Priority</th>
                <th className="py-3 px-3.5 font-semibold">Plant</th>
                <th className="py-3 px-3.5 font-semibold">SEU</th>
                <th className="py-3 px-3.5 font-semibold">Status</th>
                <th className="py-3 px-3.5 font-semibold">Pattern</th>
                <th className="py-3 px-3.5 font-semibold min-w-[240px]">Primary Action Item</th>
                <th className="py-3 px-3.5 font-semibold text-right">Excess GJ/yr</th>
                <th className="py-3 px-3.5 font-semibold text-right">Excess Cost/yr</th>
                <th className="py-3 px-3.5 font-semibold text-right">CO₂ t/yr</th>
                <th className="py-3 px-3.5 font-semibold min-w-[180px]">Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
              {rows.map((r, i) => {
                const statusMeta = getStatusMeta(r.status);
                const priorityMeta = PRIORITY_MAP[r.priority] || PRIORITY_MAP.none;

                return (
                  <tr
                    key={i}
                    onClick={() => onSelectSeu(r.plantId, r.seuId)}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 cursor-pointer transition-colors group"
                  >
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${priorityMeta.badgeClass}`}>
                        {priorityMeta.label}
                      </span>
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap font-medium text-neutral-700 dark:text-neutral-300">
                      {r.plantName}
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap font-semibold text-neutral-900 dark:text-neutral-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                      <span className="flex items-center gap-1">
                        {r.seuName}
                        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                      </span>
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${statusMeta.badgeClass}`}>
                        <span>{statusMeta.icon}</span>
                        {statusMeta.label}
                      </span>
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap capitalize text-neutral-600 dark:text-neutral-400">
                      {r.pattern.replace('_', ' ')}
                    </td>
                    <td className="py-3 px-3.5 text-neutral-800 dark:text-neutral-200">
                      {r.firstAction}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono text-neutral-800 dark:text-neutral-200 whitespace-nowrap">
                      {formatNumber(r.annualizedExcessGj)}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono font-bold text-neutral-900 dark:text-neutral-100 whitespace-nowrap">
                      {formatCurrencyIdr(r.annualizedExcessCostIdr)}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono text-neutral-800 dark:text-neutral-200 whitespace-nowrap">
                      {formatNumber(r.annualizedExcessCo2T)}
                    </td>
                    <td className="py-3 px-3.5 text-neutral-600 dark:text-neutral-400 text-[11px]">
                      {r.target}
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
