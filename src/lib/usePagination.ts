'use client';

import { useMemo, useState } from 'react';

/** Nombre maximum de lignes affichées par page dans toutes les listes */
export const PAGE_SIZE = 10;

type Creatable = { created_at?: string | null; timestamp?: string | null };

function creationTime(item: Creatable): number {
  const t = Date.parse(item.created_at || item.timestamp || '');
  return Number.isNaN(t) ? -Infinity : t;
}

/** Trie du plus récent au plus ancien selon la date et l'heure de création (ordre d'origine conservé à égalité). */
export function sortByCreationDesc<T>(items: T[]): T[] {
  return items
    .map((item, i) => ({ item, i, t: creationTime(item as Creatable) }))
    .sort((a, b) => (b.t === a.t ? a.i - b.i : b.t > a.t ? 1 : -1))
    .map((x) => x.item);
}

/**
 * Pagination d'une liste (10 lignes par page), triée par date de création décroissante.
 * `resetKey` : tout changement (recherche, filtre, onglet…) ramène à la première page.
 */
export function usePagination<T>(items: T[], resetKey: unknown = '') {
  const key = JSON.stringify(resetKey ?? '');
  const [state, setState] = useState({ page: 1, key });
  const sorted = useMemo(() => sortByCreationDesc(items), [items]);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(state.key === key ? state.page : 1, pageCount);
  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return {
    page,
    pageCount,
    total,
    pageItems,
    /** Rang (à partir de 0) de la première ligne de la page dans la liste complète */
    offset: (page - 1) * PAGE_SIZE,
    setPage: (p: number) => setState({ page: Math.max(1, Math.min(p, pageCount)), key }),
  };
}
