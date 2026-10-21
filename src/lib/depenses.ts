import type { Depense } from '@/types';

/** Numéro de pièce de dépense, ex. DEP-20261021-4821. */
export function generateDepenseNumber(date: Date = new Date()): string {
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const suffix = `${Date.now() % 10000}`.padStart(4, '0');
  return `DEP-${ymd}-${suffix}`;
}

/** Seules les dépenses validées sortent de la caisse (une dépense annulée ne compte pas). */
export const isDepenseComptee = (d: Pick<Depense, 'statut'>) => d.statut !== 'annulée';

/** Total des dépenses validées. */
export function totalDepenses(depenses: Pick<Depense, 'statut' | 'montant'>[]): number {
  return depenses.filter(isDepenseComptee).reduce((s, d) => s + (Number(d.montant) || 0), 0);
}

/** Situation de caisse : entrées (paiements encaissés), sorties (dépenses validées) et solde. */
export function soldeCaisse(
  paiements: { montant: number | string | null }[],
  depenses: Pick<Depense, 'statut' | 'montant'>[],
): { entrees: number; sorties: number; solde: number } {
  const entrees = paiements.reduce((s, p) => s + (Number(p.montant) || 0), 0);
  const sorties = totalDepenses(depenses);
  return { entrees, sorties, solde: entrees - sorties };
}
