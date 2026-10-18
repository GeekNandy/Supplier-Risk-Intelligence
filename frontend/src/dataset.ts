import Papa from 'papaparse';
import type { Comparison, Scalar, Supplier } from './api';
import { LEVEL_ORDER } from './format';

/** Which source columns play which role. Only `id` is required. Nothing is ever derived. */
export type Mapping = {
  id: string;
  name?: string;
  country?: string;
  category?: string;
  level?: string;
  total?: string;
  scores: string[];
};

export type Dataset = {
  key: string;
  kind: 'demo' | 'upload';
  label: string;
  rows: Supplier[];
  columns: string[];
  mapping: Mapping;
  hasTotal: boolean;
  hasLevel: boolean;
  /** Sub-score columns, as supplied. */
  scores: string[];
  /** Total (if mapped) followed by sub-scores — the fields a buyer can rank by. */
  riskFields: string[];
  levels: string[];
  groupFields: string[];
  medians: Record<string, number | null>;
  /** Sub-scores with values outside 0–100, i.e. not on the shared risk scale. */
  offScale: string[];
};

export type RawTable = { fileName: string; columns: string[]; rows: Record<string, string>[]; skippedEmpty: number };

export type Validation = {
  errors: string[];
  warnings: string[];
  rowCount: number;
  duplicateIds: string[];
  nonNumeric: { field: string; count: number; examples: string[] }[];
};

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const DEMO_MAPPING: Mapping = {
  id: 'supplierID', name: 'Supplier Name', level: 'Total_Risk_Index_Level', total: 'Total_Risk_Index', scores: [],
};

export function parseNumber(value: string | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

const isBlank = (value: string | undefined) => value === undefined || value.trim() === '';

export function parseCsv(text: string, fileName: string): RawTable {
  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: header => header.trim() });
  const columns = (result.meta.fields ?? []).filter(Boolean);
  const rows = result.data.filter(row => columns.some(column => !isBlank(row[column])));
  return { fileName, columns, rows, skippedEmpty: result.data.length - rows.length };
}

/** A column is numeric when at least 80% of its non-empty values parse as numbers. */
export function numericColumns(table: RawTable): string[] {
  return table.columns.filter(column => {
    const values = table.rows.map(row => row[column]).filter(value => !isBlank(value));
    if (!values.length) return false;
    return values.filter(value => parseNumber(value) !== null).length / values.length >= 0.8;
  });
}

const find = (columns: string[], ...patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = columns.find(column => pattern.test(column));
    if (match) return match;
  }
  return undefined;
};

/** Best-guess mapping by column name; the buyer confirms it before anything is loaded. */
export function autoMap(table: RawTable): Mapping {
  const { columns } = table;
  const numeric = numericColumns(table);
  const id = find(columns, /^supplier_?id$/i, /^supplier[\s_-]?id$/i, /^id$/i, /id$/i) ?? columns[0] ?? '';
  const total = find(numeric, /^total_risk_index$/i, /total.*risk/i, /overall.*(risk|score)/i);
  const level = find(columns.filter(column => !numeric.includes(column)), /^total_risk_index_level$/i, /^risk[\s_-]?level$/i, /overall.*level/i);
  const scores = numeric.filter(column => column !== total && column !== id && /score/i.test(column));
  return {
    id,
    name: find(columns, /^supplier[\s_-]?name$/i, /name/i),
    country: find(columns, /country/i),
    category: find(columns, /category/i, /commodity/i, /segment/i),
    level,
    total,
    scores: scores.length ? scores : numeric.filter(column => column !== total && column !== id),
  };
}

