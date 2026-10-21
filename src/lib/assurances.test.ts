import { describe, expect, it, vi } from 'vitest';
import {
  calculPartAssurance, contratEchu, decisionValide, syntheseParAssureur, totalReglements, trancheAnciennete, ventilerReglement,
  type CreanceAssurance,
} from './assurances';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const creance = (patch: Partial<CreanceAssurance>): CreanceAssurance => ({
  facture_id: 'f', numero_facture: 'FAC-1', date_facture: '2026-10-01T10:00:00Z', patient_id: 'p', patient_nom: 'KABILA',
  patient_prenom: 'Jean', code_patient: 'P-1', assureur_id: 'a1', assureur_nom: 'SONAS', assureur_code: 'SONAS',
  montant_total: 10000, montant_assurance: 8000, montant_patient: 2000, statut_facture: 'en_attente', paye: 0, abandonne: 0,
  transfere: 0, litiges_ouverts: 0, montant_conteste: 0, reste: 8000, en_retard: false, statut_assurance: 'à_réclamer',
  ...patch,
});

describe('calculPartAssurance', () => {
  it('applique le taux et arrondit au franc', () => {
    expect(calculPartAssurance(12345, 80)).toEqual({ montant: 9876, plafonne: false });
  });

  it('limite la part au plafond par facture', () => {
    expect(calculPartAssurance(100000, 80, 50000)).toEqual({ montant: 50000, plafonne: true });
    expect(calculPartAssurance(10000, 80, 50000)).toEqual({ montant: 8000, plafonne: false });
  });

  it('borne le taux entre 0 et 100 %', () => {
    expect(calculPartAssurance(1000, 150).montant).toBe(1000);
    expect(calculPartAssurance(1000, -5).montant).toBe(0);
  });
});

describe('contratEchu', () => {
  it('compare la date de fin de contrat à la date du jour (jour de fin inclus)', () => {
    const ref = new Date('2026-10-21T12:00:00');
    expect(contratEchu({ date_fin_contrat: '2026-10-20' }, ref)).toBe(true);
    expect(contratEchu({ date_fin_contrat: '2026-10-21' }, ref)).toBe(false);
    expect(contratEchu({ date_fin_contrat: null }, ref)).toBe(false);
  });
});

describe('ventilerReglement', () => {
  const creances = [
    creance({ facture_id: 'recent', numero_facture: 'FAC-3', date_facture: '2026-10-10T00:00:00Z', reste: 5000 }),
    creance({ facture_id: 'litige', numero_facture: 'FAC-1', date_facture: '2026-09-01T00:00:00Z', reste: 4000, litiges_ouverts: 1 }),
    creance({ facture_id: 'ancien', numero_facture: 'FAC-2', date_facture: '2026-09-15T00:00:00Z', reste: 3000 }),
    creance({ facture_id: 'solde', numero_facture: 'FAC-0', date_facture: '2026-08-01T00:00:00Z', reste: 0 }),
  ];

  it('affecte aux plus anciennes factures, celles en litige en dernier', () => {
    expect(ventilerReglement(9000, creances)).toEqual({
      lignes: [
        { facture_id: 'ancien', numero_facture: 'FAC-2', montant: 3000 },
        { facture_id: 'recent', numero_facture: 'FAC-3', montant: 5000 },
        { facture_id: 'litige', numero_facture: 'FAC-1', montant: 1000 },
      ],
      nonAffecte: 0,
    });
  });

  it('signale la part qui dépasse le reste dû', () => {
    expect(ventilerReglement(15000, creances).nonAffecte).toBe(3000);
  });
});

describe('trancheAnciennete', () => {
  const ref = new Date('2026-10-21T00:00:00Z');
  it('range les créances par ancienneté', () => {
    expect(trancheAnciennete('2026-10-01T00:00:00Z', ref)).toBe('0 – 30 jours');
    expect(trancheAnciennete('2026-09-10T00:00:00Z', ref)).toBe('31 – 60 jours');
    expect(trancheAnciennete('2026-08-01T00:00:00Z', ref)).toBe('61 – 90 jours');
    expect(trancheAnciennete('2026-01-01T00:00:00Z', ref)).toBe('Plus de 90 jours');
  });
});

describe('syntheseParAssureur', () => {
  it('cumule par assureur, exclut les factures annulées et calcule le recouvrement', () => {
    const s = syntheseParAssureur([
      creance({ paye: 8000, reste: 0, statut_assurance: 'payée' }),
      creance({ facture_id: 'b', reste: 8000, en_retard: true, statut_assurance: 'réclamée' }),
      creance({ facture_id: 'c', montant_assurance: 6000, transfere: 2000, reste: 6000, montant_conteste: 1000, statut_assurance: 'litige' }),
      creance({ facture_id: 'x', statut_facture: 'annulée', reste: 0 }),
      creance({ facture_id: 'd', assureur_id: 'a2', assureur_nom: 'Activa', reste: 3000 }),
    ]);
    expect(s.map((x) => x.assureur_nom)).toEqual(['SONAS', 'Activa']);
    expect(s[0]).toMatchObject({ factures: 3, facture: 24000, paye: 8000, reste: 14000, enRetard: 8000, conteste: 1000, transfere: 2000 });
    expect(s[0].tauxRecouvrement).toBeCloseTo(8000 / 22000);
    expect(s[1]).toMatchObject({ aReclamer: 3000, tauxRecouvrement: 0 });
  });
});

describe('totalReglements', () => {
  it('ignore les règlements annulés', () => {
    expect(totalReglements([{ statut: 'validé', montant: 1000 }, { statut: 'annulé', montant: 500 }, { statut: 'validé', montant: 250 }])).toBe(1250);
  });
});

describe('decisionValide', () => {
  it('exige une répartition exacte et positive du montant contesté', () => {
    expect(decisionValide(1000, 600, 400, 0)).toBe(true);
    expect(decisionValide(1000, 600, 300, 0)).toBe(false);
    expect(decisionValide(1000, 1200, -200, 0)).toBe(false);
  });
});
