import type { DemandeModification, ModuleDemandeModification, RolePersonnel, StatutDemandeModification } from '@/types';
import type { StatusStyle } from '@/lib/format';

/** Partie du système où l'erreur a été commise (mêmes valeurs que la contrainte SQL). */
export const MODULES_DEMANDE: Record<ModuleDemandeModification, string> = {
  patients: 'Dossier patient',
  rendez_vous: 'Rendez-vous',
  consultations: 'Consultation',
  prescriptions: 'Ordonnance / prescription',
  hospitalisation: 'Hospitalisation',
  laboratoire: 'Laboratoire',
  pharmacie: 'Pharmacie / stock',
  facturation: 'Facturation / paiement',
  depenses: 'Dépenses',
  assurances: 'Assurances',
  personnel: 'Personnel',
  autre: 'Autre',
};

export const DEMANDE_STATUTS: Record<StatutDemandeModification, StatusStyle> = {
  en_attente_medecin_chef: { label: 'Attente médecin chef', badge: 'badge-warning' },
  en_attente_direction: { label: 'Attente direction', badge: 'badge-info' },
  'approuvée': { label: 'Approuvée', badge: 'badge-success' },
  'rejetée': { label: 'Rejetée', badge: 'badge-danger' },
  'exécutée': { label: 'Correction effectuée', badge: 'badge-neutral' },
};

/** Explication minimale exigée de l'auteur de l'erreur (même seuil que la base). */
export const EXPLICATION_MIN = 20;

type Demande = Pick<DemandeModification, 'statut' | 'demandeur_id'>;

/** Le médecin chef signe une demande qui attend son avis, jamais la sienne. */
export function canSignMedecinChef(role: RolePersonnel | null | undefined, moi: string | null | undefined, d: Demande): boolean {
  return role === 'medecin_chef' && d.statut === 'en_attente_medecin_chef' && !!moi && d.demandeur_id !== moi;
}

/** La direction (administrateur ou super administrateur) décide en dernier, jamais sur sa propre demande. */
export function canSignDirection(role: RolePersonnel | null | undefined, moi: string | null | undefined, d: Demande): boolean {
  return (role === 'super_admin' || role === 'admin') && d.statut === 'en_attente_direction' && !!moi && d.demandeur_id !== moi;
}

/** Une demande approuvée est marquée exécutée par l'administration, une fois la correction faite. */
export function canMarkExecutee(role: RolePersonnel | null | undefined, d: Pick<DemandeModification, 'statut'>): boolean {
  return (role === 'super_admin' || role === 'admin') && d.statut === 'approuvée';
}

/** Le médecin chef et la direction voient toutes les demandes ; les autres, uniquement les leurs. */
export function seesAllDemandes(role: RolePersonnel | null | undefined): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'medecin_chef';
}
