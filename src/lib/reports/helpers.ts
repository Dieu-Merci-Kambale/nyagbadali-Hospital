import { supabase } from '@/lib/supabase';
import { explainDbError, titreSoignant } from '@/lib/format';
import type { ColType, Period, PeriodMode, ReportCell } from './types';

// =====================================================
// Périodes
// =====================================================

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Construit une période à partir du mode et de la valeur saisie :
 *  jour → 'AAAA-MM-JJ', mois → 'AAAA-MM', annee → 'AAAA', periode → 'AAAA-MM-JJ|AAAA-MM-JJ'
 */
export function buildPeriod(mode: PeriodMode, value: string): Period {
  if (mode === 'jour') {
    const [y, m, d] = value.split('-').map(Number);
    const from = new Date(y, m - 1, d, 0, 0, 0, 0);
    const to = new Date(y, m - 1, d, 23, 59, 59, 999);
    const label = `Journée du ${from.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`;
    return { mode, from, to, label, key: value };
  }
  if (mode === 'mois') {
    const [y, m] = value.split('-').map(Number);
    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 0, 23, 59, 59, 999);
    return { mode, from, to, label: `Mois ${/^[aeiouyéèh]/i.test(MOIS[m - 1]) ? "d'" : 'de '}${MOIS[m - 1]} ${y}`, key: value };
  }
  if (mode === 'annee') {
    const y = Number(value);
    return { mode, from: new Date(y, 0, 1), to: new Date(y, 11, 31, 23, 59, 59, 999), label: `Année ${y}`, key: value };
  }
  const [a, b] = value.split('|');
  const [y1, m1, d1] = (a || dayKey(new Date())).split('-').map(Number);
  const [y2, m2, d2] = (b || a || dayKey(new Date())).split('-').map(Number);
  const from = new Date(y1, m1 - 1, d1);
  const to = new Date(y2, m2 - 1, d2, 23, 59, 59, 999);
  return {
    mode,
    from,
    to,
    label: `Du ${from.toLocaleDateString('fr-FR')} au ${to.toLocaleDateString('fr-FR')}`,
    key: `${dayKey(from)}_${dayKey(to)}`,
  };
}

export function defaultPeriodValue(mode: PeriodMode): string {
  const now = new Date();
  if (mode === 'jour') return dayKey(now);
  if (mode === 'mois') return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  if (mode === 'annee') return String(now.getFullYear());
  const debut = new Date(now.getFullYear(), now.getMonth(), 1);
  return `${dayKey(debut)}|${dayKey(now)}`;
}

/** Tranches d'agrégation adaptées à la période : heures, jours ou mois. */
export function periodBuckets(period: Period): { key: string; label: string; match: (d: Date) => boolean }[] {
  const days = Math.round((period.to.getTime() - period.from.getTime()) / 86_400_000);
  if (period.mode === 'jour') {
    return Array.from({ length: 24 }, (_, h) => ({
      key: String(h),
      label: `${pad(h)} h – ${pad(h + 1 === 24 ? 0 : h + 1)} h`,
      match: (d: Date) => d.getHours() === h,
    }));
  }
  if (period.mode === 'annee' || days > 62) {
    const out = [];
    const cur = new Date(period.from.getFullYear(), period.from.getMonth(), 1);
    while (cur <= period.to) {
      const y = cur.getFullYear();
      const m = cur.getMonth();
      out.push({ key: `${y}-${m}`, label: `${MOIS[m].charAt(0).toUpperCase()}${MOIS[m].slice(1)} ${y}`, match: (d: Date) => d.getFullYear() === y && d.getMonth() === m });
      cur.setMonth(cur.getMonth() + 1);
    }
    return out;
  }
  const out = [];
  const cur = new Date(period.from);
  while (cur <= period.to) {
    const k = dayKey(cur);
    const label = cur.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
    out.push({ key: k, label, match: (d: Date) => dayKey(d) === k });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// =====================================================
// Lecture complète des données (au-delà de la limite de 1 000 lignes)
// =====================================================

type PageQuery = (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message?: string; code?: string } | null }>;

export async function fetchAll<T = any>(query: PageQuery, max = 20000): Promise<T[]> {
  const size = 1000;
  const rows: T[] = [];
  for (let start = 0; start < max; start += size) {
    const { data, error } = await query(start, start + size - 1);
    if (error) throw new Error(explainDbError(error));
    rows.push(...((data || []) as T[]));
    if (!data || data.length < size) break;
  }
  return rows;
}

export const iso = (d: Date) => d.toISOString();

// =====================================================
// Formatage des cellules (écran & PDF)
// =====================================================

const group = (n: number) => String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export function formatCell(value: ReportCell, type: ColType = 'text'): string {
  if (value === null || value === undefined || value === '') return type === 'text' ? '' : '—';
  switch (type) {
    case 'money': {
      const n = Number(value) || 0;
      return `${n < 0 ? '- ' : ''}${group(n)} FC`;
    }
    case 'number': {
      const n = Number(value);
      if (!Number.isFinite(n)) return String(value);
      return Number.isInteger(n) ? `${n < 0 ? '- ' : ''}${group(n)}` : n.toFixed(1).replace('.', ',');
    }
    case 'percent': {
      const n = Number(value);
      return Number.isFinite(n) ? `${(n * 100).toFixed(1).replace('.', ',').replace(',0', '')} %` : '—';
    }
    case 'date': {
      const d = new Date(String(value));
      return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('fr-FR');
    }
    case 'datetime': {
      const d = new Date(String(value));
      return Number.isNaN(d.getTime())
        ? String(value)
        : `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    default:
      return String(value);
  }
}

// =====================================================
// Utilitaires de calcul
// =====================================================

export const nom = (p: any) => (p ? `${p.prenom || ''} ${String(p.nom || '').toUpperCase()}`.trim() : '—');
export const docteur = (p: any) => (p ? `${titreSoignant(p.role)}${nom(p)}` : '—');
export const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + (Number(f(r)) || 0), 0);
export const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

export function ageAt(dateNaissance?: string | null, ref: Date = new Date()): number | null {
  if (!dateNaissance) return null;
  const b = new Date(dateNaissance);
  if (Number.isNaN(b.getTime())) return null;
  let a = ref.getFullYear() - b.getFullYear();
  const m = ref.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < b.getDate())) a--;
  return a;
}

/** Tranches d'âge utilisées dans les rapports sanitaires (SNIS). */
export const TRANCHES_AGE = [
  { label: '0 – 11 mois', min: 0, max: 0 },
  { label: '1 – 4 ans', min: 1, max: 4 },
  { label: '5 – 14 ans', min: 5, max: 14 },
  { label: '15 – 24 ans', min: 15, max: 24 },
  { label: '25 – 49 ans', min: 25, max: 49 },
  { label: '50 – 64 ans', min: 50, max: 64 },
  { label: '65 ans et plus', min: 65, max: 200 },
];

export function trancheAge(age: number | null): string {
  if (age === null) return 'Âge inconnu';
  return TRANCHES_AGE.find((t) => age >= t.min && age <= t.max)?.label || 'Âge inconnu';
}

/** Regroupe des lignes et cumule des valeurs. */
export function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  rows.forEach((r) => {
    const k = key(r) || '—';
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  });
  return map;
}

export const daysBetween = (a: string | Date, b: string | Date = new Date()) =>
  Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000));
