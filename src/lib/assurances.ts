import { supabase } from '@/lib/supabase';

// =====================================================
// Module Assurances
// Assureurs enregistrés par l'administration, créances par facture (vue
// v_creances_assurance), bordereaux adressés aux assureurs, règlements
// ventilés par facture et litiges. Les calculs ci-dessous reprennent ceux de
// la base (supabase/migrations/20261021_assurances.sql) pour l'affichage.
// =====================================================

type StatusStyle = { label: string; badge: string };

export type TypeAssureur = 'assurance' | 'mutuelle' | 'entreprise' | 'etat' | 'ong' | 'autre';

export interface Assureur {
  id: string;
  code: string;
  nom: string;
  type: TypeAssureur;
  taux_couverture: number;
  plafond_facture?: number | null;
  delai_paiement_jours: number;
  numero_contrat?: string | null;
  date_debut_contrat?: string | null;
  date_fin_contrat?: string | null;
  contact_nom?: string | null;
  telephone?: string | null;
  email?: string | null;
  adresse?: string | null;
  notes?: string | null;
  actif: boolean;
  created_at: string;
  updated_at?: string;
}

export type StatutCreance =
  | 'à_réclamer' | 'en_bordereau' | 'réclamée' | 'partielle' | 'litige' | 'payée' | 'soldée' | 'transférée' | 'annulée';

/** Ligne de la vue v_creances_assurance : part assurance d'une facture et son recouvrement. */
export interface CreanceAssurance {
  facture_id: string;
  numero_facture: string;
  date_facture: string;
  patient_id: string;
  patient_nom: string;
  patient_prenom: string;
  code_patient: string;
  numero_assurance?: string | null;
  assureur_id: string | null;
  assureur_nom: string | null;
  assureur_code: string | null;
  montant_total: number;
  montant_assurance: number;
  montant_patient: number;
  statut_facture: string;
  paye: number;
  dernier_paiement?: string | null;
  abandonne: number;
  transfere: number;
  litiges_ouverts: number;
  montant_conteste: number;
  reste: number;
  bordereau_id?: string | null;
  bordereau_numero?: string | null;
  bordereau_statut?: string | null;
  date_envoi?: string | null;
  date_echeance?: string | null;
  en_retard: boolean;
  statut_assurance: StatutCreance;
}

export type StatutBordereau = 'brouillon' | 'envoyé' | 'partiel' | 'payé' | 'annulé';

/** Ligne de la vue v_bordereaux_assurance. */
export interface BordereauAssurance {
  id: string;
  numero: string;
  assureur_id: string;
  assureur_nom: string;
  assureur_code: string;
  periode_debut?: string | null;
  periode_fin?: string | null;
  date_emission: string;
  date_envoi?: string | null;
  date_echeance?: string | null;
  statut: 'brouillon' | 'envoyé' | 'annulé';
  statut_calcule: StatutBordereau;
  notes?: string | null;
  motif_annulation?: string | null;
  nb_factures: number;
  montant: number;
  paye: number;
  abandonne: number;
  reste: number;
  litiges_ouverts: number;
  en_retard: boolean;
  created_at: string;
}

export interface PaiementAssurance {
  id: string;
  numero: string;
  assureur_id: string;
  bordereau_id?: string | null;
  date_paiement: string;
  montant: number;
  mode_paiement: string;
  reference?: string | null;
  notes?: string | null;
  statut: 'validé' | 'annulé';
  motif_annulation?: string | null;
  created_at: string;
}

export type MotifLitige =
  | 'acte_non_couvert' | 'plafond_depasse' | 'pieces_manquantes' | 'erreur_facturation'
  | 'assure_non_couvert' | 'tarif_conteste' | 'doublon' | 'autre';

export interface LitigeAssurance {
  id: string;
  numero: string;
  facture_id: string;
  assureur_id: string;
  date_ouverture: string;
  motif: MotifLitige;
  description?: string | null;
  montant_conteste: number;
  statut: 'ouvert' | 'en_cours' | 'résolu' | 'annulé';
  montant_accepte: number;
  montant_transfere: number;
  montant_abandonne: number;
  date_resolution?: string | null;
  resolution?: string | null;
  created_at: string;
}

// ----- Libellés -----

export const TYPES_ASSUREURS: Record<TypeAssureur, string> = {
  assurance: "Compagnie d'assurance",
  mutuelle: 'Mutuelle de santé',
  entreprise: 'Entreprise conventionnée',
  etat: 'Organisme public',
  ong: 'ONG / partenaire',
  autre: 'Autre',
};

export const CREANCE_STATUTS: Record<StatutCreance, StatusStyle> = {
  'à_réclamer': { label: 'À réclamer', badge: 'badge-warning' },
  'en_bordereau': { label: 'En bordereau', badge: 'badge-neutral' },
  'réclamée': { label: 'Réclamée', badge: 'badge-info' },
  'partielle': { label: 'Payée en partie', badge: 'badge-purple' },
  'litige': { label: 'En litige', badge: 'badge-danger' },
  'payée': { label: 'Payée', badge: 'badge-success' },
  'soldée': { label: 'Soldée (perte)', badge: 'badge-neutral' },
  'transférée': { label: 'Reportée au patient', badge: 'badge-neutral' },
  'annulée': { label: 'Facture annulée', badge: 'badge-danger' },
};

