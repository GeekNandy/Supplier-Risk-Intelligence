import { useEffect, useMemo, useState } from 'react';
import type { Supplier } from './api';

export const MAX_SHORTLIST = 20;
export type ShortlistItem = { id: string; name: string; total: number | null; level: string | null };
const STORAGE_KEY = 'sri.shortlist.v1';

function load(): ShortlistItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(item => typeof item?.id === 'string').slice(0, MAX_SHORTLIST) : [];
  } catch {
    return [];
  }
}

const toItem = (supplier: Supplier): ShortlistItem => ({
  id: supplier.supplierID,
  name: supplier['Supplier Name'],
  total: supplier.Total_Risk_Index,
  level: supplier.Total_Risk_Index_Level || null,
});

/** Selected suppliers, keyed by supplierID and kept across searches, filters, pages and reloads. */
export function useShortlist() {
  const [items, setItems] = useState<ShortlistItem[]>(load);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* storage unavailable */ }
  }, [items]);

  return useMemo(() => {
    const ids = items.map(item => item.id);
    const idSet = new Set(ids);
    const addMany = (suppliers: Supplier[]) => setItems(current => {
      const known = new Set(current.map(item => item.id));
      const additions = suppliers.filter(supplier => !known.has(supplier.supplierID)).map(toItem);
      return [...current, ...additions].slice(0, MAX_SHORTLIST);
    });
    return {
      items,
      ids,
      full: items.length >= MAX_SHORTLIST,
      has: (id: string) => idSet.has(id),
      toggle: (supplier: Supplier) => idSet.has(supplier.supplierID)
        ? setItems(current => current.filter(item => item.id !== supplier.supplierID))
        : addMany([supplier]),
      addMany,
      remove: (id: string) => setItems(current => current.filter(item => item.id !== id)),
      clear: () => setItems([]),
    };
  }, [items]);
}

export type Shortlist = ReturnType<typeof useShortlist>;
