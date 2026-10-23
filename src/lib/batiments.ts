// =====================================================
// Bâtiments de l'hôpital. La localisation d'une chambre est enregistrée
// dans la colonne chambres.etage (anciennement l'étage).
// =====================================================

export const BATIMENTS = ['Bâtiment 1', 'Bâtiment 2', 'Bâtiment 3', 'Bâtiment 4'];

/** Liste proposée dans les formulaires, en conservant une ancienne valeur hors liste. */
export function batimentOptions(actuel?: string | null) {
  return actuel && !BATIMENTS.includes(actuel) ? [actuel, ...BATIMENTS] : BATIMENTS;
}

type LitAvecChambre = { numero: string; type_lit?: string | null; chambres?: { numero: string; etage?: string | null } | null };

/** Libellé d'un lit pour les listes de choix : « Chirurgie homme (Bâtiment 1) — Lit 3 (standard) ». */
export function libelleLit(lit: LitAvecChambre) {
  const ch = lit.chambres;
  const chambre = ch ? `${ch.numero}${ch.etage ? ` (${ch.etage})` : ''} — ` : '';
  return `${chambre}Lit ${lit.numero} (${String(lit.type_lit || '').replace('_', ' ')})`;
}

/** Tri des lits par bâtiment, chambre puis numéro de lit. */
export function compareLits(a: LitAvecChambre, b: LitAvecChambre) {
  return compareChambres(a.chambres || { numero: '' }, b.chambres || { numero: '' })
    || a.numero.localeCompare(b.numero, 'fr', { numeric: true });
}

/** Tri des chambres par bâtiment puis par nom (« Privé 2 » avant « Privé 10 »). */
export function compareChambres(a: { etage?: string | null; numero: string }, b: { etage?: string | null; numero: string }) {
  return (a.etage || '').localeCompare(b.etage || '', 'fr', { numeric: true })
    || a.numero.localeCompare(b.numero, 'fr', { numeric: true });
}
