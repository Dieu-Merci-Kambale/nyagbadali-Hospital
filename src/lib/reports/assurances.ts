import { supabase } from '@/lib/supabase';
import { MODES_PAIEMENT } from '@/lib/format';
import { BORDEREAU_STATUTS, CREANCE_STATUTS, LITIGE_STATUTS, MOTIFS_LITIGE, STATUTS_OUVERTS, TRANCHES_ANCIENNETE, trancheAnciennete } from '@/lib/assurances';
import type { CreanceAssurance } from '@/lib/assurances';
import type { ReportDefinition, ReportFilter, ReportSection } from './types';
import { fetchAll, iso, sum, ratio, groupBy, daysBetween } from './helpers';

// Mêmes rôles que le module Assurances (src/lib/role-permissions.ts)
const ASSURANCE_ROLES: ReportDefinition['roles'] = ['super_admin', 'admin', 'caissier'];
const mode = (m?: string) => MODES_PAIEMENT[m || ''] || m || '—';
const patient = (c: { patient_prenom?: string; patient_nom?: string }) => `${c.patient_prenom || ''} ${String(c.patient_nom || '').toUpperCase()}`.trim();
const statut = (s: string) => CREANCE_STATUTS[s as keyof typeof CREANCE_STATUTS]?.label || s;

const FILTRE_ASSUREUR: ReportFilter = {
  key: 'assureur',
  label: 'Assureur',
  defaultValue: 'tous',
  options: [{ value: 'tous', label: 'Tous les assureurs' }],
  loadOptions: async () => {
    const { data } = await supabase.from('assureurs').select('id, nom, actif').order('nom');
    return (data || []).map((a: { id: string; nom: string; actif: boolean }) => ({ value: a.id, label: a.actif ? a.nom : `${a.nom} (désactivé)` }));
  },
};

/**
 * Règlements validés des assureurs sur une période, pour les rapports de caisse :
 * ils sont comptabilisés dans les encaissements. Liste vide si le module n'est pas installé.
 */
export async function fetchReglementsAssurance(from: Date, to: Date) {
  try {
    return await fetchAll((a, b) => supabase.from('paiements_assurance')
      .select('numero, montant, mode_paiement, reference, date_paiement, assureurs(nom), recu:personnel(nom, prenom)')
      .eq('statut', 'validé').gte('date_paiement', iso(from)).lte('date_paiement', iso(to))
      .order('date_paiement').range(a, b));
  } catch {
    return [];
  }
}

const parAssureur = (filters: Record<string, string>) => (filters.assureur && filters.assureur !== 'tous' ? filters.assureur : null);

/** Part assurance d'origine (avant report au patient) */
const prisEnCharge = (c: CreanceAssurance) => Number(c.montant_assurance) + Number(c.transfere);

