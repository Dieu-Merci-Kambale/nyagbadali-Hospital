import { describe, expect, it, vi } from 'vitest';
import type { ActeTarif } from '@/types';

// Pas d'accès réseau ni de génération PDF pendant les tests
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/document-models', () => ({ buildFullInvoiceDocumentPdf: vi.fn() }));

const { elementToLine, generateInvoiceNumber, matchActe, newLine } = await import('./invoice');
type Element = Parameters<typeof elementToLine>[0];

const acte = (code: string, libelle: string, prix: number, categorie: ActeTarif['categorie'] = 'laboratoire'): ActeTarif =>
  ({ id: code, code, libelle, categorie, prix, actif: true, created_at: '' });

const ACTES = [
  acte('CS-GEN', 'Consultation générale', 10000, 'consultation'),
  acte('LAB-NFS', 'Hémogramme complet (NFS)', 8000),
  acte('LAB-GE', 'Goutte épaisse', 5000),
  acte('LAB-GLY', 'Glycémie à jeun', 4000),
];

const element = (patch: Partial<Element>): Element => ({
  patient_id: 'p1', patient_nom: 'Jean KASONGO', patient_code: 'PAT-001',
  source_type: 'analyse', source_id: 'a1', date_element: '2026-10-13T08:00:00Z',
  libelle: 'Hémogramme complet (NFS)', details: 'Examen de laboratoire',
  quantite: 1, prix_unitaire: null, code_acte: null, consultation_id: null, hospitalisation_id: null,
  ...patch,
});

describe('matchActe', () => {
  it('trouve un acte par libellé exact, sans accents ni casse', () => {
    expect(matchActe(ACTES, 'HEMOGRAMME COMPLET (NFS)')?.code).toBe('LAB-NFS');
  });

  it('trouve un acte dont le libellé est contenu dans la saisie', () => {
    expect(matchActe(ACTES, 'Goutte épaisse / TDR paludisme', 'laboratoire')?.code).toBe('LAB-GE');
  });

  it('se limite à la catégorie demandée', () => {
    expect(matchActe(ACTES, 'Consultation générale', 'laboratoire')).toBeUndefined();
  });

  it('ne rattache pas un libellé sans rapport', () => {
    expect(matchActe(ACTES, 'Radiographie thoracique')).toBeUndefined();
  });
});

describe('elementToLine', () => {
  it("complète le prix d'un examen depuis le catalogue des tarifs", () => {
    const ligne = elementToLine(element({}), ACTES);
    expect(ligne).toMatchObject({ description: 'Hémogramme complet (NFS)', code_acte: 'LAB-NFS', prix_unitaire: 8000, quantite: 1, source_type: 'analyse', source_id: 'a1' });
  });

  it('garde le prix fourni par la base quand il existe', () => {
    const ligne = elementToLine(element({ prix_unitaire: 9500, code_acte: 'X' }), ACTES);
    expect(ligne.prix_unitaire).toBe(9500);
    expect(ligne.code_acte).toBe('X');
  });

  it('met 0 quand aucun tarif ne correspond', () => {
    expect(elementToLine(element({ libelle: 'Examen inconnu' }), ACTES).prix_unitaire).toBe(0);
  });

  it('ajoute le détail pour une consultation ou un séjour', () => {
    const ligne = elementToLine(element({ source_type: 'hospitalisation', libelle: "Journées d'hospitalisation", details: 'Séjour du 01/10/2026', quantite: 3, prix_unitaire: 20000 }), ACTES);
    expect(ligne.description).toBe("Journées d'hospitalisation — Séjour du 01/10/2026");
    expect(ligne.quantite).toBe(3);
  });
});

describe('newLine et generateInvoiceNumber', () => {
  it('crée une ligne vide avec une clé unique', () => {
    const a = newLine();
    const b = newLine({ description: 'Pansement' });
    expect(a).toMatchObject({ description: '', quantite: 1, prix_unitaire: 0 });
    expect(b.description).toBe('Pansement');
    expect(a.key).not.toBe(b.key);
  });

  it('produit un numéro de facture FAC-AAAAMMJJ-XXXX', () => {
    expect(generateInvoiceNumber()).toMatch(/^FAC-\d{8}-\d{4}$/);
  });
});
