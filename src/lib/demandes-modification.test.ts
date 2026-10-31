import { describe, expect, it } from 'vitest';
import type { RolePersonnel } from '@/types';
import { roleLabels, hasAccess } from './role-permissions';
import { canMarkExecutee, canSignDirection, canSignMedecinChef, seesAllDemandes } from './demandes-modification';

const TOUS_LES_ROLES = Object.keys(roleLabels) as RolePersonnel[];

describe('accès aux demandes de modification', () => {
  it('permet à tout le personnel de faire une demande', () => {
    for (const role of TOUS_LES_ROLES) expect(hasAccess(role, 'demandes-modification')).toBe(true);
  });

  it('ne montre toutes les demandes qu\'au médecin chef et à la direction', () => {
    for (const role of TOUS_LES_ROLES) {
      expect(seesAllDemandes(role)).toBe(['super_admin', 'admin', 'medecin_chef'].includes(role));
    }
  });
});

describe('circuit de signature', () => {
  const attenteMC = { statut: 'en_attente_medecin_chef' as const, demandeur_id: 'agent' };
  const attenteDir = { statut: 'en_attente_direction' as const, demandeur_id: 'agent' };

  it('réserve la 2e signature au médecin chef, à la bonne étape', () => {
    expect(canSignMedecinChef('medecin_chef', 'mc', attenteMC)).toBe(true);
    expect(canSignMedecinChef('medecin', 'mc', attenteMC)).toBe(false);
    expect(canSignMedecinChef('super_admin', 'mc', attenteMC)).toBe(false);
    expect(canSignMedecinChef('medecin_chef', 'mc', attenteDir)).toBe(false);
  });

  it('réserve la décision finale à la direction, après le médecin chef', () => {
    expect(canSignDirection('admin', 'dir', attenteDir)).toBe(true);
    expect(canSignDirection('super_admin', 'dir', attenteDir)).toBe(true);
    expect(canSignDirection('admin', 'dir', attenteMC)).toBe(false);
    expect(canSignDirection('medecin_chef', 'dir', attenteDir)).toBe(false);
  });

  it('interdit de valider sa propre demande', () => {
    expect(canSignMedecinChef('medecin_chef', 'agent', attenteMC)).toBe(false);
    expect(canSignDirection('admin', 'agent', attenteDir)).toBe(false);
  });

  it("ne marque exécutée qu'une demande approuvée, par l'administration", () => {
    expect(canMarkExecutee('admin', { statut: 'approuvée' })).toBe(true);
    expect(canMarkExecutee('admin', { statut: 'rejetée' })).toBe(false);
    expect(canMarkExecutee('medecin_chef', { statut: 'approuvée' })).toBe(false);
  });
});