export const ASSURANCE_REPORTS: ReportDefinition[] = [
  // ------------------------------------------------------------------
  {
    id: 'releve-assurances',
    category: 'assurances',
    title: 'Relevé des assurances (payées et non payées)',
    description: 'Par assureur : parts prises en charge sur la période, réglées, contestées, reportées aux patients, abandonnées et restant dues, avec le détail des factures payées et non payées.',
    roles: ASSURANCE_ROLES,
    period: 'periode',
    defaultMode: 'mois',
    orientation: 'landscape',
    filters: [
      FILTRE_ASSUREUR,
      {
        key: 'situation', label: 'Factures', defaultValue: 'toutes',
        options: [{ value: 'toutes', label: 'Payées et non payées' }, { value: 'non_payees', label: 'Non payées seulement' }, { value: 'payees', label: 'Payées seulement' }],
      },
    ],
    signatures: ['Le caissier', 'Le responsable financier', "Visa de l'assureur"],
    run: async ({ period, filters }) => {
      const p = period!;
      const assureur = parAssureur(filters);
      const toutes = await fetchAll<CreanceAssurance>((a, b) => {
        let q = supabase.from('v_creances_assurance').select('*')
          .gte('date_facture', iso(p.from)).lte('date_facture', iso(p.to)).neq('statut_facture', 'annulée');
        if (assureur) q = q.eq('assureur_id', assureur);
        return q.order('date_facture').range(a, b);
      });
      const nonPayees = toutes.filter((c) => Number(c.reste) > 0);
      const payees = toutes.filter((c) => Number(c.reste) <= 0 && Number(c.paye) > 0);
      const reportees = toutes.filter((c) => Number(c.transfere) > 0 || Number(c.abandonne) > 0);

      const pris = sum(toutes, prisEnCharge);
      const regle = sum(toutes, (c) => c.paye);
      const reste = sum(toutes, (c) => c.reste);
      const synthese = Array.from(groupBy(toutes, (c) => c.assureur_nom || 'Assureur non rattaché'), ([k, v]) => [
        k, v.length, sum(v, prisEnCharge), sum(v, (c) => c.paye), sum(v, (c) => c.montant_conteste), sum(v, (c) => c.transfere),
        sum(v, (c) => c.abandonne), sum(v, (c) => c.reste), ratio(sum(v, (c) => c.paye), sum(v, (c) => c.paye) + sum(v, (c) => c.reste)),
      ]).sort((a, b) => (b[7] as number) - (a[7] as number));

      const detail = (rows: CreanceAssurance[]) => rows.map((c) => [
        c.assureur_nom, c.date_facture, c.numero_facture, patient(c), c.numero_assurance, c.bordereau_numero || 'Non réclamée',
        statut(c.statut_assurance), prisEnCharge(c), Number(c.paye), Number(c.reste),
      ]);
      const colonnesDetail = [
        { header: 'Assureur', width: 12 }, { header: 'Date', type: 'date' as const, width: 8 }, { header: 'Facture', width: 13 },
        { header: 'Patient', width: 16 }, { header: 'N° assuré', width: 10 }, { header: 'Bordereau', width: 12 }, { header: 'Situation', width: 11 },
        { header: 'Pris en charge', type: 'money' as const, width: 10 }, { header: 'Réglé', type: 'money' as const, width: 9 }, { header: 'Reste dû', type: 'money' as const, width: 9 },
      ];
      const sections: ReportSection[] = [
        {
          title: 'Synthèse par assureur',
          columns: [
            { header: 'Assureur', width: 18 }, { header: 'Factures', type: 'number' as const, width: 7 }, { header: 'Pris en charge', type: 'money' as const, width: 11 },
            { header: 'Réglé', type: 'money' as const, width: 11 }, { header: 'Contesté', type: 'money' as const, width: 10 }, { header: 'Reporté patients', type: 'money' as const, width: 10 },
            { header: 'Abandonné', type: 'money' as const, width: 10 }, { header: 'Reste dû', type: 'money' as const, width: 11 }, { header: 'Recouvrement', type: 'percent' as const, width: 9 },
          ],
          rows: synthese,
          totals: ['TOTAL', toutes.length, pris, regle, sum(toutes, (c) => c.montant_conteste), sum(toutes, (c) => c.transfere), sum(toutes, (c) => c.abandonne), reste, ratio(regle, regle + reste)],
          emptyText: 'Aucune prise en charge sur la période.',
        },
      ];
      if (filters.situation !== 'payees') {
        sections.push({
          title: `Factures non payées (${nonPayees.length})`,
          columns: colonnesDetail,
          rows: detail(nonPayees),
          totals: ['TOTAL', '', '', '', '', '', '', sum(nonPayees, prisEnCharge), sum(nonPayees, (c) => c.paye), sum(nonPayees, (c) => c.reste)],
          emptyText: 'Toutes les parts assurance de la période sont réglées.',
        });
      }
      if (filters.situation !== 'non_payees') {
        sections.push({
          title: `Factures payées (${payees.length})`,
          columns: colonnesDetail,
          rows: detail(payees),
          totals: ['TOTAL', '', '', '', '', '', '', sum(payees, prisEnCharge), sum(payees, (c) => c.paye), 0],
          emptyText: 'Aucune facture entièrement réglée par un assureur sur la période.',
        });
      }
      if (reportees.length) {
        sections.push({
          title: 'Montants refusés : reportés aux patients ou abandonnés',
          columns: [
            { header: 'Assureur', width: 16 }, { header: 'Facture', width: 16 }, { header: 'Patient', width: 22 },
            { header: 'Reporté au patient', type: 'money' as const, width: 16 }, { header: 'Abandonné (perte)', type: 'money' as const, width: 16 },
          ],
          rows: reportees.map((c) => [c.assureur_nom, c.numero_facture, patient(c), Number(c.transfere), Number(c.abandonne)]),
          totals: ['TOTAL', '', '', sum(reportees, (c) => c.transfere), sum(reportees, (c) => c.abandonne)],
        });
      }
      return {
        kpis: [
          { label: 'Pris en charge', value: pris, type: 'money', hint: `${toutes.length} facture(s)` },
          { label: 'Réglé par les assureurs', value: regle, type: 'money', hint: `${payees.length} facture(s) soldée(s)` },
          { label: 'Reste dû', value: reste, type: 'money', hint: `${nonPayees.length} facture(s) non payée(s)` },
          { label: 'Montants contestés', value: sum(toutes, (c) => c.montant_conteste), type: 'money' },
          { label: 'Taux de recouvrement', value: ratio(regle, regle + reste), type: 'percent' },
        ],
        sections,
        notes: [
          'Période appliquée à la date des factures. « Réglé » comprend les règlements reçus jusqu’à aujourd’hui.',
          '« Pris en charge » = part assurance initiale ; une part reportée au patient après litige n’est plus due par l’assureur.',
        ],
      };
    },
  },

  // ------------------------------------------------------------------
  {
    id: 'balance-agee-assurances',
    category: 'assurances',
    title: 'Balance âgée des assureurs',
    description: 'État à date des sommes dues par chaque assureur, réparties par ancienneté des factures, avec les échéances dépassées et les montants en litige.',
    roles: ASSURANCE_ROLES,
    period: 'aucune',
    orientation: 'landscape',
    filters: [FILTRE_ASSUREUR],
    signatures: ['Le responsable financier', 'La direction'],
    run: async ({ filters }) => {
      const assureur = parAssureur(filters);
      const rows = await fetchAll<CreanceAssurance>((a, b) => {
        let q = supabase.from('v_creances_assurance').select('*').gt('reste', 0).neq('statut_facture', 'annulée');
        if (assureur) q = q.eq('assureur_id', assureur);
        return q.order('date_facture').range(a, b);
      });
      const ouvertes = rows.filter((c) => STATUTS_OUVERTS.includes(c.statut_assurance));
      const total = sum(ouvertes, (c) => c.reste);
      const parTranche = (list: CreanceAssurance[]) => TRANCHES_ANCIENNETE.map((t) => sum(list.filter((c) => trancheAnciennete(c.date_facture) === t), (c) => c.reste));
      const lignes = Array.from(groupBy(ouvertes, (c) => c.assureur_nom || 'Assureur non rattaché'), ([k, v]) => [
        k, v.length, ...parTranche(v), sum(v, (c) => c.reste), sum(v.filter((c) => c.en_retard), (c) => c.reste), sum(v, (c) => c.montant_conteste),
      ]).sort((a, b) => (b[6] as number) - (a[6] as number));
      const tranches = parTranche(ouvertes);
      const plus90 = tranches[3];
      return {
        kpis: [
          { label: 'Total dû par les assureurs', value: total, type: 'money', hint: `${ouvertes.length} facture(s)` },
          { label: 'Échéances dépassées', value: sum(ouvertes.filter((c) => c.en_retard), (c) => c.reste), type: 'money' },
          { label: 'Créances de plus de 90 jours', value: plus90, type: 'money', hint: `${Math.round(ratio(plus90, total) * 100)} % du total` },
          { label: 'Non encore réclamé', value: sum(ouvertes.filter((c) => !c.bordereau_id), (c) => c.reste), type: 'money', hint: 'Hors bordereau' },
        ],
        sections: [
          {
            title: 'Balance âgée par assureur (ancienneté depuis la date de facture)',
            columns: [
              { header: 'Assureur', width: 18 }, { header: 'Factures', type: 'number', width: 7 },
              ...TRANCHES_ANCIENNETE.map((t) => ({ header: t, type: 'money' as const, width: 11 })),
              { header: 'Total dû', type: 'money', width: 12 }, { header: 'Dont échu', type: 'money', width: 10 }, { header: 'En litige', type: 'money', width: 10 },
            ],
            rows: lignes,
            totals: ['TOTAL', ouvertes.length, ...tranches, total, sum(ouvertes.filter((c) => c.en_retard), (c) => c.reste), sum(ouvertes, (c) => c.montant_conteste)],
            emptyText: 'Aucune somme due par les assureurs.',
          },
          {
            title: 'Factures dont l’échéance est dépassée',
            columns: [
              { header: 'Assureur', width: 14 }, { header: 'Facture', width: 14 }, { header: 'Patient', width: 18 }, { header: 'Bordereau', width: 13 },
              { header: 'Échéance', type: 'date', width: 10 }, { header: 'Jours de retard', type: 'number', width: 10 }, { header: 'Reste dû', type: 'money', width: 11 },
            ],
            rows: ouvertes.filter((c) => c.en_retard).map((c) => [c.assureur_nom, c.numero_facture, patient(c), c.bordereau_numero, c.date_echeance, daysBetween(c.date_echeance as string), Number(c.reste)]),
            emptyText: 'Aucune échéance dépassée.',
          },
        ],
      };
    },
  },

  // ------------------------------------------------------------------
  {
    id: 'reglements-assurances',
    category: 'assurances',
    title: 'Journal des règlements des assureurs',
    description: 'Paiements reçus des assureurs sur la période (comptabilisés dans les encaissements), par assureur et par mode de règlement.',
    roles: ASSURANCE_ROLES,
    period: 'periode',
    defaultMode: 'mois',
    orientation: 'landscape',
    filters: [FILTRE_ASSUREUR],
    signatures: ['Le caissier', 'Le responsable financier'],
    run: async ({ period, filters }) => {
      const p = period!;
      const assureur = parAssureur(filters);
      const tous = await fetchAll((a, b) => {
        let q = supabase.from('paiements_assurance')
          .select('numero, date_paiement, montant, mode_paiement, reference, statut, motif_annulation, assureurs(nom), bordereaux_assurance(numero), paiements_assurance_factures(montant)')
          .gte('date_paiement', iso(p.from)).lte('date_paiement', iso(p.to));
        if (assureur) q = q.eq('assureur_id', assureur);
        return q.order('date_paiement').range(a, b);
      });
      const valides = tous.filter((r: any) => r.statut !== 'annulé');
      const annules = tous.filter((r: any) => r.statut === 'annulé');
      const total = sum(valides, (r: any) => r.montant);
      return {
        kpis: [
          { label: 'Total reçu des assureurs', value: total, type: 'money' },
          { label: 'Règlements', value: valides.length, type: 'number' },
          { label: 'Règlement moyen', value: ratio(total, valides.length), type: 'money' },
          { label: 'Règlements annulés', value: annules.length, type: 'number', hint: 'Exclus des totaux' },
        ],
        sections: [
          {
            title: 'Détail des règlements',
            columns: [
              { header: 'Date', type: 'datetime', width: 12 }, { header: 'N° règlement', width: 14 }, { header: 'Assureur', width: 16 },
              { header: 'Bordereau', width: 13 }, { header: 'Mode', width: 11 }, { header: 'Référence', width: 13 },
              { header: 'Factures', type: 'number', width: 7 }, { header: 'Montant', type: 'money', width: 12 },
            ],
            rows: valides.map((r: any) => [r.date_paiement, r.numero, r.assureurs?.nom, r.bordereaux_assurance?.numero, mode(r.mode_paiement), r.reference, (r.paiements_assurance_factures || []).length, Number(r.montant)]),
            totals: ['TOTAL', `${valides.length} règlement(s)`, '', '', '', '', '', total],
            emptyText: 'Aucun règlement reçu sur la période.',
          },
          {
            title: 'Récapitulatif par assureur',
            columns: [{ header: 'Assureur', width: 45 }, { header: 'Règlements', type: 'number', width: 15 }, { header: 'Montant', type: 'money', width: 25 }, { header: 'Part', type: 'percent', width: 15 }],
            rows: Array.from(groupBy(valides, (r: any) => r.assureurs?.nom || '—'), ([k, v]) => [k, v.length, sum(v, (r: any) => r.montant), ratio(sum(v, (r: any) => r.montant), total)])
              .sort((a, b) => (b[2] as number) - (a[2] as number)),
            totals: ['TOTAL', valides.length, total, total ? 1 : 0],
          },
          {
            title: 'Récapitulatif par mode de règlement',
            columns: [{ header: 'Mode', width: 45 }, { header: 'Règlements', type: 'number', width: 15 }, { header: 'Montant', type: 'money', width: 25 }, { header: 'Part', type: 'percent', width: 15 }],
            rows: Array.from(groupBy(valides, (r: any) => mode(r.mode_paiement)), ([k, v]) => [k, v.length, sum(v, (r: any) => r.montant), ratio(sum(v, (r: any) => r.montant), total)]),
            totals: ['TOTAL', valides.length, total, total ? 1 : 0],
          },
          {
            title: 'Règlements annulés (non comptabilisés)',
            columns: [{ header: 'Date', type: 'date', width: 14 }, { header: 'N° règlement', width: 18 }, { header: 'Assureur', width: 20 }, { header: 'Motif', width: 32 }, { header: 'Montant', type: 'money', width: 16 }],
            rows: annules.map((r: any) => [r.date_paiement, r.numero, r.assureurs?.nom, r.motif_annulation, Number(r.montant)]),
            emptyText: 'Aucun règlement annulé sur la période.',
          },
        ],
      };
    },
  },

  // ------------------------------------------------------------------
  {
    id: 'bordereaux-assurances',
    category: 'assurances',
    title: 'Suivi des bordereaux',
    description: 'Bordereaux émis sur la période : montants réclamés, réglés et restant dus, échéances et délai réel de paiement des assureurs.',
    roles: ASSURANCE_ROLES,
    period: 'periode',
    defaultMode: 'annee',
    orientation: 'landscape',
    filters: [FILTRE_ASSUREUR],
    signatures: ['Le responsable financier'],
    run: async ({ period, filters }) => {
      const p = period!;
      const assureur = parAssureur(filters);
      const [bordereaux, reglements] = await Promise.all([
        fetchAll((a, b) => {
          let q = supabase.from('v_bordereaux_assurance').select('*').gte('date_emission', iso(p.from)).lte('date_emission', iso(p.to)).neq('statut', 'annulé');
          if (assureur) q = q.eq('assureur_id', assureur);
          return q.order('date_emission').range(a, b);
        }),
        fetchAll((a, b) => supabase.from('paiements_assurance').select('bordereau_id, date_paiement').eq('statut', 'validé').not('bordereau_id', 'is', null).range(a, b)),
      ]);
      const dernierReglement = new Map<string, string>();
      for (const r of reglements as { bordereau_id: string; date_paiement: string }[]) {
        const d = dernierReglement.get(r.bordereau_id);
        if (!d || r.date_paiement > d) dernierReglement.set(r.bordereau_id, r.date_paiement);
      }
      const payes = bordereaux.filter((b: any) => b.statut_calcule === 'payé' && b.date_envoi && dernierReglement.has(b.id));
      const delaiMoyen = payes.length ? sum(payes, (b: any) => daysBetween(b.date_envoi, dernierReglement.get(b.id))) / payes.length : 0;
      const montant = sum(bordereaux, (b: any) => b.montant);
      const regle = sum(bordereaux, (b: any) => b.paye);
      return {
        kpis: [
          { label: 'Bordereaux émis', value: bordereaux.length, type: 'number' },
          { label: 'Montant réclamé', value: montant, type: 'money' },
          { label: 'Réglé', value: regle, type: 'money', hint: `${Math.round(ratio(regle, montant) * 100)} % du réclamé` },
          { label: 'Reste dû', value: sum(bordereaux, (b: any) => b.reste), type: 'money' },
          { label: 'Délai moyen de paiement', value: `${Math.round(delaiMoyen)} j`, hint: `${payes.length} bordereau(x) soldé(s)` },
        ],
        sections: [
          {
            title: 'Bordereaux de la période',
            columns: [
              { header: 'N° bordereau', width: 13 }, { header: 'Assureur', width: 14 }, { header: 'Émis le', type: 'date', width: 9 }, { header: 'Envoyé le', type: 'date', width: 9 },
              { header: 'Échéance', type: 'date', width: 9 }, { header: 'Statut', width: 10 }, { header: 'Factures', type: 'number', width: 7 },
              { header: 'Réclamé', type: 'money', width: 10 }, { header: 'Réglé', type: 'money', width: 10 }, { header: 'Reste', type: 'money', width: 9 },
            ],
            rows: bordereaux.map((b: any) => [b.numero, b.assureur_nom, b.date_emission, b.date_envoi, b.date_echeance, BORDEREAU_STATUTS[b.statut_calcule as keyof typeof BORDEREAU_STATUTS]?.label || b.statut_calcule, b.nb_factures, Number(b.montant), Number(b.paye), Number(b.reste)]),
            totals: ['TOTAL', '', '', '', '', '', sum(bordereaux, (b: any) => b.nb_factures), montant, regle, sum(bordereaux, (b: any) => b.reste)],
            highlightRows: bordereaux.map((b: any, i: number) => (b.en_retard ? i : -1)).filter((i: number) => i >= 0),
            emptyText: 'Aucun bordereau émis sur la période.',
          },
          {
            title: 'Par assureur',
            columns: [{ header: 'Assureur', width: 34 }, { header: 'Bordereaux', type: 'number', width: 13 }, { header: 'Réclamé', type: 'money', width: 18 }, { header: 'Réglé', type: 'money', width: 18 }, { header: 'Reste', type: 'money', width: 17 }],
            rows: Array.from(groupBy(bordereaux, (b: any) => b.assureur_nom), ([k, v]) => [k, v.length, sum(v, (b: any) => b.montant), sum(v, (b: any) => b.paye), sum(v, (b: any) => b.reste)]),
            totals: ['TOTAL', bordereaux.length, montant, regle, sum(bordereaux, (b: any) => b.reste)],
          },
        ],
        notes: ['Lignes en évidence : échéance de paiement dépassée. Bordereaux annulés exclus.'],
      };
    },
  },

  // ------------------------------------------------------------------
  {
    id: 'litiges-assurances',
    category: 'assurances',
    title: 'Litiges avec les assureurs',
    description: 'Litiges ouverts sur la période par motif et par assureur, décisions (payé par l’assureur, reporté au patient, abandonné) et durée de traitement.',
    roles: ASSURANCE_ROLES,
    period: 'periode',
    defaultMode: 'annee',
    orientation: 'landscape',
    filters: [FILTRE_ASSUREUR],
    signatures: ['Le responsable financier', 'La direction'],
    run: async ({ period, filters }) => {
      const p = period!;
      const assureur = parAssureur(filters);
      const litiges = await fetchAll((a, b) => {
        let q = supabase.from('litiges_assurance')
          .select('*, assureurs(nom), factures(numero_facture, patients(nom, prenom))')
          .gte('date_ouverture', iso(p.from)).lte('date_ouverture', iso(p.to)).neq('statut', 'annulé');
        if (assureur) q = q.eq('assureur_id', assureur);
        return q.order('date_ouverture').range(a, b);
      });
      const resolus = litiges.filter((l: any) => l.statut === 'résolu');
      const ouverts = litiges.filter((l: any) => l.statut === 'ouvert' || l.statut === 'en_cours');
      const conteste = sum(litiges, (l: any) => l.montant_conteste);
      const accepte = sum(resolus, (l: any) => l.montant_accepte);
      const duree = resolus.length ? sum(resolus, (l: any) => daysBetween(l.date_ouverture, l.date_resolution)) / resolus.length : 0;
      const motif = (m: string) => MOTIFS_LITIGE[m as keyof typeof MOTIFS_LITIGE] || m;
      const recap = (key: (l: any) => string) => Array.from(groupBy(litiges, key), ([k, v]) => {
        const r = v.filter((l: any) => l.statut === 'résolu');
        return [k, v.length, sum(v, (l: any) => l.montant_conteste), sum(r, (l: any) => l.montant_accepte), sum(r, (l: any) => l.montant_transfere), sum(r, (l: any) => l.montant_abandonne)];
      }).sort((a, b) => (b[2] as number) - (a[2] as number));
      const colonnesRecap = (premier: string) => [
        { header: premier, width: 30 }, { header: 'Litiges', type: 'number' as const, width: 10 }, { header: 'Contesté', type: 'money' as const, width: 15 },
        { header: 'Obtenu', type: 'money' as const, width: 15 }, { header: 'Reporté patient', type: 'money' as const, width: 15 }, { header: 'Abandonné', type: 'money' as const, width: 15 },
      ];
      const totalRecap = ['TOTAL', litiges.length, conteste, accepte, sum(resolus, (l: any) => l.montant_transfere), sum(resolus, (l: any) => l.montant_abandonne)];
      return {
        kpis: [
          { label: 'Litiges ouverts sur la période', value: litiges.length, type: 'number', hint: `${ouverts.length} encore en cours` },
          { label: 'Montant contesté', value: conteste, type: 'money' },
          { label: 'Obtenu après contestation', value: accepte, type: 'money', hint: `${Math.round(ratio(accepte, sum(resolus, (l: any) => l.montant_conteste)) * 100)} % des litiges résolus` },
          { label: 'Pertes (abandonné)', value: sum(resolus, (l: any) => l.montant_abandonne), type: 'money' },
          { label: 'Durée moyenne de traitement', value: `${Math.round(duree)} j` },
        ],
        sections: [
          { title: 'Par motif', columns: colonnesRecap('Motif'), rows: recap((l: any) => motif(l.motif)), totals: totalRecap },
          { title: 'Par assureur', columns: colonnesRecap('Assureur'), rows: recap((l: any) => l.assureurs?.nom || '—'), totals: totalRecap },
          {
            title: 'Détail des litiges',
            columns: [
              { header: 'Ouvert le', type: 'date', width: 9 }, { header: 'N° litige', width: 12 }, { header: 'Assureur', width: 12 }, { header: 'Facture', width: 12 },
              { header: 'Patient', width: 14 }, { header: 'Motif', width: 16 }, { header: 'Statut', width: 9 }, { header: 'Contesté', type: 'money', width: 9 }, { header: 'Décision', width: 17 },
            ],
            rows: litiges.map((l: any) => [
              l.date_ouverture, l.numero, l.assureurs?.nom, l.factures?.numero_facture,
              l.factures?.patients ? `${l.factures.patients.prenom} ${String(l.factures.patients.nom).toUpperCase()}` : '—',
              motif(l.motif), LITIGE_STATUTS[l.statut as keyof typeof LITIGE_STATUTS]?.label || l.statut, Number(l.montant_conteste),
              l.statut === 'résolu'
                ? [Number(l.montant_accepte) > 0 && `assureur ${Number(l.montant_accepte)}`, Number(l.montant_transfere) > 0 && `patient ${Number(l.montant_transfere)}`, Number(l.montant_abandonne) > 0 && `perte ${Number(l.montant_abandonne)}`].filter(Boolean).join(', ')
                : 'En attente',
            ]),
            highlightRows: litiges.map((l: any, i: number) => (l.statut === 'ouvert' || l.statut === 'en_cours' ? i : -1)).filter((i: number) => i >= 0),
            emptyText: 'Aucun litige sur la période.',
          },
        ],
        notes: ['Lignes en évidence : litiges encore en cours. Litiges annulés exclus.'],
      };
    },
  },
];
