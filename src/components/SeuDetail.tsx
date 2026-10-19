import React, { useState, useEffect } from 'react';
import { SeuItem, PlantItem, Meta, TimeWindow } from '../types';
import {
  formatEnergy,
  formatSignedEnergy,
  formatPercent,
  formatCurrencyIdr,
  formatNumber,
  formatMonthLabel,
  getStatusMeta,
  PRIORITY_MAP,
} from '../utils/formatters';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from 'recharts';
import {
  AlertTriangle,
  CheckSquare,
  Square,
  Copy,
  Check,
  Zap,
  Info,
  Calendar,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface SeuDetailProps {
  plant: PlantItem;
  seu: SeuItem;
  windowType: TimeWindow;
  meta: Meta;
  onWindowChange: (w: TimeWindow) => void;
}

export const SeuDetail: React.FC<SeuDetailProps> = ({
  plant,
  seu,
  windowType,
  meta,
  onWindowChange,
}) => {
  const windowKpi = seu.windows[windowType];
  const { model, why, diagnosis, corrective_actions, savings, pattern, series, events = [] } = seu;
  const statusMeta = getStatusMeta(seu.status);
  const priorityMeta = PRIORITY_MAP[corrective_actions.priority] || PRIORITY_MAP.none;

  // Local state for interactive verification checklist
  const storageKey = `iso50001_check_${plant.plant}_${seu.seu}`;
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [copiedActionPlan, setCopiedActionPlan] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(checkedItems));
    } catch (e) {
      console.warn('localStorage not available', e);
    }
  }, [checkedItems, storageKey]);

  const toggleCheck = (item: string) => {
    setCheckedItems((prev) => ({
      ...prev,
      [item]: !prev[item],
    }));
  };

  const copyActionPlan = () => {
    const text = `=== ISO 50001 ENERGY ACTION PLAN ===
Plant: ${plant.plant_name}
SEU: ${seu.seu_name} (${seu.carrier.toUpperCase()})
Status: ${statusMeta.label} | Pattern: ${pattern.type} (${pattern.confidence})
Priority: ${corrective_actions.priority.toUpperCase()}

Headline:
${why.headline}

Pattern & Decomposition:
${why.pattern_text}
${why.decomposition_text}

Hypotheses to verify:
${diagnosis.likely_causes.map((c) => `- [ ] ${c}`).join('\n')}

Audit Verification Checklist:
${diagnosis.verify_first.map((v) => `- [${checkedItems[v] ? 'X' : ' '}] ${v}`).join('\n')}

Corrective Actions:
${corrective_actions.items.map((a, i) => `${i + 1}. ${a}`).join('\n')}
Target: ${corrective_actions.target || 'N/A'}

Recoverable Impact:
- Annualized Excess Energy: ${formatNumber(savings.annualized_excess_gj)} GJ
- Annualized Excess Cost: ${formatCurrencyIdr(savings.annualized_excess_cost_idr)}
- Annualized Excess CO2: ${formatNumber(savings.annualized_excess_co2_t)} t
Generated: ${meta.generated_at}
`;
    navigator.clipboard.writeText(text);
    setCopiedActionPlan(true);
    setTimeout(() => setCopiedActionPlan(false), 2500);
  };

  // Find baseline boundary for charting
  const baselineEndPeriod = meta.baseline.end;
  const baselineStartPeriod = meta.baseline.start;

  // Prepare chart series data
  const bandFraction = meta.band_pct / 100;
  const chartData = series.map((pt) => {
    const expected = pt.expected_gj;
    return {
      period: pt.period,
      periodLabel: formatMonthLabel(pt.period),
      actual: pt.actual_gj,
      expected: pt.expected_gj,
      bandLo: expected * (1 - bandFraction),
      bandHi: expected * (1 + bandFraction),
      deviation_pct: pt.deviation_pct,
      cusum_gj: pt.cusum_gj,
      in_baseline: pt.in_baseline,
      outside_range: pt.outside_baseline_range,
      data_quality: pt.data_quality,
      production_ton: pt.production_ton,
      sec: pt.sec_gj_per_ton,
    };
  });

  // Calculate waterfall bar values
  const decomp = [
    {
      label: 'Production Volume',
      sub: 'Output effect',
      value: windowKpi.volume_gj,
      color: 'bg-blue-600 dark:bg-blue-500',
    },
    {
      label: 'Weather Effect',
      sub: 'Ambient temperature',
      value: windowKpi.weather_gj,
      color: 'bg-teal-600 dark:bg-teal-500',
    },
    {
      label: 'Efficiency / Other',
      sub: 'Unexplained by baseline model',
      value: windowKpi.efficiency_gj,
      color: windowKpi.efficiency_gj > 0 ? 'bg-orange-600 dark:bg-orange-500' : 'bg-emerald-600 dark:bg-emerald-500',
    },
  ];

  const decompMax = Math.max(1, ...decomp.map((d) => Math.abs(d.value)));

  return (
    <div className="space-y-6">
      {/* SEU Header Card */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-xs border-l-4 border-l-blue-600">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 uppercase tracking-wide">
                {plant.plant_name}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 uppercase tracking-wide">
                {seu.carrier}
              </span>
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${statusMeta.badgeClass}`}>
                <span aria-hidden="true">{statusMeta.icon}</span>
                {statusMeta.label}
              </span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 capitalize">
                {String(seu.verdict).replace('_', ' ')}
              </span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                Pattern: <strong className="capitalize">{String(pattern.type).replace('_', ' ')}</strong>
                {pattern.confidence === 'tentative' && (
                  <span className="ml-1 text-amber-600 dark:text-amber-400 font-semibold">(tentative)</span>
                )}
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${priorityMeta.badgeClass}`}>
                Priority: {priorityMeta.label}
              </span>
            </div>

            <h2 className="text-lg sm:text-xl font-bold text-neutral-900 dark:text-neutral-50">
              {seu.seu_name}
            </h2>
            <p className="mt-1 text-sm font-medium text-neutral-800 dark:text-neutral-200">
              {why.headline}
            </p>
          </div>

          {/* Time Window Switcher in SEU View */}
          <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg self-start text-xs font-medium no-print">
            <button
              onClick={() => onWindowChange('report_month')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                windowType === 'report_month'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs font-semibold'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => onWindowChange('last_3m')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                windowType === 'last_3m'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs font-semibold'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
              }`}
            >
              Last 3M
            </button>
            <button
              onClick={() => onWindowChange('last_12m')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                windowType === 'last_12m'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-xs font-semibold'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
              }`}
            >
              Last 12M
            </button>
          </div>
        </div>
      </div>

      {/* Question 3: Why is it high (or not)? - Root-Cause Decomposition */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-5">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
            Q3
          </span>
          <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
            Why is it high (or not)? Decomposition & EnPI Analysis
          </h3>
        </div>

        {/* Narrative explanation */}
        <div className="space-y-2 text-xs sm:text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
          <p>
            <strong className="text-neutral-900 dark:text-neutral-100">Pattern Shape:</strong> {why.pattern_text}
          </p>
          <p className="text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800/50 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <strong className="text-neutral-800 dark:text-neutral-200">Decomposition:</strong> {why.decomposition_text}
          </p>
          {why.event_text && (
            <p className="bg-orange-50 dark:bg-orange-950/40 p-3 rounded-lg border border-orange-200 dark:border-orange-800/50 text-orange-900 dark:text-orange-200">
              <strong>Logged Operational Event:</strong> {why.event_text}
            </p>
          )}
          {why.activity_text && (
            <p className="bg-blue-50 dark:bg-blue-950/40 p-3 rounded-lg border border-blue-200 dark:border-blue-800/50 text-blue-900 dark:text-blue-200">
              <strong>Activity Note:</strong> {why.activity_text}
            </p>
          )}
        </div>

        {/* Stacked / Waterfall decomposition breakdown */}
        <div>
          <div className="flex items-center justify-between text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
            <span>Where the change comes from ({windowType === 'report_month' ? 'Report Month' : windowType === 'last_3m' ? 'Last 3 Months' : 'Last 12 Months'})</span>
            <span className="text-neutral-500 font-mono">Volume + Weather + Efficiency = Net Change</span>
          </div>
          <div className="space-y-2">
            {decomp.map((item) => {
              const absVal = Math.abs(item.value);
              const barWidth = Math.max(3, (absVal / decompMax) * 100);
              const isPos = item.value >= 0;

              return (
                <div
                  key={item.label}
                  className="p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="w-48 shrink-0">
                    <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                      {item.label}
                    </div>
                    <div className="text-[11px] text-neutral-500">{item.sub}</div>
                  </div>
                  <div className="grow mx-2">
                    <div className="w-full bg-neutral-200 dark:bg-neutral-700 h-2 rounded-full overflow-hidden">
                      <div
                        className={`${item.color} h-full rounded-full transition-all`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right w-28 shrink-0 font-mono text-xs font-bold text-neutral-900 dark:text-neutral-100">
                    {formatSignedEnergy(item.value, meta.unit_energy)}
                  </div>
                </div>
              );
            })}

            {/* Net Total Sum */}
            <div className="p-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-between font-bold text-xs">
              <div>
                <span>Net Change vs Baseline</span>
                <span className="block text-[11px] font-normal text-neutral-500">
                  Sum of volume, weather, and efficiency deviations
                </span>
              </div>
              <div className="font-mono text-neutral-900 dark:text-neutral-100">
                {formatSignedEnergy(windowKpi.change_vs_baseline_gj, meta.unit_energy)}
              </div>
            </div>
          </div>
        </div>

        {/* Charts: Monthly Performance Series */}
        <div className="space-y-4 pt-2">
          {/* Chart 1: Actual vs Expected Line Chart */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs mb-2 gap-1">
              <div>
                <span className="font-bold text-neutral-900 dark:text-neutral-100">
                  Actual versus Expected Energy (Monthly, GJ)
                </span>
                <span className="text-neutral-500 ml-2">Shaded baseline model calibration period (24m)</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-neutral-600 dark:text-neutral-400">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-blue-600 inline-block"></span> Actual
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 border-t border-dashed border-neutral-500 inline-block"></span> Expected
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 bg-blue-100 dark:bg-blue-950 inline-block border border-blue-300"></span> ±{meta.band_pct}% Band
                </span>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis
                    dataKey="period"
                    tickFormatter={(val) => formatMonthLabel(val)}
                    interval="preserveStartEnd"
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    tickFormatter={(val) => formatNumber(val, 0)}
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0].payload;
                      return (
                        <div className="bg-neutral-900 text-white p-2.5 rounded-lg text-xs shadow-lg space-y-1">
                          <div className="font-bold border-b border-neutral-700 pb-1">
                            {formatMonthLabel(pt.period)}
                            {pt.data_quality && pt.data_quality !== 'measured' && (
                              <span className="ml-1 text-amber-400 font-normal">({pt.data_quality})</span>
                            )}
                          </div>
                          <div>Actual: <strong>{formatNumber(pt.actual)} GJ</strong></div>
                          <div>Expected: <strong>{formatNumber(pt.expected)} GJ</strong></div>
                          <div>Deviation: <strong>{formatPercent(pt.deviation_pct)}</strong></div>
                          <div>Production: <strong>{formatNumber(pt.production_ton)} t</strong></div>
                          <div>Specific Energy: <strong>{formatNumber(pt.sec, 2)} GJ/t</strong></div>
                        </div>
                      );
                    }}
                  />
                  {/* Shaded baseline region */}
                  <ReferenceArea
                    x1={baselineStartPeriod}
                    x2={baselineEndPeriod}
                    fill="#94a3b8"
                    fillOpacity={0.15}
                    label={{ value: 'Baseline Period', position: 'insideTopLeft', fill: '#64748b', fontSize: 10 }}
                  />
                  {/* Pattern change month line */}
                  {pattern.likely_change_month && (
                    <ReferenceLine
                      x={pattern.likely_change_month}
                      stroke="#ea580c"
                      strokeDasharray="4 4"
                      label={{ value: 'Step / Change', position: 'top', fill: '#ea580c', fontSize: 10 }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="expected"
                    stroke="#71717a"
                    strokeDasharray="4 4"
                    dot={false}
                    name="Expected"
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 5 }}
                    name="Actual"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Monthly Deviation % Chart */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-bold text-neutral-900 dark:text-neutral-100">
                Monthly Deviation (% vs Baseline Expected Model)
              </span>
              <span className="text-[11px] text-neutral-500">Alarm threshold: ±{meta.band_pct}%</span>
            </div>
            <div className="h-36 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis
                    dataKey="period"
                    tickFormatter={(val) => formatMonthLabel(val)}
                    interval="preserveStartEnd"
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    domain={[-15, 15]}
                    tickFormatter={(val) => `${val}%`}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0].payload;
                      return (
                        <div className="bg-neutral-900 text-white p-2 rounded-lg text-xs shadow-md">
                          <div className="font-semibold">{formatMonthLabel(pt.period)}</div>
                          <div>Deviation: <strong>{formatPercent(pt.deviation_pct)}</strong></div>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine y={0} stroke="#71717a" />
                  <ReferenceLine
                    y={meta.band_pct}
                    stroke="#dc2626"
                    strokeDasharray="3 3"
                    label={{ value: `+${meta.band_pct}%`, fill: '#dc2626', fontSize: 9, position: 'right' }}
                  />
                  <ReferenceLine
                    y={-meta.band_pct}
                    stroke="#059669"
                    strokeDasharray="3 3"
                    label={{ value: `-${meta.band_pct}%`, fill: '#059669', fontSize: 9, position: 'right' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="deviation_pct"
                    stroke="#ea580c"
                    strokeWidth={1.8}
                    dot={{ r: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 3: Cumulative Deviation (CUSUM) */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-bold text-neutral-900 dark:text-neutral-100">
                Cumulative Deviation (CUSUM GJ since Baseline End)
              </span>
              <span className="text-[11px] text-neutral-500">Upward slope indicates sustained excess</span>
            </div>
            <div className="h-36 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis
                    dataKey="period"
                    tickFormatter={(val) => formatMonthLabel(val)}
                    interval="preserveStartEnd"
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    tickFormatter={(val) => formatNumber(val, 0)}
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0].payload;
                      return (
                        <div className="bg-neutral-900 text-white p-2 rounded-lg text-xs shadow-md">
                          <div className="font-semibold">{formatMonthLabel(pt.period)}</div>
                          <div>CUSUM: <strong>{formatSignedEnergy(pt.cusum_gj, meta.unit_energy)}</strong></div>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine y={0} stroke="#71717a" />
                  <Line
                    type="monotone"
                    dataKey="cusum_gj"
                    stroke="#8b5cf6"
                    strokeWidth={1.8}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Baseline Model Quality Card */}
        <div className="bg-neutral-50 dark:bg-neutral-800/60 rounded-xl p-4 border border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider">
                ISO 50001 Baseline EnPI Model Statistics
              </h4>
            </div>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border ${
              model.quality === 'good'
                ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300'
            }`}>
              {model.quality === 'good' ? 'Model Valid (Good Fit)' : 'Review Model Quality'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-2.5 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
              <div className="text-neutral-500 text-[11px]">R² Goodness-of-Fit</div>
              <div className="text-base font-bold font-mono text-neutral-900 dark:text-neutral-100 mt-0.5">
                {model.r2.toFixed(3)}
              </div>
              <div className="text-[10px] text-neutral-400">n = {model.n_points} months</div>
            </div>

            <div className="p-2.5 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
              <div className="text-neutral-500 text-[11px]">CV(RMSE) Error</div>
              <div className="text-base font-bold font-mono text-neutral-900 dark:text-neutral-100 mt-0.5">
                {model.cv_rmse_pct.toFixed(2)}%
              </div>
              <div className="text-[10px] text-neutral-400">Target &lt; 5%</div>
            </div>

            <div className="p-2.5 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
              <div className="text-neutral-500 text-[11px]">Base Load Share</div>
              <div className="text-base font-bold font-mono text-neutral-900 dark:text-neutral-100 mt-0.5">
                {model.base_load_share_pct.toFixed(0)}%
              </div>
              <div className="text-[10px] text-neutral-400">
                {formatNumber(model.base_load_gj_per_year)} GJ/yr
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
              <div className="text-neutral-500 text-[11px]">Baseline SEC</div>
              <div className="text-base font-bold font-mono text-neutral-900 dark:text-neutral-100 mt-0.5">
                {model.baseline_sec_gj_per_ton.toFixed(2)} <span className="text-[11px] font-normal">GJ/t</span>
              </div>
              <div className="text-[10px] text-neutral-400">
                Vars: {model.variables.join(', ') || 'constant'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Question 4: What should we do? - Diagnosis & Corrective Actions */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
              Q4
            </span>
            <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
              What Should We Do? Site Diagnosis & Action Plan
            </h3>
          </div>
          <button
            onClick={copyActionPlan}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-300 dark:border-neutral-700 transition-colors no-print"
          >
            {copiedActionPlan ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy as Action Plan</span>
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Diagnosis & Hypotheses */}
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40">
              <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider mb-2">
                {diagnosis.label}
              </h4>
              <p className="text-xs text-neutral-500 mb-3 italic">
                Engineering hypotheses to verify on site prior to capital or setpoint decisions.
              </p>
              <ul className="space-y-2 text-xs text-neutral-700 dark:text-neutral-300">
                {diagnosis.likely_causes.length > 0 ? (
                  diagnosis.likely_causes.map((cause, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-neutral-400 mt-0.5">•</span>
                      <span>{cause}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-neutral-400">Within the deviation band. Continue monitoring.</li>
                )}
              </ul>
              {diagnosis.note && (
                <div className="mt-3 p-2.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 text-xs border border-blue-200 dark:border-blue-900">
                  {diagnosis.note}
                </div>
              )}
            </div>

            {/* Audit Checklist (Interactive) */}
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40">
              <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider mb-1">
                Verify First (Audit Checklist)
              </h4>
              <p className="text-xs text-neutral-500 mb-3">
                Click checks as field investigations are completed (state preserved in browser).
              </p>
              <div className="space-y-2">
                {diagnosis.verify_first.length > 0 ? (
                  diagnosis.verify_first.map((check, i) => {
                    const isDone = !!checkedItems[check];
                    return (
                      <div
                        key={i}
                        onClick={() => toggleCheck(check)}
                        className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer text-xs border transition-colors ${
                          isDone
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                            : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50'
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">
                          {isDone ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Square className="w-4 h-4 text-neutral-400" />
                          )}
                        </div>
                        <span className={isDone ? 'line-through opacity-80' : ''}>{check}</span>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-neutral-400">No verification steps pending.</p>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Corrective Actions & Recoverable Savings */}
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider">
                  Corrective Actions
                </h4>
                <span className={`text-xs px-2 py-0.5 rounded-md font-semibold border ${priorityMeta.badgeClass}`}>
                  {priorityMeta.label}
                </span>
              </div>

              <div className="space-y-2 mb-3">
                {corrective_actions.items.length > 0 ? (
                  corrective_actions.items.map((act, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-neutral-800 dark:text-neutral-200">
                      <span className="font-bold text-blue-600 dark:text-blue-400 shrink-0">{idx + 1}.</span>
                      <span>{act}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-neutral-400">No corrective action required for this SEU.</p>
                )}
              </div>

              {corrective_actions.target && (
                <div className="text-xs p-2.5 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                  <strong className="text-neutral-900 dark:text-neutral-100">Target:</strong> {corrective_actions.target}
                </div>
              )}
            </div>

            {/* Savings & Recoverable Impact Card */}
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40">
              <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider mb-2">
                Annualized Recoverable Value
              </h4>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                  <div className="text-[11px] text-neutral-500">Energy</div>
                  <div className="text-sm font-bold font-mono text-neutral-900 dark:text-neutral-100 mt-1">
                    {formatNumber(savings.annualized_excess_gj)} <span className="text-[10px] font-normal">{meta.unit_energy}/yr</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                  <div className="text-[11px] text-neutral-500">Cost</div>
                  <div className="text-sm font-bold font-mono text-neutral-900 dark:text-neutral-100 mt-1">
                    {formatCurrencyIdr(savings.annualized_excess_cost_idr)}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                  <div className="text-[11px] text-neutral-500">CO₂ Avoided</div>
                  <div className="text-sm font-bold font-mono text-neutral-900 dark:text-neutral-100 mt-1">
                    {formatNumber(savings.annualized_excess_co2_t)} <span className="text-[10px] font-normal">t/yr</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Continual Improvement Opportunities (ISO 50001 Cl. 10.2) */}
        <div>
          <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            Continual Improvement Opportunities (ISO 50001 Clause 10.2)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {seu.improvements && seu.improvements.length > 0 ? (
              seu.improvements.map((imp, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      {imp.title}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 uppercase">
                      {imp.trigger.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400">
                    {imp.basis}
                  </p>
                  {imp.potential_gj_per_year && (
                    <div className="text-xs font-mono font-medium text-emerald-600 dark:text-emerald-400 pt-1">
                      Potential: ≈ {formatNumber(imp.potential_gj_per_year)} GJ/yr
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-xs text-neutral-400 col-span-2">
                No specific capital improvement opportunity triggered for this SEU.
              </p>
            )}
          </div>
          {savings.stretch_gj_per_year > 0 && (
            <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400 italic">
              <strong>Best-Demonstrated Performance (BDP) Stretch:</strong> An additional {formatNumber(savings.stretch_gj_per_year)} GJ/yr saving potential exists if operating consistently at the top 10th percentile efficiency.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
