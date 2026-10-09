import type { ParametreAnalyse } from '@/types';

// =====================================================
// Catalogue des examens de laboratoire
// Chaque examen propose des paramètres pré-remplis (unité et valeurs de
// référence adulte) pour accélérer la saisie des résultats.
// =====================================================

export type ExamenCatalogue = {
  code: string;
  nom: string;
  categorie: 'Hématologie' | 'Biochimie' | 'Parasitologie' | 'Sérologie' | 'Urines' | 'Autre';
  parametres: Omit<ParametreAnalyse, 'valeur' | 'anormal'>[];
};

export const LAB_CATALOGUE: ExamenCatalogue[] = [
  {
    code: 'NFS', nom: 'Hémogramme complet (NFS)', categorie: 'Hématologie',
    parametres: [
      { nom: 'Hémoglobine', unite: 'g/dL', reference: '12 – 16' },
      { nom: 'Hématocrite', unite: '%', reference: '37 – 47' },
      { nom: 'Globules rouges', unite: 'M/mm³', reference: '4,2 – 5,4' },
      { nom: 'Globules blancs', unite: '/mm³', reference: '4 000 – 10 000' },
      { nom: 'Neutrophiles', unite: '%', reference: '40 – 75' },
      { nom: 'Lymphocytes', unite: '%', reference: '20 – 45' },
      { nom: 'Plaquettes', unite: '/mm³', reference: '150 000 – 400 000' },
    ],
  },
  {
    code: 'GE', nom: 'Goutte épaisse / TDR paludisme', categorie: 'Parasitologie',
    parametres: [
      { nom: 'Résultat', unite: '', reference: 'Négatif' },
      { nom: 'Espèce', unite: '', reference: '—' },
      { nom: 'Densité parasitaire', unite: 'trophozoïtes/µL', reference: '0' },
    ],
  },
  {
    code: 'GLY', nom: 'Glycémie à jeun', categorie: 'Biochimie',
    parametres: [{ nom: 'Glycémie', unite: 'g/L', reference: '0,70 – 1,10' }],
  },
  {
    code: 'HBA1C', nom: 'Hémoglobine glyquée (HbA1c)', categorie: 'Biochimie',
    parametres: [{ nom: 'HbA1c', unite: '%', reference: '< 6,5' }],
  },
  {
    code: 'LIP', nom: 'Bilan lipidique', categorie: 'Biochimie',
    parametres: [
      { nom: 'Cholestérol total', unite: 'g/L', reference: '< 2,00' },
      { nom: 'HDL-cholestérol', unite: 'g/L', reference: '> 0,40' },
      { nom: 'LDL-cholestérol', unite: 'g/L', reference: '< 1,60' },
      { nom: 'Triglycérides', unite: 'g/L', reference: '< 1,50' },
    ],
  },
  {
    code: 'HEP', nom: 'Bilan hépatique', categorie: 'Biochimie',
    parametres: [
      { nom: 'ASAT (TGO)', unite: 'UI/L', reference: '< 40' },
      { nom: 'ALAT (TGP)', unite: 'UI/L', reference: '< 40' },
      { nom: 'Bilirubine totale', unite: 'mg/L', reference: '< 10' },
      { nom: 'Phosphatases alcalines', unite: 'UI/L', reference: '40 – 130' },
    ],
  },
  {
    code: 'REN', nom: 'Bilan rénal', categorie: 'Biochimie',
    parametres: [
      { nom: 'Urée', unite: 'g/L', reference: '0,15 – 0,45' },
      { nom: 'Créatinine', unite: 'mg/L', reference: '6 – 12' },
    ],
  },
  {
    code: 'CRP', nom: 'Protéine C réactive (CRP)', categorie: 'Biochimie',
    parametres: [{ nom: 'CRP', unite: 'mg/L', reference: '< 6' }],
  },
  {
    code: 'GS', nom: 'Groupe sanguin & Rhésus', categorie: 'Hématologie',
    parametres: [
      { nom: 'Groupe ABO', unite: '', reference: '—' },
      { nom: 'Rhésus', unite: '', reference: '—' },
    ],
  },
  {
    code: 'WIDAL', nom: 'Sérodiagnostic de Widal', categorie: 'Sérologie',
    parametres: [
      { nom: 'Antigène O', unite: '', reference: '< 1/80' },
      { nom: 'Antigène H', unite: '', reference: '< 1/160' },
    ],
  },
  {
    code: 'VIH', nom: 'Sérologie VIH', categorie: 'Sérologie',
    parametres: [{ nom: 'Résultat', unite: '', reference: 'Négatif' }],
  },
  {
    code: 'HCG', nom: 'Test de grossesse (β-HCG)', categorie: 'Sérologie',
    parametres: [{ nom: 'β-HCG', unite: '', reference: 'Négatif' }],
  },
  {
    code: 'ECBU', nom: 'Examen cytobactériologique des urines (ECBU)', categorie: 'Urines',
    parametres: [
      { nom: 'Leucocytes', unite: '/mm³', reference: '< 10' },
      { nom: 'Hématies', unite: '/mm³', reference: '< 10' },
      { nom: 'Culture', unite: '', reference: 'Stérile' },
    ],
  },
  {
    code: 'SELLES', nom: 'Examen parasitologique des selles (KAOP)', categorie: 'Parasitologie',
    parametres: [{ nom: 'Résultat', unite: '', reference: 'Absence de parasites' }],
  },
];

export function findExamen(typeAnalyse?: string | null): ExamenCatalogue | undefined {
  if (!typeAnalyse) return undefined;
  const t = typeAnalyse.toLowerCase();
  return LAB_CATALOGUE.find((e) => e.nom.toLowerCase() === t || e.code.toLowerCase() === t);
}
