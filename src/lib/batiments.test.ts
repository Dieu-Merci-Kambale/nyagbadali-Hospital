import { describe, expect, it } from 'vitest';
import { BATIMENTS, batimentOptions, compareChambres, compareLits, libelleLit } from './batiments';

describe('batimentOptions', () => {
  it('propose les quatre bâtiments', () => {
    expect(batimentOptions()).toEqual(BATIMENTS);
    expect(batimentOptions('Bâtiment 2')).toEqual(BATIMENTS);
  });

  it('conserve une ancienne valeur hors liste', () => {
    expect(batimentOptions('1er Étage')).toEqual(['1er Étage', ...BATIMENTS]);
  });
});

describe('compareChambres', () => {
  it('trie par bâtiment puis par nom, numéros dans l’ordre naturel', () => {
    const chambres = [
      { etage: 'Bâtiment 3', numero: 'Privé 10' },
      { etage: 'Bâtiment 1', numero: 'Maternité' },
      { etage: 'Bâtiment 3', numero: 'Privé 2' },
      { etage: 'Bâtiment 1', numero: 'Chirurgie homme' },
    ];
    expect([...chambres].sort(compareChambres).map((c) => c.numero)).toEqual(['Chirurgie homme', 'Maternité', 'Privé 2', 'Privé 10']);
  });
});

describe('lits', () => {
  const lit = (chambre: string, numero: string, etage = 'Bâtiment 1') => ({ numero, type_lit: 'soins_intensifs', chambres: { numero: chambre, etage } });

  it('affiche la salle, le bâtiment et le lit', () => {
    expect(libelleLit(lit('Salle de réveil', '2'))).toBe('Salle de réveil (Bâtiment 1) — Lit 2 (soins intensifs)');
    expect(libelleLit({ numero: '1', type_lit: 'standard', chambres: null })).toBe('Lit 1 (standard)');
  });

  it('trie par chambre puis par numéro de lit', () => {
    const lits = [lit('Pédiatrie', '10', 'Bâtiment 2'), lit('Pédiatrie', '9', 'Bâtiment 2'), lit('Maternité', '1')];
    expect(lits.sort(compareLits).map((l) => `${l.chambres.numero} ${l.numero}`)).toEqual(['Maternité 1', 'Pédiatrie 9', 'Pédiatrie 10']);
  });
});