export function validate(table: RawTable, mapping: Mapping): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!mapping.id || !table.columns.includes(mapping.id)) errors.push('Choose the column that holds the supplier ID. It is required.');
  if (!mapping.scores.length) warnings.push('No sub-score columns selected: Compare and the radar chart will have nothing to show.');
  if (!mapping.total) warnings.push('No Total Risk Index column: totals, the Top 10 table and ranking by total are hidden. They are never calculated.');
  if (!mapping.level) warnings.push('No risk-level column: risk-level filters and colours are hidden. Levels are never derived from scores.');
  if (table.skippedEmpty) warnings.push(`${table.skippedEmpty} empty row${table.skippedEmpty === 1 ? '' : 's'} skipped.`);

  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  let missingIds = 0;
  if (mapping.id) {
    for (const row of table.rows) {
      const id = (row[mapping.id] ?? '').trim();
      if (!id) { missingIds += 1; continue; }
      if (seen.has(id)) duplicateIds.push(id);
      seen.add(id);
    }
  }
  if (missingIds) warnings.push(`${missingIds} row${missingIds === 1 ? '' : 's'} without a supplier ID will be skipped.`);
  if (duplicateIds.length) warnings.push(`${duplicateIds.length} duplicate supplier ID${duplicateIds.length === 1 ? '' : 's'} (e.g. ${duplicateIds.slice(0, 3).join(', ')}). Only the first row of each is kept.`);

  const nonNumeric = [mapping.total, ...mapping.scores].filter((field): field is string => !!field).flatMap(field => {
    const bad = table.rows.map(row => row[field]).filter(value => !isBlank(value) && parseNumber(value) === null);
    return bad.length ? [{ field, count: bad.length, examples: [...new Set(bad)].slice(0, 3) }] : [];
  });
  for (const item of nonNumeric) {
    warnings.push(`${item.field}: ${item.count} non-numeric value${item.count === 1 ? '' : 's'} (${item.examples.map(value => `"${value}"`).join(', ')}) will show as Unknown.`);
  }
  return { errors, warnings, rowCount: table.rows.length, duplicateIds, nonNumeric };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Turn a parsed table + confirmed mapping into the dataset every view reads. Values are kept as supplied. */
