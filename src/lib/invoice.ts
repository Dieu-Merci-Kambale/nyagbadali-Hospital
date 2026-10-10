import { supabase } from '@/lib/supabase';
import { buildFullInvoiceDocumentPdf } from '@/lib/document-models';
import type { ActeTarif } from '@/types';

export type SourceType = 'consultation' | 'prescription' | 'analyse' | 'hospitalisation';

export type InvoiceLine = {
  key: string;
  description: string;
  code_acte: string;
  quantite: number;
  prix_unitaire: number;
  /** Élément facturé (consultation, médicament délivré, analyse, séjour) */
  source_type?: SourceType | null;
  source_id?: string | null;
};

/** Élément restant à facturer, renvoyé par la fonction elements_a_facturer() de la base. */
export type ElementAFacturer = {
  patient_id: string;
  patient_nom: string;
  patient_code: string;
  source_type: SourceType;
  source_id: string;
  date_element: string;
  libelle: string;
  details: string;
  quantite: number;
  prix_unitaire: number | null;
  code_acte: string | null;
  consultation_id: string | null;
  hospitalisation_id: string | null;
};

export const SOURCE_LABELS: Record<SourceType, string> = {
  consultation: 'Consultations',
  prescription: 'Médicaments délivrés',
  analyse: 'Examens de laboratoire',
  hospitalisation: 'Hospitalisation',
};

/** Éléments non facturés d'un patient (ou de tous les patients si null). */
export async function fetchElementsAFacturer(patientId: string | null) {
  const { data, error } = await supabase.rpc('elements_a_facturer', { p_patient_id: patientId });
  return { elements: (data || []) as ElementAFacturer[], error };
}

/** Transforme un élément à facturer en ligne de facture (prix complété depuis le catalogue si besoin). */
export function elementToLine(el: ElementAFacturer, actes: ActeTarif[]): InvoiceLine {
  let prix = el.prix_unitaire !== null && el.prix_unitaire !== undefined ? Number(el.prix_unitaire) : null;
  let code = el.code_acte || '';
  if (prix === null && el.source_type === 'analyse') {
    const acte = matchActe(actes, el.libelle, 'laboratoire');
    if (acte) {
      prix = Number(acte.prix);
      code = acte.code;
    }
  }
  const description = el.source_type === 'consultation' || el.source_type === 'hospitalisation'
    ? `${el.libelle} — ${el.details}`
    : el.libelle;
  return newLine({
    description,
    code_acte: code,
    quantite: el.quantite,
    prix_unitaire: prix ?? 0,
    source_type: el.source_type,
    source_id: el.source_id,
  });
}

export const newLine = (patch: Partial<InvoiceLine> = {}): InvoiceLine => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  description: '',
  code_acte: '',
  quantite: 1,
  prix_unitaire: 0,
  ...patch,
});

/** Numéro de facture lisible et unique : FAC-AAAAMMJJ-XXXX */
export function generateInvoiceNumber(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const suffix = `${Date.now() % 10000}`.padStart(4, '0');
  return `FAC-${ymd}-${suffix}`;
}

/** Catalogue des actes actifs (vide si la table n'existe pas encore). */
export async function fetchActes(): Promise<ActeTarif[]> {
  const { data, error } = await supabase.from('actes_tarifs').select('*').eq('actif', true).order('categorie').order('libelle');
  if (error) return [];
  return (data || []) as ActeTarif[];
}

/** Cherche l'acte du catalogue qui correspond le mieux à un libellé libre. */
export function matchActe(actes: ActeTarif[], libelle: string, categorie?: ActeTarif['categorie']): ActeTarif | undefined {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ');
  const l = norm(libelle);
  const pool = categorie ? actes.filter((a) => a.categorie === categorie) : actes;
  return (
    pool.find((a) => norm(a.libelle) === l) ||
    pool.find((a) => l.includes(norm(a.libelle)) || norm(a.libelle).includes(l)) ||
    pool.find((a) => {
      const words = norm(a.libelle).split(' ').filter((w) => w.length > 3);
      return words.length > 0 && words.filter((w) => l.includes(w)).length >= Math.min(2, words.length);
    })
  );
}

/** Télécharge le PDF complet d'une facture à partir de son identifiant. */
export async function downloadInvoicePdf(factureId: string, printedBy?: { prenom?: string; nom?: string; role?: string }) {
  const { data, error } = await supabase
    .from('factures')
    .select(`
      *,
      patients(nom, prenom, code_patient, adresse, telephone),
      lignes_facture(id, description, code_acte, quantite, prix_unitaire, montant),
      paiements(id, montant, mode_paiement, date_paiement, reference)
    `)
    .eq('id', factureId)
    .single();
  if (error || !data) throw error || new Error('Facture introuvable');

  const pdf = await buildFullInvoiceDocumentPdf({
    facture: data,
    lignes: data.lignes_facture || [],
    paiements: data.paiements || [],
    printedBy,
    printedAt: new Date(),
  });
  pdf.save(`facture-${data.numero_facture || data.id}.pdf`);
}
