import { describe, expect, it, vi } from 'vitest';
import type { ActeTarif } from '@/types';
import { grouperParFamille, parametresModele, statutDemande } from './lab-catalogue';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const a = (...statuts: string[]) => statuts.map((statut) => ({ statut }));

const examen = (libelle: string, famille: string | null, parametres: ActeTarif['parametres'] = []): ActeTarif => ({
  id: libelle, code: libelle.toUpperCase(), libelle, categorie: 'laboratoire', prix: 1000, actif: true, famille, parametres, created_at: '',
});

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

describe('grouperParFamille', () => {
  it('regroupe par famille dans l’ordre habituel, sans famille rangé dans « Autre »', () => {
    const groupes = grouperParFamille([
      examen('CRP', 'Biochimie'), examen('Scanner', null), examen('NFS', 'Hématologie'), examen('Glycémie', 'Biochimie'),
    ]);
    expect(groupes.map((g) => g.famille)).toEqual(['Hématologie', 'Biochimie', 'Autre']);
    expect(groupes[1].examens.map((e) => e.libelle)).toEqual(['CRP', 'Glycémie']);
  });

  it('range une famille inconnue en fin de liste, avec « Autre », par ordre alphabétique', () => {
    const groupes = grouperParFamille([examen('X', 'Autre'), examen('Y', 'Immunologie'), examen('Z', 'Urines')]);
    expect(groupes.map((g) => g.famille)).toEqual(['Urines', 'Autre', 'Immunologie']);
  });
});

describe('parametresModele', () => {
  it('prépare des paramètres vides à partir du modèle de l’examen', () => {
    expect(parametresModele({ parametres: [{ nom: 'Glycémie', unite: 'g/L', reference: '0,70 – 1,10' }, { nom: ' ' }] })).toEqual([
      { nom: 'Glycémie', unite: 'g/L', reference: '0,70 – 1,10', valeur: '', anormal: false },
    ]);
  });

  it('renvoie une liste vide sans modèle', () => {
    expect(parametresModele(null)).toEqual([]);
    expect(parametresModele({ parametres: null })).toEqual([]);
  });
});