export const BORDEREAU_STATUTS: Record<StatutBordereau, StatusStyle> = {
  brouillon: { label: 'En préparation', badge: 'badge-neutral' },
  'envoyé': { label: 'Envoyé', badge: 'badge-info' },
  partiel: { label: 'Payé en partie', badge: 'badge-purple' },
  'payé': { label: 'Payé', badge: 'badge-success' },
  'annulé': { label: 'Annulé', badge: 'badge-danger' },
};

export const LITIGE_STATUTS: Record<LitigeAssurance['statut'], StatusStyle> = {
  ouvert: { label: 'Ouvert', badge: 'badge-danger' },
  en_cours: { label: 'En cours de traitement', badge: 'badge-warning' },
  'résolu': { label: 'Résolu', badge: 'badge-success' },
  'annulé': { label: 'Annulé', badge: 'badge-neutral' },
};

export const MOTIFS_LITIGE: Record<MotifLitige, string> = {
  acte_non_couvert: 'Acte non couvert par le contrat',
  plafond_depasse: 'Plafond de prise en charge dépassé',
  pieces_manquantes: 'Pièces justificatives manquantes',
  erreur_facturation: 'Erreur de facturation',
  assure_non_couvert: 'Assuré non couvert (droits expirés)',
  tarif_conteste: 'Tarif contesté',
  doublon: 'Facture en double',
  autre: 'Autre motif',
};

export const MODES_REGLEMENT_ASSURANCE = ['virement', 'chèque', 'cash', 'mobile_money', 'carte'] as const;

/** Statuts de créance encore à recouvrer. */
export const STATUTS_OUVERTS: StatutCreance[] = ['à_réclamer', 'en_bordereau', 'réclamée', 'partielle', 'litige'];

// ----- Calculs -----

const n = (v: unknown) => Number(v) || 0;

/**
 * Part prise en charge par l'assureur : taux appliqué au total, arrondie au franc,
 * limitée au plafond par facture de l'assureur.
 */
export function calculPartAssurance(total: number, taux: number, plafond?: number | null): { montant: number; plafonne: boolean } {
  const brut = Math.round((Math.max(0, total) * Math.min(100, Math.max(0, taux))) / 100);
  if (plafond && plafond > 0 && brut > plafond) return { montant: Math.round(plafond), plafonne: true };
  return { montant: brut, plafonne: false };
}

/** Un assureur est utilisable s'il est actif et si son contrat n'est pas échu. */
export function contratEchu(assureur: Pick<Assureur, 'date_fin_contrat'>, ref: Date = new Date()): boolean {
  if (!assureur.date_fin_contrat) return false;
  const fin = new Date(`${assureur.date_fin_contrat}T23:59:59`);
  return fin.getTime() < ref.getTime();
}

export type Ventilation = { facture_id: string; numero_facture: string; montant: number };

/**
 * Ventilation automatique d'un règlement, comme la base : factures les plus
 * anciennes d'abord, factures en litige en dernier. Renvoie aussi le montant
 * non affecté (règlement supérieur au reste dû).
 */
export function ventilerReglement(
  montant: number,
  creances: Pick<CreanceAssurance, 'facture_id' | 'numero_facture' | 'date_facture' | 'reste' | 'litiges_ouverts'>[],
): { lignes: Ventilation[]; nonAffecte: number } {
  const ordre = creances
    .filter((c) => n(c.reste) > 0)
    .slice()
    .sort((a, b) =>
      Number(a.litiges_ouverts > 0) - Number(b.litiges_ouverts > 0)
      || new Date(a.date_facture).getTime() - new Date(b.date_facture).getTime()
      || a.numero_facture.localeCompare(b.numero_facture));
  let restant = Math.max(0, n(montant));
  const lignes: Ventilation[] = [];
  for (const c of ordre) {
    if (restant <= 0) break;
    const part = Math.min(n(c.reste), restant);
    lignes.push({ facture_id: c.facture_id, numero_facture: c.numero_facture, montant: part });
    restant -= part;
  }
  return { lignes, nonAffecte: restant };
}

export const TRANCHES_ANCIENNETE = ['0 – 30 jours', '31 – 60 jours', '61 – 90 jours', 'Plus de 90 jours'] as const;

/** Tranche d'ancienneté d'une créance, à partir de la date de la facture. */
export function trancheAnciennete(dateFacture: string, ref: Date = new Date()): (typeof TRANCHES_ANCIENNETE)[number] {
  const jours = Math.floor((ref.getTime() - new Date(dateFacture).getTime()) / 86400000);
  if (jours <= 30) return TRANCHES_ANCIENNETE[0];
  if (jours <= 60) return TRANCHES_ANCIENNETE[1];
  if (jours <= 90) return TRANCHES_ANCIENNETE[2];
  return TRANCHES_ANCIENNETE[3];
}

