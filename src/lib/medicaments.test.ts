import { describe, expect, it } from 'vitest';
import { estPrescriptible } from './medicaments';

const AUJOURDHUI = new Date(2026, 9, 13, 10, 0);
const med = (patch = {}) => ({ stock_actuel: 20, statut: 'disponible' as const, date_peremption: '2027-01-31', ...patch });

describe('estPrescriptible', () => {
  it('accepte un médicament en stock et non périmé', () => {
    expect(estPrescriptible(med(), AUJOURDHUI)).toBe(true);
    expect(estPrescriptible(med({ date_peremption: undefined }), AUJOURDHUI)).toBe(true);
  });

  it('refuse un médicament sans stock', () => {
    expect(estPrescriptible(med({ stock_actuel: 0 }), AUJOURDHUI)).toBe(false);
    expect(estPrescriptible(med({ stock_actuel: -3 }), AUJOURDHUI)).toBe(false);
  });

  it('refuse un médicament marqué en rupture ou expiré', () => {
    expect(estPrescriptible(med({ statut: 'rupture' }), AUJOURDHUI)).toBe(false);
    expect(estPrescriptible(med({ statut: 'expiré' }), AUJOURDHUI)).toBe(false);
  });

  it('refuse un médicament dont la date de péremption est passée', () => {
    expect(estPrescriptible(med({ date_peremption: '2026-10-12' }), AUJOURDHUI)).toBe(false);
  });

  it('accepte un médicament qui se périme aujourd’hui même', () => {
    expect(estPrescriptible(med({ date_peremption: '2026-10-13' }), AUJOURDHUI)).toBe(true);
  });
});
