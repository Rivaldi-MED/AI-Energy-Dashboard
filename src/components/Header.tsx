import React from 'react';
import { DashboardData } from '../types';
import { formatMonthLabel } from '../utils/formatters';
import { Sun, Moon, Printer, Upload, MessageSquare, AlertTriangle, ShieldCheck, Database } from 'lucide-react';

interface HeaderProps {
  data: DashboardData;
  activeTab: string;
  onTabChange: (tab: string) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenUpload: () => void;
  onPrint: () => void;
  aiAssistantOpen: boolean;
  onToggleAiAssistant: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  data,
  activeTab,
  onTabChange,
  darkMode,
  onToggleDarkMode,
  onOpenUpload,
  onPrint,
  aiAssistantOpen,
  onToggleAiAssistant,
}) => {
  const meta = data.meta;
  const company = data.company;

  // Count active actions (immediate, short_term, planned)
  const actionableCount = company.top_seus?.filter(
    (s) => s.priority === 'immediate' || s.priority === 'short_term' || s.priority === 'planned'
  ).length || 0;

  return (
    <header className="border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 transition-colors">
      {/* Top Banner if synthetic */}
      {meta.data_is_synthetic && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-900/60 px-4 py-2 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              <strong>Synthetic demo data.</strong> Plants, energy series, regression baselines, operational events, and tariffs are generated to demonstrate the ISO 50001 / ISO 50002 methodology.
            </span>
          </div>
          <span className="hidden sm:inline font-mono opacity-80 text-[11px]">
            {meta.tariff_note}
          </span>
        </div>
      )}

      {/* Main Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-blue-600 text-white font-bold text-xs tracking-wider uppercase">
                ISO 50001
              </span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
                Energy Performance Monitor
              </h1>
            </div>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>Report Month: <strong className="text-neutral-900 dark:text-neutral-200">{formatMonthLabel(meta.report_month)}</strong></span>
              <span>•</span>
              <span>Baseline: <strong className="text-neutral-900 dark:text-neutral-200">{formatMonthLabel(meta.baseline.start)} – {formatMonthLabel(meta.baseline.end)}</strong></span>
              <span>•</span>
              <span>Alarm Band: <strong className="text-neutral-900 dark:text-neutral-200">±{meta.band_pct}%</strong></span>
              <span>•</span>
              <span className="opacity-80">Gen: {meta.generated_at}</span>
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center flex-wrap gap-2 no-print">
            {/* Ask the data Gemini toggle */}
            <button
              onClick={onToggleAiAssistant}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                aiAssistantOpen
                  ? 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-700'
                  : 'bg-neutral-50 text-neutral-700 border-neutral-300 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700 dark:hover:bg-neutral-700'
              }`}
              title="Toggle AI Data Assistant (Optional Gemini integration)"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Ask the Data</span>
            </button>

            {/* Upload JSON */}
            <button
              onClick={onOpenUpload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-50 text-neutral-700 border border-neutral-300 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700 dark:hover:bg-neutral-700 transition-colors"
              title="Upload new month's JSON or load sample"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Load JSON</span>
            </button>

            {/* Print */}
            <button
              onClick={onPrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-50 text-neutral-700 border border-neutral-300 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700 dark:hover:bg-neutral-700 transition-colors"
              title="Print dashboard report / save as PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print</span>
            </button>

            {/* Theme Toggle */}
            <button
              onClick={onToggleDarkMode}
              className="p-1.5 rounded-lg text-neutral-600 hover:text-neutral-900 border border-neutral-300 dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-white bg-neutral-50 dark:bg-neutral-800"
              title="Toggle light/dark theme"
              aria-label="Toggle theme"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mt-4 flex items-center overflow-x-auto border-t border-neutral-200 dark:border-neutral-800 pt-2 gap-1 no-print">
          <button
            onClick={() => onTabChange('company')}
            className={`px-3 py-2 rounded-md text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'company'
                ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <span>Company Overview</span>
          </button>

          {data.plants.map((p) => (
            <button
              key={p.plant}
              onClick={() => onTabChange(p.plant)}
              className={`px-3 py-2 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === p.plant
                  ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              {p.plant_name}
            </button>
          ))}

          <button
            onClick={() => onTabChange('register')}
            className={`px-3 py-2 rounded-md text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'register'
                ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Action Register</span>
            {actionableCount > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                activeTab === 'register' ? 'bg-red-500 text-white' : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
              }`}>
                {actionableCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onTabChange('method')}
            className={`px-3 py-2 rounded-md text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === 'method'
                ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Method & Quality</span>
          </button>
        </div>
      </div>
    </header>
  );
};
