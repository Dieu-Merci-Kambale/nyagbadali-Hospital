import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const { ageAt, buildPeriod, fetchAll, formatCell, groupBy, periodBuckets, ratio, sum, trancheAge } = await import('./helpers');

describe('buildPeriod', () => {
  it('couvre toute la journée', () => {
    const p = buildPeriod('jour', '2026-10-13');
    expect(p.from).toEqual(new Date(2026, 9, 13, 0, 0, 0, 0));
    expect(p.to).toEqual(new Date(2026, 9, 13, 23, 59, 59, 999));
  });

  it('couvre tout le mois, y compris février', () => {
    const p = buildPeriod('mois', '2028-02');
    expect(p.from).toEqual(new Date(2028, 1, 1));
    expect(p.to.getDate()).toBe(29);
    expect(p.label).toBe('Mois de février 2028');
  });

  it("élide « de » devant une voyelle", () => {
    expect(buildPeriod('mois', '2026-04').label).toBe("Mois d'avril 2026");
  });

  it("couvre toute l'année", () => {
    const p = buildPeriod('annee', '2026');
    expect(p.from).toEqual(new Date(2026, 0, 1));
    expect(p.to).toEqual(new Date(2026, 11, 31, 23, 59, 59, 999));
  });

  it('accepte une période libre', () => {
    const p = buildPeriod('periode', '2026-10-01|2026-10-13');
    expect(p.key).toBe('2026-10-01_2026-10-13');
    expect(p.to).toEqual(new Date(2026, 9, 13, 23, 59, 59, 999));
  });
});

describe('periodBuckets', () => {
  it('découpe une journée en 24 heures', () => {
    expect(periodBuckets(buildPeriod('jour', '2026-10-13'))).toHaveLength(24);
  });

  it('découpe un mois en jours et une année en mois', () => {
    expect(periodBuckets(buildPeriod('mois', '2026-10'))).toHaveLength(31);
    expect(periodBuckets(buildPeriod('annee', '2026'))).toHaveLength(12);
  });

  it('range chaque date dans la bonne tranche', () => {
    const jours = periodBuckets(buildPeriod('mois', '2026-10'));
    const d = new Date(2026, 9, 13, 15, 0);
    expect(jours.filter((b) => b.match(d)).map((b) => b.key)).toEqual(['2026-10-13']);
  });
});

describe('formatCell', () => {
  it('formate les montants, nombres et pourcentages', () => {
    expect(formatCell(1250000, 'money')).toBe('1 250 000 FC');
    expect(formatCell(-500, 'money')).toBe('- 500 FC');
    expect(formatCell(12345, 'number')).toBe('12 345');
    expect(formatCell(2.25, 'number')).toBe('2,3');
    expect(formatCell(0.5, 'percent')).toBe('50 %');
    expect(formatCell(0.125, 'percent')).toBe('12,5 %');
  });

  it('affiche un tiret pour une valeur absente (sauf texte)', () => {
    expect(formatCell(null, 'money')).toBe('—');
    expect(formatCell('', 'text')).toBe('');
  });

  it('laisse une date invalide telle quelle', () => {
    expect(formatCell('inconnue', 'date')).toBe('inconnue');
  });
});

describe('âges et tranches SNIS', () => {
  const ref = new Date(2026, 9, 13);

  it("calcule l'âge à une date donnée", () => {
    expect(ageAt('2020-10-14', ref)).toBe(5);
    expect(ageAt('2020-10-13', ref)).toBe(6);
    expect(ageAt(null, ref)).toBeNull();
  });

  it("classe l'âge dans la bonne tranche", () => {
    expect(trancheAge(0)).toBe('0 – 11 mois');
    expect(trancheAge(4)).toBe('1 – 4 ans');
    expect(trancheAge(5)).toBe('5 – 14 ans');
    expect(trancheAge(70)).toBe('65 ans et plus');
    expect(trancheAge(null)).toBe('Âge inconnu');
  });
});

describe('calculs', () => {
  it('additionne en ignorant les valeurs non numériques', () => {
    expect(sum([{ m: 100 }, { m: '50' as unknown as number }, { m: NaN }], (r) => r.m)).toBe(150);
  });

  it('évite la division par zéro', () => {
    expect(ratio(3, 4)).toBe(0.75);
    expect(ratio(3, 0)).toBe(0);
  });

  it('regroupe par clé, avec un tiret pour une clé vide', () => {
    const g = groupBy([{ s: 'payée' }, { s: '' }, { s: 'payée' }], (r) => r.s);
    expect(g.get('payée')).toHaveLength(2);
    expect(g.get('—')).toHaveLength(1);
  });
});

describe('fetchAll', () => {
  it('lit toutes les pages de 1 000 lignes', async () => {
    const lignes = Array.from({ length: 2500 }, (_, i) => i);
    const query = vi.fn(async (from: number, to: number) => ({ data: lignes.slice(from, to + 1), error: null }));
    const rows = await fetchAll(query);
    expect(rows).toHaveLength(2500);
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("remonte l'erreur de la base de façon lisible", async () => {
    const query = async () => ({ data: null, error: { code: '42501', message: 'permission denied' } });
    await expect(fetchAll(query)).rejects.toThrow('Action non autorisée pour votre rôle.');
  });
});
