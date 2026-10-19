export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatMonthLabel(period?: string): string {
  if (!period) return '';
  const parts = period.split('-');
  if (parts.length < 2) return period;
  const monthIdx = parseInt(parts[1], 10) - 1;
  const year2 = parts[0].slice(2);
  const name = MONTH_NAMES[monthIdx] || parts[1];
  return `${name} '${year2}`;
}

export function formatNumber(val?: number | null, decimals = 0): string {
  if (val == null || isNaN(val)) return '–';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(val);
}

export function formatEnergy(val?: number | null, unit = 'GJ'): string {
  if (val == null || isNaN(val)) return '–';
  return `${formatNumber(val, 0)} ${unit}`;
}

export function formatSignedEnergy(val?: number | null, unit = 'GJ'): string {
  if (val == null || isNaN(val)) return '–';
  const prefix = val > 0 ? '+' : val < 0 ? '−' : '';
  return `${prefix}${formatNumber(Math.abs(val), 0)} ${unit}`;
}

export function formatPercent(val?: number | null, decimals = 1): string {
  if (val == null || isNaN(val)) return '–';
  const prefix = val > 0 ? '+' : val < 0 ? '−' : '';
  return `${prefix}${Math.abs(val).toFixed(decimals)}%`;
}

export function formatCurrencyIdr(val?: number | null): string {
  if (val == null || isNaN(val)) return '–';
  const sign = val < 0 ? '−' : '';
  const abs = Math.abs(val);
  if (abs >= 1e9) {
    return `${sign}IDR ${(abs / 1e9).toFixed(2)} bn`;
  }
  if (abs >= 1e6) {
    return `${sign}IDR ${(abs / 1e6).toFixed(0)} m`;
  }
  return `${sign}IDR ${formatNumber(abs, 0)}`;
}

export interface StatusMeta {
  label: string;
  icon: string;
  rank: number;
  badgeClass: string;
  textClass: string;
  borderClass: string;
  colorHex: string;
}

export const STATUS_MAP: Record<string, StatusMeta> = {
  critical: {
    label: 'Critical',
    icon: '✕',
    rank: 4,
    badgeClass: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border-red-300 dark:border-red-800',
    textClass: 'text-red-600 dark:text-red-400',
    borderClass: 'border-l-red-500',
    colorHex: '#dc2626',
  },
  high: {
    label: 'High',
    icon: '▲',
    rank: 3,
    badgeClass: 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border-orange-300 dark:border-orange-800',
    textClass: 'text-orange-600 dark:text-orange-400',
    borderClass: 'border-l-orange-500',
    colorHex: '#ea580c',
  },
  watch: {
    label: 'Watch',
    icon: '◆',
    rank: 2,
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800',
    textClass: 'text-amber-600 dark:text-amber-400',
    borderClass: 'border-l-amber-500',
    colorHex: '#d97706',
  },
  improved: {
    label: 'Improved',
    icon: '✓',
    rank: 1,
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
    textClass: 'text-emerald-600 dark:text-emerald-400',
    borderClass: 'border-l-emerald-500',
    colorHex: '#059669',
  },
  normal: {
    label: 'Normal',
    icon: '●',
    rank: 0,
    badgeClass: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 border-neutral-300 dark:border-neutral-700',
    textClass: 'text-neutral-500 dark:text-neutral-400',
    borderClass: 'border-l-neutral-400',
    colorHex: '#6b7280',
  },
};

export const PRIORITY_MAP: Record<string, { label: string; badgeClass: string; rank: number }> = {
  immediate: { label: 'Immediate', badgeClass: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300 border-red-300', rank: 4 },
  short_term: { label: 'Short-term', badgeClass: 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300 border-orange-300', rank: 3 },
  planned: { label: 'Planned', badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border-blue-300', rank: 2 },
  monitor: { label: 'Monitor', badgeClass: 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 border-neutral-300', rank: 1 },
  none: { label: 'None', badgeClass: 'bg-neutral-50 text-neutral-500 dark:bg-neutral-900 dark:text-neutral-500 border-neutral-200', rank: 0 },
};

export function getStatusMeta(status?: string): StatusMeta {
  if (!status || !STATUS_MAP[status]) {
    return STATUS_MAP.normal;
  }
  return STATUS_MAP[status];
}

export function escapeHtml(str: string): string {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c] || c));
}
