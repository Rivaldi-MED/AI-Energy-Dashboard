import React from 'react';
import { DashboardData } from '../types';
import { Shield, BookOpen, AlertOctagon, CheckCircle2 } from 'lucide-react';

interface DataQualityAndMethodProps {
  data: DashboardData;
}

export const DataQualityAndMethod: React.FC<DataQualityAndMethodProps> = ({ data }) => {
  const { data_quality, method, plants } = data;

  // Group data quality issues by plant
  const qualityByPlant: Record<string, typeof data_quality> = {};
  data_quality.forEach((item) => {
    if (!qualityByPlant[item.plant]) {
      qualityByPlant[item.plant] = [];
    }
    qualityByPlant[item.plant].push(item);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-xs border-l-4 border-l-blue-600">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
            ISO 50001 Methodology, Compliance & Data Governance
          </h2>
        </div>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Standardized energy performance indicators (EnPI), normalization baselines, audit clause mappings, and known analytical limitations.
        </p>
      </div>

      {/* Limitations (Always visible per requirement 5 & acceptance criteria) */}
      <div className="bg-amber-50/70 dark:bg-amber-950/40 rounded-xl p-5 border border-amber-300 dark:border-amber-800/60 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/60 rounded-lg text-amber-700 dark:text-amber-300 shrink-0">
            <AlertOctagon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-amber-950 dark:text-amber-200">
              Methodology Scope & Governance Limitations (Always Visible)
            </h3>
            <ul className="mt-3 space-y-2 text-xs sm:text-sm text-amber-900 dark:text-amber-300">
              {method.limitations.map((limit, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="font-bold text-amber-600 dark:text-amber-400 shrink-0">•</span>
                  <span>{limit}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Data Quality Log grouped by plant */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-xs">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
            Data Quality & Telemetry Audit Log
          </h3>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
          Records missing meters, estimated consumption windows, and sensor communication issues affecting baseline calculations.
        </p>

        {Object.keys(qualityByPlant).length > 0 ? (
          <div className="space-y-4">
            {Object.entries(qualityByPlant).map(([plantId, items]) => {
              const plantObj = plants.find((p) => p.plant === plantId);
              const plantName = plantObj ? plantObj.plant_name : plantId;

              return (
                <div key={plantId} className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
                  <div className="bg-neutral-100 dark:bg-neutral-800 px-3.5 py-2 text-xs font-bold text-neutral-800 dark:text-neutral-200 flex items-center justify-between">
                    <span>{plantName}</span>
                    <span className="text-[11px] font-normal text-neutral-500">{items.length} issue(s)</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
                          <th className="py-2 px-3 font-semibold">SEU</th>
                          <th className="py-2 px-3 font-semibold">Scope</th>
                          <th className="py-2 px-3 font-semibold">Issue Identified</th>
                          <th className="py-2 px-3 font-semibold text-right">Months Affected</th>
                          <th className="py-2 px-3 font-semibold">Detail</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
                        {items.map((it, idx) => (
                          <tr key={idx} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                            <td className="py-2 px-3 font-mono font-medium text-neutral-800 dark:text-neutral-200">
                              {it.seu}
                            </td>
                            <td className="py-2 px-3 text-neutral-600 dark:text-neutral-400">
                              {it.scope}
                            </td>
                            <td className="py-2 px-3 font-medium text-amber-700 dark:text-amber-400">
                              {it.issue}
                            </td>
                            <td className="py-2 px-3 text-right font-mono">
                              {it.months}
                            </td>
                            <td className="py-2 px-3 text-neutral-600 dark:text-neutral-400">
                              {it.detail}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>All SEUs across all plants report 100% measured meter coverage with no logged quality issues.</span>
          </div>
        )}
      </div>

      {/* ISO 50001 / ISO 50002 Clause Mapping */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-xs">
        <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 mb-1">
          ISO 50001:2018 & ISO 50002 Clause Mapping
        </h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
          How this monitoring platform maps to international energy management standard clauses.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
                <th className="py-2.5 px-3 font-semibold w-1/3">Standard Clause</th>
                <th className="py-2.5 px-3 font-semibold">Dashboard Implementation & Control</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
              {Object.entries(method.iso_mapping).map(([clause, description]) => (
                <tr key={clause} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                  <td className="py-2.5 px-3 font-semibold text-neutral-900 dark:text-neutral-100">
                    {clause}
                  </td>
                  <td className="py-2.5 px-3 text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    {description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Technical Definitions */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-xs">
        <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 mb-1">
          Technical Definitions & Metric Formulas
        </h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
          Definitions of EnPI indicators, base loads, CUSUM accumulation, and regression metrics.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
                <th className="py-2.5 px-3 font-semibold w-1/4">Term</th>
                <th className="py-2.5 px-3 font-semibold">Definition</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
              {Object.entries(method.definitions).map(([term, def]) => (
                <tr key={term} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                  <td className="py-2.5 px-3 font-semibold text-neutral-900 dark:text-neutral-100 font-mono">
                    {term}
                  </td>
                  <td className="py-2.5 px-3 text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    {def}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
