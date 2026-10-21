import { describe, expect, it } from 'vitest';
import { generateDepenseNumber, soldeCaisse, totalDepenses } from './depenses';

describe('generateDepenseNumber', () => {
  it('suit le format DEP-AAAAMMJJ-NNNN', () => {
    expect(generateDepenseNumber(new Date(2026, 9, 21))).toMatch(/^DEP-20261021-\d{4}$/);
  });
});

describe('totalDepenses', () => {
  it('ignore les dépenses annulées', () => {
    expect(totalDepenses([
      { statut: 'validée', montant: 1000 },
      { statut: 'annulée', montant: 5000 },
      { statut: 'validée', montant: 250 },
    ])).toBe(1250);
  });

  it('vaut zéro sans dépense', () => {
    expect(totalDepenses([])).toBe(0);
  });
});

describe('soldeCaisse', () => {
  it('soustrait les dépenses validées des encaissements', () => {
    expect(soldeCaisse(
      [{ montant: 10000 }, { montant: '2500' }, { montant: null }],
      [{ statut: 'validée', montant: 4000 }, { statut: 'annulée', montant: 9000 }],
    )).toEqual({ entrees: 12500, sorties: 4000, solde: 8500 });
  });

  it('donne un solde négatif quand les dépenses dépassent les entrées', () => {
    expect(soldeCaisse([{ montant: 1000 }], [{ statut: 'validée', montant: 3000 }]).solde).toBe(-2000);
  });
});
