import { supabase } from '@/lib/supabase';
import type { ActeTarif, ParametreAnalyse } from '@/types';

// =====================================================
// Catalogue des examens de laboratoire
// Les examens sont les actes « laboratoire » du catalogue des tarifs, enregistrés
// par l'administration (super administrateur et administrateur) avec leur prix,
// leur famille et leurs paramètres (unité et valeurs de référence adulte).
// =====================================================

export const FAMILLES_EXAMENS = ['Hématologie', 'Biochimie', 'Parasitologie', 'Sérologie', 'Urines', 'Autre'] as const;

/** Examens du catalogue (actifs seulement par défaut), triés par libellé. */
export async function fetchExamensLabo(options: { inclureInactifs?: boolean } = {}) {
  let q = supabase.from('actes_tarifs').select('*').eq('categorie', 'laboratoire').order('libelle');
  if (!options.inclureInactifs) q = q.eq('actif', true);
  const { data, error } = await q;
  return { examens: (data || []) as ActeTarif[], error };
}

/** Examens regroupés par famille, dans l'ordre des familles connues puis des autres. */
export function grouperParFamille(examens: ActeTarif[]): { famille: string; examens: ActeTarif[] }[] {
  const groupes = new Map<string, ActeTarif[]>();
  for (const e of examens) {
    const f = e.famille?.trim() || 'Autre';
    groupes.set(f, [...(groupes.get(f) || []), e]);
  }
  const rang = (f: string) => {
    const i = (FAMILLES_EXAMENS as readonly string[]).indexOf(f);
    return i === -1 ? FAMILLES_EXAMENS.length - 1 : i;
  };
  return [...groupes.entries()]
    .sort(([a], [b]) => rang(a) - rang(b) || a.localeCompare(b, 'fr'))
    .map(([famille, list]) => ({ famille, examens: list }));
}

/** Paramètres vides à remplir pour un examen, d'après son modèle au catalogue. */
export function parametresModele(acte?: Pick<ActeTarif, 'parametres'> | null): ParametreAnalyse[] {
  return (acte?.parametres || [])
    .filter((p) => p.nom?.trim())
    .map((p) => ({ nom: p.nom, unite: p.unite || '', reference: p.reference || '', valeur: '', anormal: false }));
}

/** Statut global d'une demande à partir de ses examens. */
export function statutDemande(analyses: { statut: string }[]): string {
  const actifs = analyses.filter((a) => a.statut !== 'annulé');
  if (actifs.length === 0) return 'annulé';
  if (actifs.every((a) => a.statut === 'terminé')) return 'terminé';
  if (actifs.some((a) => a.statut === 'en_cours' || a.statut === 'terminé')) return 'en_cours';
  if (actifs.every((a) => a.statut === 'demandé')) return 'demandé';
  return 'prélevé';
}