export function buildDataset(table: RawTable, mapping: Mapping, kind: 'demo' | 'upload'): Dataset {
  const numericFields = new Set([mapping.total, ...mapping.scores].filter(Boolean) as string[]);
  const allNumeric = new Set(numericColumns(table));
  const seen = new Set<string>();
  const rows: Supplier[] = [];
  for (const raw of table.rows) {
    const id = (raw[mapping.id] ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const row: Record<string, Scalar> = {};
    for (const column of table.columns) {
      const value = raw[column];
      if (numericFields.has(column) || allNumeric.has(column)) row[column] = parseNumber(value);
      else row[column] = isBlank(value) ? null : value.trim();
    }
    row.supplierID = id;
    row['Supplier Name'] = mapping.name ? (row[mapping.name] ?? '') : '';
    row.Total_Risk_Index = mapping.total ? (row[mapping.total] as number | null) : null;
    row.Total_Risk_Index_Level = mapping.level ? ((row[mapping.level] as string | null) ?? '') : '';
    rows.push(row as Supplier);
  }

  const levelValues = mapping.level ? [...new Set(rows.map(row => row.Total_Risk_Index_Level).filter(Boolean))] : [];
  const levels = levelValues.sort((a, b) => {
    const left = LEVEL_ORDER.indexOf(a);
    const right = LEVEL_ORDER.indexOf(b);
    return (left < 0 ? 99 : left) - (right < 0 ? 99 : right) || a.localeCompare(b);
  });

  const reserved = new Set([mapping.id, mapping.name, mapping.level, mapping.country, mapping.category].filter(Boolean));
  const otherGroups = table.columns.filter(column => {
    if (reserved.has(column) || allNumeric.has(column) || /_level$/i.test(column)) return false;
    const distinct = new Set(rows.map(row => row[column]).filter(value => value !== null));
    return distinct.size >= 2 && distinct.size <= 30;
  });
  const groupFields = [mapping.country, mapping.category, ...otherGroups].filter((field): field is string => !!field);

  const medians: Record<string, number | null> = {};
  const offScale: string[] = [];
  for (const field of mapping.scores) {
    const values = rows.map(row => row[field]).filter((value): value is number => typeof value === 'number');
    medians[field] = median(values);
    if (values.some(value => value < 0 || value > 100)) offScale.push(field);
  }

  return {
    key: kind === 'demo' ? 'demo' : `upload:${table.fileName}`,
    kind,
    label: kind === 'demo' ? 'Demo dataset (anonymized)' : table.fileName,
    rows,
    columns: table.columns,
    mapping,
    hasTotal: !!mapping.total,
    hasLevel: !!mapping.level,
    scores: mapping.scores,
    riskFields: mapping.total ? ['Total_Risk_Index', ...mapping.scores.filter(field => field !== 'Total_Risk_Index')] : mapping.scores,
    levels,
    groupFields,
    medians,
    offScale,
  };
}

export async function loadDemoDataset(): Promise<Dataset> {
  let response: Response;
  try {
    response = await fetch('/demo/supplier_risk_dataset.csv');
  } catch {
    throw new Error('Could not download the demo dataset. Check your connection and reload the page.');
  }
  if (!response.ok) throw new Error(`Could not download the demo dataset (HTTP ${response.status}). Reload the page, or load your own CSV.`);
  const table = parseCsv(await response.text(), 'supplier_risk_dataset.csv');
  const scores = table.columns.filter(column => column.endsWith('_Score'));
  return buildDataset(table, { ...DEMO_MAPPING, scores }, 'demo');
}

/** Same rules as the backend's compare: lowest known value wins (ties kept), top three observed sub-scores. */
export function compareRows(dataset: Dataset, ids: string[], rankBy: string): Comparison {
  const byId = new Map(dataset.rows.map(row => [row.supplierID, row]));
  const suppliers = ids.map(id => byId.get(id)).filter((row): row is Supplier => !!row);
  const scored = suppliers.filter(row => typeof row[rankBy] === 'number');
  const lowest = scored.length ? Math.min(...scored.map(row => row[rankBy] as number)) : null;
  return {
    suppliers,
    risk_fields: dataset.riskFields,
    rank_by: rankBy,
    lowest_risk_supplier_ids: scored.filter(row => row[rankBy] === lowest).map(row => row.supplierID),
    highest_risk_categories: Object.fromEntries(suppliers.map(row => [
      row.supplierID,
      dataset.scores
        .filter(field => typeof row[field] === 'number')
        .sort((a, b) => (row[b] as number) - (row[a] as number))
        .slice(0, 3)
        .map(field => ({ field, value: row[field] as number })),
    ])),
    notes: [
      'Lower values mean lower risk for all supplied risk scores, including Financial_Health_Score.',
      'Highest categories describe observed scores, not proven causes or weighted contributions to the Total Risk Index.',
      'Missing values remain Unknown and are excluded when finding the lowest score.',
    ],
  };
}

export function sortRows(rows: Supplier[], field: string, descending: boolean): Supplier[] {
  const present = rows.filter(row => typeof row[field] === 'number');
  const missing = rows.filter(row => typeof row[field] !== 'number');
  present.sort((a, b) => ((a[field] as number) - (b[field] as number)) * (descending ? -1 : 1) || a.supplierID.localeCompare(b.supplierID));
  return [...present, ...missing];
}

const csvCell = (value: Scalar | undefined) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function toCsv(columns: string[], rows: Record<string, Scalar>[]): string {
  return [columns.map(csvCell).join(','), ...rows.map(row => columns.map(column => csvCell(row[column])).join(','))].join('\n');
}

export function downloadText(fileName: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Header-only template matching the demo schema (no data rows). */
export function templateCsv(columns: string[]): string {
  return `${columns.map(csvCell).join(',')}\n`;
}

const MAPPING_KEY = 'sri.mapping.v1:';
export function savedMapping(table: RawTable): Mapping | null {
  try {
    const saved = JSON.parse(localStorage.getItem(MAPPING_KEY + table.fileName) ?? 'null');
    if (!saved || saved.signature !== table.columns.join('|')) return null;
    return saved.mapping as Mapping;
  } catch {
    return null;
  }
}
export function saveMapping(table: RawTable, mapping: Mapping) {
  try { localStorage.setItem(MAPPING_KEY + table.fileName, JSON.stringify({ signature: table.columns.join('|'), mapping })); } catch { /* storage unavailable */ }
}
