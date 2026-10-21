import { supabase } from '@/lib/supabase';
import { MODES_PAIEMENT, CATEGORIES_DEPENSES } from '@/lib/format';
import type { ReportDefinition } from './types';
import { fetchAll, iso, nom, sum, ratio, periodBuckets, groupBy } from './helpers';
import { fetchReglementsAssurance } from './assurances';

// Mêmes rôles que le module Dépenses (src/lib/role-permissions.ts)
const DEPENSE_ROLES: ReportDefinition['roles'] = ['super_admin', 'admin', 'caissier'];
const mode = (m?: string) => MODES_PAIEMENT[m || ''] || m || '—';
const categorie = (c?: string) => CATEGORIES_DEPENSES[c || ''] || c || '—';

function fetchDepenses(from: Date, to: Date) {
  return fetchAll((a, b) => supabase
    .from('depenses')
    .select('numero, date_depense, categorie, libelle, beneficiaire, montant, mode_paiement, reference, statut, motif_annulation, enregistreur:personnel!depenses_enregistre_par_fkey(nom, prenom)')
    .gte('date_depense', iso(from)).lte('date_depense', iso(to))
    .order('date_depense').range(a, b));
}

export const DEPENSE_REPORTS: ReportDefinition[] = [
  // ------------------------------------------------------------------
  {
    id: 'journal-depenses',
    category: 'finances',
    title: 'Journal des dépenses',
    description: 'Toutes les sorties de caisse de la période, avec les totaux par catégorie, par mode de paiement et par bénéficiaire.',
    roles: DEPENSE_ROLES,
    period: 'periode',
    defaultMode: 'mois',
    orientation: 'landscape',
    signatures: ['Le caissier', 'Le responsable financier', 'La direction'],
    run: async ({ period }) => {
      const p = period!;
      const toutes = await fetchDepenses(p.from, p.to);
      const depenses = toutes.filter((d: any) => d.statut !== 'annulée');
      const annulees = toutes.filter((d: any) => d.statut === 'annulée');
      const total = sum(depenses, (d: any) => d.montant);

      const parCategorie = Array.from(groupBy(depenses, (d: any) => categorie(d.categorie)), ([k, v]) => [k, v.length, sum(v, (d: any) => d.montant), ratio(sum(v, (d: any) => d.montant), total)])
        .sort((a, b) => (b[2] as number) - (a[2] as number));
      const parMode = Array.from(groupBy(depenses, (d: any) => mode(d.mode_paiement)), ([k, v]) => [k, v.length, sum(v, (d: any) => d.montant), ratio(sum(v, (d: any) => d.montant), total)]);
      const parBeneficiaire = Array.from(groupBy(depenses, (d: any) => d.beneficiaire?.trim() || 'Non renseigné'), ([k, v]) => [k, v.length, sum(v, (d: any) => d.montant)])
        .sort((a, b) => (b[2] as number) - (a[2] as number));

      return {
        kpis: [
          { label: 'Total des dépenses', value: total, type: 'money' },
          { label: 'Nombre de dépenses', value: depenses.length, type: 'number' },
          { label: 'Dépense moyenne', value: ratio(total, depenses.length), type: 'money' },
          { label: 'Premier poste', value: parCategorie.length ? String(parCategorie[0][0]) : '—', hint: parCategorie.length ? `${Math.round((parCategorie[0][3] as number) * 100)} % du total` : undefined },
          { label: 'Dépenses annulées', value: annulees.length, type: 'number', hint: 'Exclues des totaux' },
        ],
        sections: [
          {
            title: 'Détail des dépenses',
            columns: [
              { header: 'Date & heure', type: 'datetime', width: 13 },
              { header: 'N° pièce', width: 14 },
              { header: 'Catégorie', width: 15 },
              { header: 'Libellé', width: 22 },
              { header: 'Bénéficiaire', width: 14 },
              { header: 'Mode', width: 10 },
              { header: 'Enregistré par', width: 12 },
              { header: 'Montant', type: 'money', width: 12 },
            ],
            rows: depenses.map((d: any) => [d.date_depense, d.numero, categorie(d.categorie), d.reference ? `${d.libelle} (réf. ${d.reference})` : d.libelle, d.beneficiaire, mode(d.mode_paiement), nom(d.enregistreur), Number(d.montant)]),
            totals: ['TOTAL', `${depenses.length} dépense(s)`, '', '', '', '', '', total],
            emptyText: 'Aucune dépense sur la période.',
          },
          {
            title: 'Récapitulatif par catégorie',
            columns: [{ header: 'Catégorie', width: 40 }, { header: 'Dépenses', type: 'number', width: 20 }, { header: 'Montant', type: 'money', width: 25 }, { header: 'Part', type: 'percent', width: 15 }],
            rows: parCategorie,
            totals: ['TOTAL', depenses.length, total, total ? 1 : 0],
          },
          {
            title: 'Récapitulatif par mode de paiement',
            columns: [{ header: 'Mode de paiement', width: 40 }, { header: 'Dépenses', type: 'number', width: 20 }, { header: 'Montant', type: 'money', width: 25 }, { header: 'Part', type: 'percent', width: 15 }],
            rows: parMode,
            totals: ['TOTAL', depenses.length, total, total ? 1 : 0],
          },
          {
            title: 'Récapitulatif par bénéficiaire',
            columns: [{ header: 'Bénéficiaire / fournisseur', width: 50 }, { header: 'Dépenses', type: 'number', width: 20 }, { header: 'Montant', type: 'money', width: 30 }],
            rows: parBeneficiaire,
            totals: ['TOTAL', depenses.length, total],
          },
          {
            title: 'Dépenses annulées (non comptabilisées)',
            columns: [
              { header: 'Date', type: 'date', width: 12 }, { header: 'N° pièce', width: 16 }, { header: 'Libellé', width: 30 },
              { header: 'Motif de l’annulation', width: 28 }, { header: 'Montant', type: 'money', width: 14 },
            ],
            rows: annulees.map((d: any) => [d.date_depense, d.numero, d.libelle, d.motif_annulation, Number(d.montant)]),
            emptyText: 'Aucune dépense annulée sur la période.',
          },
        ],
      };
    },
  },

  // ------------------------------------------------------------------
  {
    id: 'situation-caisse',
    category: 'finances',
    title: 'Situation de caisse (entrées / sorties)',
    description: 'Encaissements des patients et des assureurs, dépenses de l’hôpital et solde de caisse, avec l’évolution, le solde cumulé et le détail par mode de paiement.',
    roles: DEPENSE_ROLES,
    period: 'periode',
    defaultMode: 'mois',
    orientation: 'landscape',
    signatures: ['Le caissier', 'Le responsable financier', 'La direction'],
    run: async ({ period }) => {
      const p = period!;
      const [paiementsPatients, toutes, reglementsAssurance] = await Promise.all([
        fetchAll((a, b) => supabase.from('paiements').select('montant, mode_paiement, date_paiement')
          .gte('date_paiement', iso(p.from)).lte('date_paiement', iso(p.to)).range(a, b)),
        fetchDepenses(p.from, p.to),
        fetchReglementsAssurance(p.from, p.to),
      ]);
      // Entrées : paiements des patients et règlements des assureurs
      const paiements = [...paiementsPatients, ...reglementsAssurance];
      const depenses = toutes.filter((d: any) => d.statut !== 'annulée');
      const entrees = sum(paiements, (x: any) => x.montant);
      const entreesAssurances = sum(reglementsAssurance, (x: any) => x.montant);
      const sorties = sum(depenses, (d: any) => d.montant);
      const especesEntrees = sum(paiements.filter((x: any) => x.mode_paiement === 'cash'), (x: any) => x.montant);
      const especesSorties = sum(depenses.filter((d: any) => d.mode_paiement === 'cash'), (d: any) => d.montant);

      const buckets = periodBuckets(p);
      let cumul = 0;
      const evolution = buckets.map((bk) => {
        const e = sum(paiements.filter((x: any) => bk.match(new Date(x.date_paiement))), (x: any) => x.montant);
        const s = sum(depenses.filter((d: any) => bk.match(new Date(d.date_depense))), (d: any) => d.montant);
        cumul += e - s;
        return [bk.label, e, s, e - s, cumul];
      }).filter((r) => p.mode !== 'jour' || (r[1] as number) > 0 || (r[2] as number) > 0);

      const modes = Array.from(new Set([...paiements.map((x: any) => x.mode_paiement), ...depenses.map((d: any) => d.mode_paiement)]));
      const parMode = modes.map((m) => {
        const e = sum(paiements.filter((x: any) => x.mode_paiement === m), (x: any) => x.montant);
        const s = sum(depenses.filter((d: any) => d.mode_paiement === m), (d: any) => d.montant);
        return [mode(m), e, s, e - s];
      });

      const parCategorie = Array.from(groupBy(depenses, (d: any) => categorie(d.categorie)), ([k, v]) => [k, sum(v, (d: any) => d.montant), ratio(sum(v, (d: any) => d.montant), sorties), ratio(sum(v, (d: any) => d.montant), entrees)])
        .sort((a, b) => (b[1] as number) - (a[1] as number));

      const solde = entrees - sorties;
      const evolutionIdx = evolution.map((r, i) => ((r[3] as number) < 0 ? i : -1)).filter((i) => i >= 0);

      return {
        kpis: [
          { label: 'Entrées (encaissements)', value: entrees, type: 'money', hint: entreesAssurances > 0 ? `dont ${Math.round(entreesAssurances).toLocaleString('fr-FR')} FC des assureurs` : `${paiements.length} paiement(s)` },
          { label: 'Sorties (dépenses)', value: sorties, type: 'money', hint: `${depenses.length} dépense(s)` },
          { label: 'Solde de caisse', value: solde, type: 'money', hint: solde < 0 ? 'Déficit : dépenses supérieures aux entrées' : 'Entrées − sorties' },
          { label: 'Solde en espèces', value: especesEntrees - especesSorties, type: 'money', hint: 'Montant attendu en caisse physique' },
          { label: 'Part des entrées dépensée', value: ratio(sorties, entrees), type: 'percent' },
        ],
        sections: [
          {
            title: p.mode === 'jour' ? 'Évolution par heure' : buckets.length && buckets[0].key.length > 7 ? 'Évolution par jour' : 'Évolution par mois',
            columns: [
              { header: 'Période', width: 24 }, { header: 'Entrées', type: 'money', width: 19 }, { header: 'Sorties', type: 'money', width: 19 },
              { header: 'Solde', type: 'money', width: 19 }, { header: 'Solde cumulé', type: 'money', width: 19 },
            ],
            rows: evolution,
            totals: ['TOTAL', entrees, sorties, solde, solde],
            highlightRows: evolutionIdx,
          },
          {
            title: 'Entrées et sorties par mode de paiement',
            columns: [{ header: 'Mode de paiement', width: 34 }, { header: 'Entrées', type: 'money', width: 22 }, { header: 'Sorties', type: 'money', width: 22 }, { header: 'Solde', type: 'money', width: 22 }],
            rows: parMode,
            totals: ['TOTAL', entrees, sorties, solde],
            highlightRows: parMode.map((r, i) => ((r[3] as number) < 0 ? i : -1)).filter((i) => i >= 0),
          },
          {
            title: 'Dépenses par catégorie',
            columns: [{ header: 'Catégorie', width: 40 }, { header: 'Montant', type: 'money', width: 24 }, { header: 'Part des dépenses', type: 'percent', width: 18 }, { header: 'Part des entrées', type: 'percent', width: 18 }],
            rows: parCategorie,
            totals: ['TOTAL', sorties, sorties ? 1 : 0, ratio(sorties, entrees)],
            emptyText: 'Aucune dépense sur la période.',
          },
        ],
        notes: [
          '« Entrées » : tous les paiements reçus des patients pendant la période. « Sorties » : les dépenses validées (les dépenses annulées sont exclues).',
          '« Solde en espèces » : entrées en espèces moins dépenses payées en espèces, à comparer avec le comptage de la caisse.',
          'Les lignes surlignées présentent un solde négatif.',
        ],
      };
    },
  },
];
