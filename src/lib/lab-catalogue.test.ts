import { describe, expect, it } from 'vitest';
import { findExamen, LAB_CATALOGUE, statutDemande } from './lab-catalogue';

const a = (...statuts: string[]) => statuts.map((statut) => ({ statut }));

describe('statutDemande', () => {
  it('est annulée quand tous les examens sont annulés (ou sans examen)', () => {
    expect(statutDemande(a('annulé', 'annulé'))).toBe('annulé');
    expect(statutDemande([])).toBe('annulé');
  });

  it('est terminée quand tous les examens actifs sont validés', () => {
    expect(statutDemande(a('terminé', 'terminé', 'annulé'))).toBe('terminé');
  });

  it("est en cours dès qu'un examen est en analyse ou validé", () => {
    expect(statutDemande(a('demandé', 'en_cours'))).toBe('en_cours');
    expect(statutDemande(a('prélevé', 'terminé'))).toBe('en_cours');
  });

  it('est demandée tant que rien n’est prélevé', () => {
    expect(statutDemande(a('demandé', 'demandé', 'annulé'))).toBe('demandé');
  });

  it('est prélevée quand des échantillons sont pris mais pas encore analysés', () => {
    expect(statutDemande(a('demandé', 'prélevé'))).toBe('prélevé');
  });
});

describe('findExamen', () => {
  it('trouve un examen par son code ou son nom, sans tenir compte de la casse', () => {
    expect(findExamen('nfs')?.code).toBe('NFS');
    expect(findExamen('GLYCÉMIE À JEUN')?.code).toBe('GLY');
  });

  it('renvoie undefined pour un examen hors catalogue ou vide', () => {
    expect(findExamen('Scanner cérébral')).toBeUndefined();
    expect(findExamen(null)).toBeUndefined();
  });

  it('a des codes uniques et au moins un paramètre par examen', () => {
    const codes = LAB_CATALOGUE.map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const e of LAB_CATALOGUE) expect(e.parametres.length).toBeGreaterThan(0);
  });
});
