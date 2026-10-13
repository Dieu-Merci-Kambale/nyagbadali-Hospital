import type { Medicament } from '@/types';
import { toDateKey } from '@/lib/format';

/**
 * Médicament prescriptible : en stock à la pharmacie et non périmé.
 * (Même règle que le contrôle en base verifier_medicament_prescrit.)
 */
export function estPrescriptible(
  m: Pick<Medicament, 'stock_actuel' | 'statut' | 'date_peremption'>,
  aujourdhui: Date = new Date()
): boolean {
  if (!(Number(m.stock_actuel) > 0)) return false;
  if (m.statut === 'rupture' || m.statut === 'expiré') return false;
  return !(m.date_peremption && m.date_peremption < toDateKey(aujourdhui));
}
