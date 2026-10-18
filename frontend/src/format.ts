import type { Scalar, Supplier } from './api';

/** "Financial_Health_Score" → "Financial health"; acronyms such as ESG keep their capitals. */
export function fieldLabel(field: string): string {
  if (field === 'Total_Risk_Index') return 'Total Risk Index (as supplied)';
  const words = field.replace(/_Score$/i, '').replace(/_Risk$/, '').replace(/_/g, ' ').trim().split(/\s+/);
  return words.map((word, index) => (/^[A-Z]{2,}$/.test(word) ? word : index === 0 ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word.toLowerCase())).join(' ');
}

export function formatValue(value: Scalar | undefined, field?: string): string {
  if (value === null || value === undefined || value === '') return 'Unknown';
  if (typeof value !== 'number') return String(value);
  if (field === 'Purchase Order Volume (EUR)') {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
  }
  if (field && PERCENT_FIELDS.includes(field)) return `${value.toFixed(1)}%`;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** Server-supplied label for a score, e.g. Financial_Health_Score → Financial_Health_Score_Level. */
export function levelOf(supplier: Supplier, field: string): string | null {
  const level = supplier[`${field}_Level`];
  return typeof level === 'string' && level ? level : null;
}

export const LEVEL_ORDER = ['Low', 'Medium', 'High', 'Critical'];

// Colour only encodes the dataset's own level label; text always carries the label too.
const LEVEL_STYLES: Record<string, { cell: string; badge: string }> = {
  Low: { cell: 'bg-emerald-100 text-gray-900', badge: 'bg-emerald-100 text-gray-900 ring-emerald-300' },
  Medium: { cell: 'bg-amber-100 text-gray-900', badge: 'bg-amber-100 text-gray-900 ring-amber-300' },
  High: { cell: 'bg-orange-200 text-gray-900', badge: 'bg-orange-200 text-gray-900 ring-orange-300' },
  Critical: { cell: 'bg-red-300 text-gray-900', badge: 'bg-red-300 text-gray-900 ring-red-300' },
};
const UNKNOWN_STYLE = { cell: 'bg-gray-50 text-gray-500', badge: 'bg-gray-50 text-gray-700 ring-gray-300' };

export const levelStyle = (level: string | null) => (level && LEVEL_STYLES[level]) || UNKNOWN_STYLE;

/** Field → definition, from `- **Field:** description` lines in the supplied criteria Markdown. */
export function parseCriteria(markdown: string): Record<string, string> {
  const definitions: Record<string, string> = {};
  for (const match of markdown.matchAll(/^\s*-\s+\*\*(.+?):\*\*\s*(.+)$/gm)) {
    definitions[match[1].trim()] = match[2].trim();
  }
  return definitions;
}

export const PERCENT_FIELDS = ['Order Change Rate', 'Supplier Delivery Rating', 'Order Confirmation Rate'];

/** Operational indicators with their own direction (from risk_criteria_description.md). */
export const OPERATIONAL_FIELDS: { field: string; hint: string }[] = [
  { field: 'Supplier Delivery Rating', hint: 'Timeliness & accuracy · higher is better' },
  { field: 'Order Confirmation Rate', hint: 'Confirmed in time · higher is better' },
  { field: 'Order Change Rate', hint: 'Changes to existing orders · lower is steadier' },
  { field: 'Purchase Order Volume (EUR)', hint: 'Financial exposure' },
  { field: 'Sourcing Risk Level', hint: 'Difficulty of replacing the supplier' },
  { field: 'Supply Chain Complexity', hint: 'Logistics routes, sub-tiers' },
];
