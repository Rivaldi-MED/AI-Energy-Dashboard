export interface Baseline {
  start: string;
  end: string;
}

export interface Meta {
  generated_at: string;
  report_month: string;
  window_months: number;
  baseline: Baseline;
  band_pct: number;
  unit_energy: string;
  currency: string;
  data_is_synthetic: boolean;
  tariff_idr_per_gj: Record<string, number>;
  emission_t_per_gj: Record<string, number>;
  tariff_note: string;
}

export interface CompanyTotals {
  actual_gj: number;
  expected_gj: number;
  deviation_gj: number;
  cost_impact_idr: number;
  co2_impact_t: number;
  deviation_pct: number;
}

export interface TopSeu {
  plant: string;
  plant_name: string;
  seu: string;
  seu_name: string;
  status: 'critical' | 'high' | 'watch' | 'improved' | 'normal';
  pattern: string;
  annualized_excess_gj: number;
  annualized_excess_cost_idr: number;
  annualized_excess_co2_t: number;
  priority: 'immediate' | 'short_term' | 'planned' | 'monitor' | 'none';
}

export interface Company {
  totals_last_12m: CompanyTotals;
  plant_ranking: string[];
  top_seus: TopSeu[];
  summary: string;
}

export interface WindowKpi {
  actual_gj: number;
  expected_gj: number;
  deviation_gj: number;
  deviation_pct: number;
  production_ton: number;
  sec_gj_per_ton: number;
  volume_gj: number;
  weather_gj: number;
  efficiency_gj: number;
  change_vs_baseline_gj: number;
  cost_impact_idr: number;
  co2_impact_t: number;
  baseline_sec_gj_per_ton?: number;
  sec_vs_baseline_pct?: number;
  n_months?: number;
  n_imputed?: number;
  n_estimated?: number;
}

export interface PlantParetoItem {
  seu: string;
  seu_name: string;
  energy_gj_12m: number;
  share_pct: number;
  cum_share_pct: number;
  significant: boolean;
  deviation_gj_12m: number;
  excess_gj_12m: number;
  share_of_excess_pct: number;
  contribution_to_plant_dev_pts: number;
  status: 'critical' | 'high' | 'watch' | 'improved' | 'normal';
}

export interface SeuPattern {
  type: 'drift' | 'step' | 'spike' | 'persistent_offset' | 'improving_trend' | 'within_band';
  confidence: 'clear' | 'tentative';
  direction?: number;
  since?: string | null;
  likely_change_month?: string | null;
  likely_change_pct?: number | null;
  above_band_since?: string | null;
  magnitude_pct?: number | null;
  slope_pct_per_month?: number | null;
  spike_months?: string[];
  projected_months_to_band?: number | null;
}

export interface SeuModel {
  variables: string[];
  intercept: number;
  coefs: Record<string, number>;
  p_values: Record<string, number>;
  r2: number;
  cv_rmse_pct: number;
  n_points: number;
  quality: string;
  baseline_sec_gj_per_ton: number;
  base_load_share_pct: number;
  base_load_gj_per_year: number;
  weather_gj_per_year_per_degC: number;
  baseline_ranges: Record<string, [number, number]>;
  months_outside_range_12m: number;
}

export interface SeuWhy {
  headline: string;
  pattern_text: string;
  decomposition_text: string;
  event_text?: string | null;
  activity_text?: string | null;
}

export interface SeuDiagnosis {
  label: string;
  likely_causes: string[];
  verify_first: string[];
  note?: string | null;
}

export interface SeuCorrectiveActions {
  priority: 'immediate' | 'short_term' | 'planned' | 'monitor' | 'none';
  items: string[];
  target?: string | null;
}

export interface Improvement {
  trigger: 'always' | 'high_baseload' | 'weather_sensitive' | 'bdp_gap';
  title: string;
  potential_gj_per_year?: number | null;
  basis: string;
}

export interface Savings {
  annualized_excess_gj: number;
  annualized_excess_cost_idr: number;
  annualized_excess_co2_t: number;
  achieved_saving_gj_12m: number;
  stretch_pct: number;
  stretch_gj_per_year: number;
}

export interface LoggedEvent {
  event_type: string;
  description: string;
  start: string;
  end: string;
}

export interface SeriesPoint {
  period: string;
  actual_gj: number;
  expected_gj: number;
  deviation_pct: number;
  cusum_gj: number;
  sec_gj_per_ton: number;
  production_ton: number;
  data_quality?: 'measured' | 'estimated' | 'imputed' | string;
  in_baseline: boolean;
  outside_baseline_range: boolean;
}

export interface SeuItem {
  seu: string;
  seu_name: string;
  seu_type: string;
  carrier: string;
  status: 'critical' | 'high' | 'watch' | 'improved' | 'normal';
  verdict: 'performance_loss' | 'early_warning' | 'activity_driven' | 'improvement' | 'resolved_spike' | 'normal';
  pattern: SeuPattern;
  model: SeuModel;
  windows: {
    report_month: WindowKpi;
    last_3m: WindowKpi;
    last_12m: WindowKpi;
  };
  why: SeuWhy;
  diagnosis: SeuDiagnosis;
  corrective_actions: SeuCorrectiveActions;
  improvements?: Improvement[];
  savings: Savings;
  events?: LoggedEvent[];
  series: SeriesPoint[];
}

export interface PlantItem {
  plant: string;
  plant_name: string;
  summary: string;
  activity_note?: string | null;
  annualized_excess_cost_idr?: number;
  n_seu_critical_high?: number;
  n_seu_watch?: number;
  kpis: {
    report_month: WindowKpi;
    last_3m: WindowKpi;
    last_12m: WindowKpi;
  };
  pareto: PlantParetoItem[];
  trend?: Array<{
    period: string;
    actual_gj: number;
    expected_gj: number;
    deviation_pct: number;
    cusum_gj: number;
    production_ton: number;
    sec_gj_per_ton: number;
    in_baseline: boolean;
  }>;
  seus: SeuItem[];
}

export interface DataQualityEntry {
  plant: string;
  seu: string;
  scope: string;
  issue: string;
  months: number;
  detail: string;
}

export interface MethodInfo {
  iso_mapping: Record<string, string>;
  definitions: Record<string, string>;
  limitations: string[];
}

export interface DashboardData {
  schema_version: string;
  meta: Meta;
  company: Company;
  plants: PlantItem[];
  data_quality: DataQualityEntry[];
  method: MethodInfo;
}

export type TimeWindow = 'report_month' | 'last_3m' | 'last_12m';
