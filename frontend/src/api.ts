export type Scalar = string | number | null;

export type Supplier = Record<string, Scalar> & {
  supplierID: string;
  'Supplier Name': string;
  Total_Risk_Index: number | null;
  Total_Risk_Index_Level: string;
};

export type SupplierPage = { items: Supplier[]; total: number; offset: number; limit: number };
export type Metadata = {
  row_count: number;
  columns: string[];
  risk_fields: string[];
  numeric_fields: string[];
  risk_levels: string[];
  criteria_markdown: string;
  score_direction: string;
  total_risk_note: string;
};
export type RiskCategory = { field: string; value: number };
export type Comparison = {
  suppliers: Supplier[];
  risk_fields: string[];
  rank_by: string;
  lowest_risk_supplier_ids: string[];
  highest_risk_categories: Record<string, RiskCategory[]>;
  notes: string[];
};

export type Status = {
  chat_mode: 'live' | 'data_only' | 'configuration_required';
  model_configured: boolean;
  search_configured: boolean;
  research_ready: boolean;
  model: string | null;
};

export type Evidence = { supplier_id: string; field: string; value: Scalar };
export type ToolActivity = { name: string; arguments: Record<string, unknown>; status: 'completed' | 'failed' };
export type ChatResponse = {
  answer: string;
  evidence: Evidence[];
  suggested_supplier_ids: string[];
  warnings: string[];
  tool_calls: ToolActivity[];
  mode: 'live' | 'data_only';
  model: string | null;
};

export type Severity = 'low' | 'medium' | 'high' | 'critical' | 'unknown';
export type Company = {
  name: string;
  website: string | null;
  country: string | null;
  identity_confidence: 'high' | 'medium' | 'low';
  identity_source_ids: string[];
};
export type Finding = { category: string; severity: Severity; claim: string; source_ids: string[] };
export type Source = {
  id: string;
  url: string;
  title: string;
  published_at: string | null;
  retrieved_at: string;
  excerpt: string;
  content_type: 'search_snippet' | 'page_content';
};
export type ResearchStep = { name: string; status: 'completed' | 'failed' | 'skipped'; detail: string };
export type ResearchResponse = {
  status: 'complete' | 'partial' | 'needs_clarification';
  company: Company;
  plan: string[];
  summary: string;
  findings: Finding[];
  sources: Source[];
  limitations: string[];
  researched_at: string;
  model: string;
  steps: ResearchStep[];
  clarification_question: string | null;
};
export type ResearchRequest = { company_name: string; country?: string; website?: string };

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
  /** The route is in the agreed contract but the backend has not shipped it yet. */
  get notImplemented() {
    return this.status === 501 || this.status === 404 || this.status === 405;
  }
}

function readableDetail(detail: unknown, status: number): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    // FastAPI validation errors: [{loc, msg, ...}]
    const messages = detail
      .map(item => (item && typeof item === 'object' && 'msg' in item ? String((item as { msg: unknown }).msg) : ''))
      .filter(Boolean)
      .map(message => message.replace(/^Value error, /, ''));
    if (messages.length) return messages.join(' ');
  }
  return `Request failed (HTTP ${status})`;
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, options);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('Cannot reach the server. Check your connection and that the API is running.', 0);
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(readableDetail(error.detail, response.status), response.status);
  }
  return response.json();
}

const postJson = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  meta: () => request<Metadata>('/meta'),
  status: () => request<Status>('/status'),
  suppliers: (params: URLSearchParams, signal?: AbortSignal) => request<SupplierPage>(`/suppliers?${params}`, { signal }),
  supplier: (id: string) => request<Supplier>(`/suppliers/${encodeURIComponent(id)}`),
  compare: (supplier_ids: string[], rank_by = 'Total_Risk_Index') => request<Comparison>('/compare', postJson({ supplier_ids, rank_by })),
  chat: (message: string, supplier_ids: string[]) => request<ChatResponse>('/chat', postJson({ message, supplier_ids })),
  research: (body: ResearchRequest) => request<ResearchResponse>('/research', postJson(body)),
};
