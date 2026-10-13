import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  capitalize, daysBetween, explainDbError, FACTURE_STATUTS, formatDate, formatMoney, getAge, statusBadge, toDateKey,
} from './format';

describe('formatMoney', () => {
  it('groupe les milliers avec une espace et ajoute FC', () => {
    expect(formatMoney(1234567)).toBe('1 234 567 FC');
    expect(formatMoney(999)).toBe('999 FC');
  });

  it('arrondit et gère les montants négatifs', () => {
    expect(formatMoney(1500.6)).toBe('1 501 FC');
    expect(formatMoney(-2500)).toBe('- 2 500 FC');
  });

  it('accepte une chaîne saisie avec virgule ou symboles', () => {
    expect(formatMoney('12500,40')).toBe('12 500 FC');
    expect(formatMoney('15 000 FC')).toBe('15 000 FC');
  });

  it('affiche 0 FC pour une valeur vide', () => {
    expect(formatMoney(null)).toBe('0 FC');
    expect(formatMoney(undefined)).toBe('0 FC');
    expect(formatMoney('')).toBe('0 FC');
  });
});

describe('formatDate', () => {
  it('renvoie un tiret pour une date absente ou invalide', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('pas une date')).toBe('—');
  });

  it('formate au format français', () => {
    expect(formatDate(new Date(2026, 9, 13))).toBe('13/10/2026');
  });
});

describe('toDateKey', () => {
  it('donne la date locale AAAA-MM-JJ', () => {
    expect(toDateKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});

describe('getAge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 13));
  });
  afterEach(() => vi.useRealTimers());

  it("compte les années révolues", () => {
    expect(getAge('2000-10-13')).toBe(26);
    expect(getAge('2000-10-14')).toBe(25);
  });

  it('renvoie null pour une date absente ou invalide', () => {
    expect(getAge(null)).toBeNull();
    expect(getAge('xx')).toBeNull();
  });
});

describe('daysBetween', () => {
  it('compte les jours entamés, au minimum 1', () => {
    expect(daysBetween('2026-10-01T08:00:00', '2026-10-01T09:00:00')).toBe(1);
    expect(daysBetween('2026-10-01T08:00:00', '2026-10-03T09:00:00')).toBe(3);
  });
});

describe('capitalize et statusBadge', () => {
  it('met une majuscule et remplace les soulignés', () => {
    expect(capitalize('en_attente')).toBe('En attente');
    expect(capitalize(null)).toBe('');
  });

  it('renvoie le libellé connu du statut', () => {
    expect(statusBadge(FACTURE_STATUTS, 'payée')).toEqual({ label: 'Payée', badge: 'badge-success' });
  });

  it('se rabat sur un badge neutre pour un statut inconnu', () => {
    expect(statusBadge(FACTURE_STATUTS, 'remboursée')).toEqual({ label: 'Remboursée', badge: 'badge-neutral' });
    expect(statusBadge(FACTURE_STATUTS, null)).toEqual({ label: '—', badge: 'badge-neutral' });
  });
});

describe('explainDbError', () => {
  it('traduit un refus de sécurité en message de rôle', () => {
    expect(explainDbError({ code: '42501', message: 'permission denied' })).toBe('Action non autorisée pour votre rôle.');
    expect(explainDbError({ message: 'new row violates row-level security policy' })).toBe('Action non autorisée pour votre rôle.');
  });

  it('transmet tel quel un message métier levé par la base', () => {
    const message = 'Examen « NFS » non payé : demandez au patient de régler sa demande à la caisse avant toute analyse.';
    expect(explainDbError({ code: 'P0001', message })).toBe(message);
  });

  it('indique le script à exécuter quand une fonction ou une table manque', () => {
    expect(explainDbError({ code: 'PGRST202', message: '' })).toContain('20261010_securite_roles.sql');
    expect(explainDbError({ code: '42P01', message: '' })).toContain('20261009_fonctionnalites_completes.sql');
  });

  it('gère une erreur absente', () => {
    expect(explainDbError(null)).toBe('Erreur inconnue.');
  });
});
