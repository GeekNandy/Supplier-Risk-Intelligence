export type Supplier = Record<string, string | number | null> & {
  supplierID: string;
  'Supplier Name': string;
  Total_Risk_Index: number | null;
  Total_Risk_Index_Level: string;
};

export type SupplierPage = { items: Supplier[]; total: number; offset: number; limit: number };
export type Metadata = { row_count: number; risk_fields: string[]; numeric_fields: string[]; risk_levels: string[]; criteria_markdown: string; score_direction: string; total_risk_note: string };
export type Comparison = { suppliers: Supplier[]; risk_fields: string[]; rank_by: string; lowest_risk_supplier_ids: string[]; highest_risk_categories: Record<string, { field: string; value: number }[]>; notes: string[] };

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(typeof error.detail === 'string' ? error.detail : `Request failed: ${response.status}`);
  }
  return response.json();
}

export const api = {
  meta: () => request<Metadata>('/meta'),
  suppliers: (params: URLSearchParams) => request<SupplierPage>(`/suppliers?${params}`),
  compare: (supplier_ids: string[], rank_by = 'Total_Risk_Index') => request<Comparison>('/compare', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ supplier_ids, rank_by }),
  }),
};