export type SyntheseAssureur = {
  assureur_id: string;
  assureur_nom: string;
  factures: number;
  facture: number;
  paye: number;
  abandonne: number;
  transfere: number;
  conteste: number;
  reste: number;
  enRetard: number;
  aReclamer: number;
  /** Payé / (payé + reste), hors pertes et reports */
  tauxRecouvrement: number;
};

/** Situation de chaque assureur à partir de ses créances (factures annulées exclues). */
export function syntheseParAssureur(creances: CreanceAssurance[]): SyntheseAssureur[] {
  const map = new Map<string, SyntheseAssureur>();
  for (const c of creances) {
    if (c.statut_facture === 'annulée' || !c.assureur_id) continue;
    const s = map.get(c.assureur_id) || {
      assureur_id: c.assureur_id, assureur_nom: c.assureur_nom || '—', factures: 0, facture: 0, paye: 0,
      abandonne: 0, transfere: 0, conteste: 0, reste: 0, enRetard: 0, aReclamer: 0, tauxRecouvrement: 0,
    };
    s.factures += 1;
    s.facture += n(c.montant_assurance) + n(c.transfere);
    s.paye += n(c.paye);
    s.abandonne += n(c.abandonne);
    s.transfere += n(c.transfere);
    s.conteste += n(c.montant_conteste);
    s.reste += n(c.reste);
    if (c.en_retard) s.enRetard += n(c.reste);
    if (c.statut_assurance === 'à_réclamer') s.aReclamer += n(c.reste);
    map.set(c.assureur_id, s);
  }
  return [...map.values()]
    .map((s) => ({ ...s, tauxRecouvrement: s.paye + s.reste > 0 ? s.paye / (s.paye + s.reste) : 0 }))
    .sort((a, b) => b.reste - a.reste || a.assureur_nom.localeCompare(b.assureur_nom, 'fr'));
}

/** Total des règlements validés (les règlements annulés ne comptent pas). */
export function totalReglements(reglements: Pick<PaiementAssurance, 'statut' | 'montant'>[]): number {
  return reglements.filter((r) => r.statut !== 'annulé').reduce((s, r) => s + n(r.montant), 0);
}

/** Contrôle d'une décision de litige : la répartition doit égaler le montant contesté. */
export function decisionValide(conteste: number, accepte: number, transfere: number, abandonne: number): boolean {
  const vals = [accepte, transfere, abandonne];
  return vals.every((v) => v >= 0) && Math.abs(vals.reduce((s, v) => s + v, 0) - conteste) < 0.005;
}

/** Conditions de prise en charge d'un patient par son assureur enregistré. */
export type CouverturePatient = {
  id: string;
  nom: string;
  taux: number;
  plafond: number | null;
  actif: boolean;
  echu: boolean;
  /** Assureur actif et contrat en cours : prise en charge possible */
  utilisable: boolean;
  numero: string | null;
};

// ----- Données -----

/**
 * Assureur d'un patient pour la facturation. `module` vaut false tant que le
 * script du module Assurances n'est pas exécuté (seul le nom est alors connu).
 */
export async function chargerCouverture(patientId: string): Promise<{ nom: string | null; couverture: CouverturePatient | null; module: boolean }> {
  const { data, error } = await supabase
    .from('patients')
    .select('assureur, assureur_id, numero_assurance, assureurs(id, nom, taux_couverture, plafond_facture, actif, date_fin_contrat)')
    .eq('id', patientId)
    .single();
  if (error) {
    const { data: ancien } = await supabase.from('patients').select('assureur').eq('id', patientId).single();
    return { nom: ancien?.assureur || null, couverture: null, module: false };
  }
  const a = (Array.isArray(data.assureurs) ? data.assureurs[0] : data.assureurs) as
    | Pick<Assureur, 'id' | 'nom' | 'taux_couverture' | 'plafond_facture' | 'actif' | 'date_fin_contrat'>
    | null;
  if (!a) return { nom: data.assureur || null, couverture: null, module: true };
  const echu = contratEchu(a);
  return {
    nom: a.nom,
    module: true,
    couverture: {
      id: a.id,
      nom: a.nom,
      taux: Number(a.taux_couverture),
      plafond: a.plafond_facture ? Number(a.plafond_facture) : null,
      actif: a.actif,
      echu,
      utilisable: a.actif && !echu,
      numero: data.numero_assurance || null,
    },
  };
}

/** Assureurs enregistrés (actifs seulement par défaut), triés par nom. */
export async function fetchAssureurs(options: { inclureInactifs?: boolean } = {}) {
  let q = supabase.from('assureurs').select('*').order('nom');
  if (!options.inclureInactifs) q = q.eq('actif', true);
  const { data, error } = await q;
  return { assureurs: (data || []) as Assureur[], error };
}
