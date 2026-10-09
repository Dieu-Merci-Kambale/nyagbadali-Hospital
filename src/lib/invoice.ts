import { supabase } from '@/lib/supabase';
import { buildFullInvoiceDocumentPdf } from '@/lib/document-models';
import type { ActeTarif } from '@/types';

export type InvoiceLine = {
  key: string;
  description: string;
  code_acte: string;
  quantite: number;
  prix_unitaire: number;
};

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
