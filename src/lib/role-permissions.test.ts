import { describe, expect, it } from 'vitest';
import type { RolePersonnel } from '@/types';
import {
  canDeleteFacture, canManagePatients, canProcessLab, getDefaultRoute, hasAccess, hasRouteAccess, roleLabels,
} from './role-permissions';

const TOUS_LES_ROLES = Object.keys(roleLabels) as RolePersonnel[];

describe('hasAccess', () => {
  it('donne tous les modules au super administrateur', () => {
    for (const m of ['patients', 'pharmacie', 'laboratoire', 'facturation', 'audit'] as const) {
      expect(hasAccess('super_admin', m)).toBe(true);
    }
  });

  it("n'ouvre plus la pharmacie au médecin, mais lui laisse le laboratoire", () => {
    expect(hasAccess('medecin', 'pharmacie')).toBe(false);
    expect(hasAccess('medecin', 'laboratoire')).toBe(true);
  });

  it('limite le caissier à la facturation', () => {
    expect(hasAccess('caissier', 'facturation')).toBe(true);
    expect(hasAccess('caissier', 'patients')).toBe(false);
    expect(hasAccess('caissier', 'consultations')).toBe(false);
  });

  it("réserve l'audit et le personnel à l'administration", () => {
    for (const role of TOUS_LES_ROLES) {
      const admin = role === 'super_admin' || role === 'admin';
      expect(hasAccess(role, 'audit')).toBe(admin);
      expect(hasAccess(role, 'personnel')).toBe(admin);
    }
  });

  it('laisse le profil accessible à tous', () => {
    for (const role of TOUS_LES_ROLES) expect(hasAccess(role, 'profil')).toBe(true);
  });
});

describe('hasRouteAccess', () => {
  it('autorise toujours la page de connexion', () => {
    expect(hasRouteAccess('caissier', '/login')).toBe(true);
  });

  it('applique le module de la route, sous-pages comprises', () => {
    expect(hasRouteAccess('pharmacien', '/pharmacie/nouveau')).toBe(true);
    expect(hasRouteAccess('medecin', '/pharmacie/rapports')).toBe(false);
    expect(hasRouteAccess('caissier', '/facturation/123/edit')).toBe(true);
  });

  it('refuse une route inconnue', () => {
    expect(hasRouteAccess('super_admin', '/inconnue')).toBe(false);
  });
});

describe('getDefaultRoute', () => {
  it('renvoie le tableau de bord', () => {
    expect(getDefaultRoute('pharmacien')).toBe('/');
  });
});

describe('canManagePatients', () => {
  it('laisse le technicien de laboratoire et le caissier en lecture seule', () => {
    expect(canManagePatients('technicien_labo')).toBe(false);
    expect(canManagePatients('caissier')).toBe(false);
    expect(canManagePatients(null)).toBe(false);
  });

  it("autorise l'accueil et les soignants", () => {
    expect(canManagePatients('receptionniste')).toBe(true);
    expect(canManagePatients('medecin')).toBe(true);
    expect(canManagePatients('infirmier')).toBe(true);
  });
});

describe('canProcessLab', () => {
  it('réserve le traitement des analyses au laboratoire et au super administrateur', () => {
    for (const role of TOUS_LES_ROLES) {
      expect(canProcessLab(role)).toBe(role === 'technicien_labo' || role === 'super_admin');
    }
    expect(canProcessLab(undefined)).toBe(false);
  });
});

describe('canDeleteFacture', () => {
  const annulee = { statut: 'annulée', paiements: [] };

  it('permet aux seuls administrateurs de supprimer une facture annulée', () => {
    for (const role of TOUS_LES_ROLES) {
      expect(canDeleteFacture(role, annulee)).toBe(role === 'super_admin' || role === 'admin');
    }
  });

  it("refuse la suppression d'une facture non annulée", () => {
    for (const statut of ['en_attente', 'partielle', 'payée']) {
      expect(canDeleteFacture('super_admin', { statut })).toBe(false);
    }
  });

  it("refuse la suppression d'une facture qui porte des paiements", () => {
    expect(canDeleteFacture('admin', { statut: 'annulée', paiements: [{ montant: 1000 }] })).toBe(false);
  });

  it('refuse sans profil connecté', () => {
    expect(canDeleteFacture(null, annulee)).toBe(false);
  });
});
