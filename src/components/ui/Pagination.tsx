'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PAGE_SIZE } from '@/lib/usePagination';

type Props = {
  page: number;
  pageCount: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Nom des éléments au pluriel, ex. « patients » */
  label?: string;
};

/** Barre de pagination commune à toutes les listes (10 lignes par page). */
export default function Pagination({ page, pageCount, total, onPageChange, label = 'éléments' }: Props) {
  if (total === 0) return null;
  const debut = (page - 1) * PAGE_SIZE + 1;
  const fin = Math.min(page * PAGE_SIZE, total);

  return (
    <div style={{
      padding: '14px 22px',
      borderTop: '1px solid var(--neutral-100)',
      display: 'flex',
      flexWrap: 'wrap',
      gap: 10,
      alignItems: 'center',
      justifyContent: 'space-between',
      fontSize: 13,
      color: 'var(--neutral-500)',
    }}>
      <span>Affichage de {debut} à {fin} sur {total} {label}</span>
      {pageCount > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft size={14} /> Précédent
          </button>
          {Array.from({ length: pageCount }, (_, i) => i + 1)
            .filter((n) => n === 1 || n === pageCount || Math.abs(n - page) <= 1)
            .map((n, i, arr) => (
              <span key={n} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {i > 0 && n - arr[i - 1] > 1 && <span>…</span>}
                <button type="button" className={`btn btn-sm ${n === page ? 'btn-primary' : 'btn-outline'}`} onClick={() => onPageChange(n)}>{n}</button>
              </span>
            ))}
          <button type="button" className="btn btn-outline btn-sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
            Suivant <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
