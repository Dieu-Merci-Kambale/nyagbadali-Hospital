import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { PAGE_SIZE, sortByCreationDesc, usePagination } from './usePagination';

/** n éléments créés à une minute d'intervalle, le premier étant le plus ancien */
const elements = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, created_at: new Date(Date.UTC(2026, 9, 13, 8, i)).toISOString() }));

describe('sortByCreationDesc', () => {
  it('place les éléments les plus récents en premier', () => {
    expect(sortByCreationDesc(elements(3)).map((e) => e.id)).toEqual([3, 2, 1]);
  });

  it('utilise la colonne timestamp du journal d’activité', () => {
    const logs = [{ id: 'a', timestamp: '2026-10-01T10:00:00Z' }, { id: 'b', timestamp: '2026-10-02T10:00:00Z' }];
    expect(sortByCreationDesc(logs).map((l) => l.id)).toEqual(['b', 'a']);
  });

  it('met les éléments sans date à la fin et garde l’ordre d’origine à égalité', () => {
    const items = [
      { id: 'sans-date-1' },
      { id: 'ancien', created_at: '2026-01-01T00:00:00Z' },
      { id: 'egal-1', created_at: '2026-05-01T00:00:00Z' },
      { id: 'egal-2', created_at: '2026-05-01T00:00:00Z' },
      { id: 'sans-date-2', created_at: null },
    ];
    expect(sortByCreationDesc(items).map((e) => e.id)).toEqual(['egal-1', 'egal-2', 'ancien', 'sans-date-1', 'sans-date-2']);
  });

  it('ne modifie pas la liste reçue', () => {
    const items = elements(3);
    sortByCreationDesc(items);
    expect(items.map((e) => e.id)).toEqual([1, 2, 3]);
  });
});

describe('usePagination', () => {
  it('affiche au maximum 10 lignes par page', () => {
    const { result } = renderHook(() => usePagination(elements(25)));
    expect(PAGE_SIZE).toBe(10);
    expect(result.current.total).toBe(25);
    expect(result.current.pageCount).toBe(3);
    expect(result.current.pageItems).toHaveLength(10);
    expect(result.current.pageItems[0].id).toBe(25);
  });

  it('passe aux pages suivantes, la dernière étant incomplète', () => {
    const { result } = renderHook(() => usePagination(elements(25)));
    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);
    expect(result.current.offset).toBe(20);
    expect(result.current.pageItems.map((e) => e.id)).toEqual([5, 4, 3, 2, 1]);
  });

  it('borne la page demandée entre 1 et le nombre de pages', () => {
    const { result } = renderHook(() => usePagination(elements(25)));
    act(() => result.current.setPage(99));
    expect(result.current.page).toBe(3);
    act(() => result.current.setPage(-2));
    expect(result.current.page).toBe(1);
  });

  it('revient à la première page quand la recherche ou le filtre change', () => {
    const { result, rerender } = renderHook(({ filtre }) => usePagination(elements(25), filtre), { initialProps: { filtre: 'tous' } });
    act(() => result.current.setPage(2));
    expect(result.current.page).toBe(2);
    rerender({ filtre: 'payée' });
    expect(result.current.page).toBe(1);
  });

  it('se replace sur la dernière page si la liste raccourcit', () => {
    const { result, rerender } = renderHook(({ n }) => usePagination(elements(n)), { initialProps: { n: 25 } });
    act(() => result.current.setPage(3));
    rerender({ n: 12 });
    expect(result.current.page).toBe(2);
    expect(result.current.pageItems).toHaveLength(2);
  });

  it('gère une liste vide', () => {
    const { result } = renderHook(() => usePagination([]));
    expect(result.current.total).toBe(0);
    expect(result.current.pageCount).toBe(1);
    expect(result.current.pageItems).toEqual([]);
  });
});
