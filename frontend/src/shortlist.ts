import { useEffect, useMemo, useState } from 'react';
import type { Supplier } from './api';

export const MAX_SHORTLIST = 20;
export type ShortlistItem = { id: string; name: string; total: number | null; level: string | null };
const storageKey = (datasetKey: string) => `sri.shortlist.v2:${datasetKey}`;

function load(datasetKey: string): ShortlistItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(datasetKey)) ?? '[]');
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

/**
 * Selected suppliers, keyed by supplierID and kept across searches, filters, pages and reloads.
 * Each dataset has its own shortlist so IDs from different files never mix.
 */
export function useShortlist(datasetKey: string, validIds?: Set<string>) {
  const [state, setState] = useState(() => ({ key: datasetKey, items: load(datasetKey) }));
  const items = state.key === datasetKey ? state.items : load(datasetKey);
  const setItems = (update: (current: ShortlistItem[]) => ShortlistItem[]) =>
    setState(current => ({ key: datasetKey, items: update(current.key === datasetKey ? current.items : load(datasetKey)) }));

  useEffect(() => {
    try { localStorage.setItem(storageKey(state.key), JSON.stringify(state.items)); } catch { /* storage unavailable */ }
  }, [state]);

  // Drop saved IDs that the loaded dataset does not contain.
  useEffect(() => {
    if (validIds && items.some(item => !validIds.has(item.id))) setItems(current => current.filter(item => validIds.has(item.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validIds, datasetKey]);

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
      clear: () => setItems(() => []),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, datasetKey]);
}

export type Shortlist = ReturnType<typeof useShortlist>;
