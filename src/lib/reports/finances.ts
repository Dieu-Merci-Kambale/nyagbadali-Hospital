import { supabase } from '@/lib/supabase';
import { MODES_PAIEMENT, CATEGORIES_ACTES, FACTURE_STATUTS } from '@/lib/format';
import type { ReportDefinition } from './types';
import { fetchAll, iso, nom, sum, ratio, periodBuckets, groupBy, daysBetween } from './helpers';

const FINANCE_ROLES: ReportDefinition['roles'] = ['super_admin', 'admin', 'caissier'];
const mode = (m?: string) => MODES_PAIEMENT[m || ''] || m || '—';

/** Catégorie d'une ligne de facture : catalogue des actes, sinon type d'élément facturé. */
function categorieLigne(l: any, actes: Map<string, string>): string {
  const c = l.code_acte ? actes.get(l.code_acte) : undefined;
  if (c) return CATEGORIES_ACTES[c] || c;
  if (l.code_acte === 'PHARMA' || l.source_type === 'prescription') return CATEGORIES_ACTES.pharmacie;
  if (l.source_type === 'analyse') return CATEGORIES_ACTES.laboratoire;
  if (l.source_type === 'hospitalisation') return CATEGORIES_ACTES.hospitalisation;
  if (l.source_type === 'consultation') return CATEGORIES_ACTES.consultation;
  return CATEGORIES_ACTES.autre;
}

async function catalogue(): Promise<Map<string, string>> {
  const { data } = await supabase.from('actes_tarifs').select('code, categorie');
  return new Map((data || []).map((a: any) => [a.code, a.categorie]));
}

export const FINANCE_REPORTS: ReportDefinition[] = [
  // ------------------------------------------------------------------
  {
    id: 'releve-caisse',
    category: 'finances',
    title: 'Relevé de caisse',
    description: 'Journal détaillé des encaissements : chaque paiement, totaux par mode de paiement et par caissier.',
    roles: FINANCE_ROLES,
    period: 'periode',
    defaultMode: 'jour',
    orientation: 'landscape',
    signatures: ['Le caissier', 'Le responsable financier'],
    run: async ({ period }) => {
      const p = period!;
      const paiements = await fetchAll((a, b) => supabase
        .from('paiements')
        .select('montant, mode_paiement, reference, date_paiement, caissier:personnel!paiements_recu_par_fkey(nom, prenom), factures(numero_facture, patients(nom, prenom, code_patient))')
        .gte('date_paiement', iso(p.from)).lte('date_paiement', iso(p.to))
        .order('date_paiement').range(a, b));

      const total = sum(paiements, (x: any) => x.montant);
      const parMode = Array.from(groupBy(paiements, (x: any) => mode(x.mode_paiement)), ([k, v]) => [k, v.length, sum(v, (x: any) => x.montant), ratio(sum(v, (x: any) => x.montant), total)]);
      const parCaissier = Array.from(groupBy(paiements, (x: any) => (x.caissier ? nom(x.caissier) : 'Non renseigné')), ([k, v]) => [k, v.length, sum(v, (x: any) => x.montant)]);
      const especes = sum(paiements.filter((x: any) => x.mode_paiement === 'cash'), (x: any) => x.montant);

      return {
        kpis: [
          { label: 'Total encaissé', value: total, type: 'money' },
          { label: "Nombre d'opérations", value: paiements.length, type: 'number' },
          { label: 'Montant moyen', value: ratio(total, paiements.length), type: 'money' },
          { label: 'Espèces à justifier', value: especes, type: 'money', hint: 'Montant attendu en caisse' },
        ],
        sections: [
          {
            title: 'Encaissements',
            columns: [
              { header: 'Date & heure', type: 'datetime', width: 15 },
              { header: 'N° facture', width: 15 },
              { header: 'Patient', width: 22 },
              { header: 'Mode', width: 12 },
              { header: 'Référence', width: 12 },
              { header: 'Encaissé par', width: 14 },
              { header: 'Montant', type: 'money', width: 13 },
            ],
            rows: paiements.map((x: any) => [x.date_paiement, x.factures?.numero_facture, `${nom(x.factures?.patients)} (${x.factures?.patients?.code_patient || '—'})`, mode(x.mode_paiement), x.reference, nom(x.caissier), Number(x.montant)]),
            totals: ['TOTAL', '', `${paiements.length} opération(s)`, '', '', '', total],
            emptyText: 'Aucun encaissement sur la période.',
          },
          {
            title: 'Récapitulatif par mode de paiement',
            columns: [{ header: 'Mode de paiement', width: 40 }, { header: 'Opérations', type: 'number', width: 20 }, { header: 'Montant', type: 'money', width: 25 }, { header: 'Part', type: 'percent', width: 15 }],
            rows: parMode,
            totals: ['TOTAL', paiements.length, total, total ? 1 : 0],
          },
          {
            title: 'Récapitulatif par caissier',
            columns: [{ header: 'Caissier', width: 50 }, { header: 'Opérations', type: 'number', width: 20 }, { header: 'Montant', type: 'money', width: 30 }],
            rows: parCaissier,
            totals: ['TOTAL', paiements.length, total],
          },
        ],
      };
    },
  },

  // ------------------------------------------------------------------
  {
    id: 'situation-financiere',
    category: 'finances',
    title: 'Situation financière',
    description: 'Facturé, part assurance, encaissé et reste à recouvrer, avec évolution par jour, mois ou heure et recettes par catégorie.',
    roles: FINANCE_ROLES,
    period: 'periode',
    defaultMode: 'mois',
    orientation: 'landscape',
    signatures: ['Le responsable financier', 'La direction'],
    run: async ({ period }) => {
      const p = period!;
      const [factures, paiements, lignes, actes] = await Promise.all([
        fetchAll((a, b) => supabase.from('factures').select('id, date_facture, montant_total, montant_assurance, montant_patient, statut, paiements(montant)')
          .gte('date_facture', iso(p.from)).lte('date_facture', iso(p.to)).range(a, b)),
        fetchAll((a, b) => supabase.from('paiements').select('montant, mode_paiement, date_paiement')
          .gte('date_paiement', iso(p.from)).lte('date_paiement', iso(p.to)).range(a, b)),
        fetchAll((a, b) => supabase.from('lignes_facture').select('montant, code_acte, source_type, factures!inner(date_facture, statut)')
          .gte('factures.date_facture', iso(p.from)).lte('factures.date_facture', iso(p.to)).neq('factures.statut', 'annulée').range(a, b)),
        catalogue(),
      ]);

      const valides = factures.filter((f: any) => f.statut !== 'annulée');
      const brut = sum(valides, (f: any) => f.montant_total);
      const assurance = sum(valides, (f: any) => f.montant_assurance);
      const net = sum(valides, (f: any) => f.montant_patient);
      const payeSurFactures = sum(valides, (f: any) => sum(f.paiements || [], (x: any) => x.montant));
      const encaisse = sum(paiements, (x: any) => x.montant);
      const reste = net - payeSurFactures;

      const buckets = periodBuckets(p);
      const evolution = buckets.map((bk) => {
        const fs = valides.filter((f: any) => bk.match(new Date(f.date_facture)));
        const ps = paiements.filter((x: any) => bk.match(new Date(x.date_paiement)));
        return [bk.label, fs.length, sum(fs, (f: any) => f.montant_total), sum(fs, (f: any) => f.montant_assurance), sum(fs, (f: any) => f.montant_patient), sum(ps, (x: any) => x.montant)];
      }).filter((r) => p.mode !== 'jour' || (r[1] as number) > 0 || (r[5] as number) > 0);

      const statuts = Array.from(groupBy(factures, (f: any) => f.statut), ([k, v]) => {
        const paye = sum(v, (f: any) => sum(f.paiements || [], (x: any) => x.montant));
        const n = sum(v, (f: any) => f.montant_patient);
        return [FACTURE_STATUTS[k]?.label || k, v.length, n, paye, k === 'annulée' ? 0 : Math.max(0, n - paye)];
      });

      const categories = Array.from(groupBy(lignes, (l: any) => categorieLigne(l, actes)), ([k, v]) => [k, sum(v, (l: any) => l.montant)]);
      const totalCat = sum(categories, (r) => r[1] as number);

      return {
        kpis: [
          { label: 'Facturé (brut)', value: brut, type: 'money', hint: `${valides.length} facture(s)` },
          { label: 'Part assurances', value: assurance, type: 'money' },
          { label: 'Net à charge des patients', value: net, type: 'money' },
          { label: 'Encaissé sur la période', value: encaisse, type: 'money' },
          { label: 'Reste à recouvrer', value: reste, type: 'money', hint: 'Sur les factures de la période' },
          { label: 'Taux de recouvrement', value: ratio(payeSurFactures, net), type: 'percent' },
        ],
        sections: [
          {
            title: p.mode === 'jour' ? 'Évolution par heure' : buckets.length && buckets[0].key.length > 7 ? 'Évolution par jour' : 'Évolution par mois',
            columns: [
              { header: 'Période', width: 22 }, { header: 'Factures', type: 'number', width: 10 },
              { header: 'Facturé brut', type: 'money', width: 17 }, { header: 'Part assurance', type: 'money', width: 17 },
              { header: 'Net patients', type: 'money', width: 17 }, { header: 'Encaissé', type: 'money', width: 17 },
            ],
            rows: evolution,
            totals: ['TOTAL', valides.length, brut, assurance, net, encaisse],
          },
          {
            title: 'Factures par statut',
            columns: [{ header: 'Statut', width: 28 }, { header: 'Nombre', type: 'number', width: 14 }, { header: 'Net patients', type: 'money', width: 20 }, { header: 'Payé', type: 'money', width: 19 }, { header: 'Reste dû', type: 'money', width: 19 }],
            rows: statuts,
          },
          {
            title: 'Encaissements par mode de paiement',
            columns: [{ header: 'Mode', width: 40 }, { header: 'Opérations', type: 'number', width: 20 }, { header: 'Montant', type: 'money', width: 25 }, { header: 'Part', type: 'percent', width: 15 }],
            rows: Array.from(groupBy(paiements, (x: any) => mode(x.mode_paiement)), ([k, v]) => [k, v.length, sum(v, (x: any) => x.montant), ratio(sum(v, (x: any) => x.montant), encaisse)]),
            totals: ['TOTAL', paiements.length, encaisse, encaisse ? 1 : 0],
          },
          {
            title: 'Recettes facturées par catégorie',
            columns: [{ header: 'Catégorie', width: 50 }, { header: 'Montant facturé', type: 'money', width: 30 }, { header: 'Part', type: 'percent', width: 20 }],
            rows: categories.sort((a, b) => (b[1] as number) - (a[1] as number)).map((r) => [...r, ratio(r[1] as number, totalCat)]),
            totals: ['TOTAL', totalCat, totalCat ? 1 : 0],
          },
        ],
        notes: [
          "« Encaissé sur la période » comprend tous les paiements reçus pendant la période, y compris ceux de factures plus anciennes.",
          '« Reste à recouvrer » et « Taux de recouvrement » portent sur les factures émises pendant la période.',
        ],
      };
    },
  },

  // ------------------------------------------------------------------
  {
    id: 'creances',
    category: 'finances',
    title: 'État des créances (impayés)',
    description: 'Toutes les factures non soldées avec le reste dû et leur ancienneté (balance âgée 0-30 / 31-60 / 61-90 / +90 jours).',
    roles: FINANCE_ROLES,
    period: 'aucune',
    orientation: 'landscape',
    signatures: ['Le responsable financier'],
    run: async () => {
      const factures = await fetchAll((a, b) => supabase.from('factures')
        .select('numero_facture, date_facture, montant_patient, statut, paiements(montant), patients(nom, prenom, code_patient, telephone)')
        .in('statut', ['en_attente', 'partielle']).order('date_facture').range(a, b));
      const rows = factures.map((f: any) => {
        const paye = sum(f.paiements || [], (x: any) => x.montant);
        return { f, paye, reste: Math.max(0, Number(f.montant_patient) - paye), age: daysBetween(f.date_facture) };
      }).filter((r) => r.reste > 0);
      const total = sum(rows, (r) => r.reste);
      const tranches = [
        { label: '0 à 30 jours', test: (d: number) => d <= 30 },
        { label: '31 à 60 jours', test: (d: number) => d > 30 && d <= 60 },
        { label: '61 à 90 jours', test: (d: number) => d > 60 && d <= 90 },
        { label: 'Plus de 90 jours', test: (d: number) => d > 90 },
      ];
      return {
        kpis: [
          { label: 'Total des créances', value: total, type: 'money' },
          { label: 'Factures concernées', value: rows.length, type: 'number' },
          { label: 'Créances de plus de 90 jours', value: sum(rows.filter((r) => r.age > 90), (r) => r.reste), type: 'money' },
          { label: 'Plus ancienne', value: rows.length ? `${Math.max(...rows.map((r) => r.age))} jours` : '—' },
        ],
        sections: [
          {
            title: 'Balance âgée',
            columns: [{ header: 'Ancienneté', width: 40 }, { header: 'Factures', type: 'number', width: 20 }, { header: 'Reste dû', type: 'money', width: 25 }, { header: 'Part', type: 'percent', width: 15 }],
            rows: tranches.map((t) => {
              const v = rows.filter((r) => t.test(r.age));
              return [t.label, v.length, sum(v, (r) => r.reste), ratio(sum(v, (r) => r.reste), total)];
            }),
            totals: ['TOTAL', rows.length, total, total ? 1 : 0],
          },
          {
            title: 'Détail des factures impayées',
            columns: [
              { header: 'N° facture', width: 14 }, { header: 'Date', type: 'date', width: 10 }, { header: 'Patient', width: 22 },
              { header: 'Téléphone', width: 13 }, { header: 'Net patient', type: 'money', width: 12 }, { header: 'Payé', type: 'money', width: 11 },
              { header: 'Reste dû', type: 'money', width: 12 }, { header: 'Jours', type: 'number', width: 6 },
            ],
            rows: rows.map((r) => [r.f.numero_facture, r.f.date_facture, `${nom(r.f.patients)} (${r.f.patients?.code_patient || '—'})`, r.f.patients?.telephone, Number(r.f.montant_patient), r.paye, r.reste, r.age]),
            highlightRows: rows.map((r, i) => (r.age > 90 ? i : -1)).filter((i) => i >= 0),
            totals: ['TOTAL', '', `${rows.length} facture(s)`, '', sum(rows, (r) => Number(r.f.montant_patient)), sum(rows, (r) => r.paye), total, ''],
            emptyText: 'Aucune créance : toutes les factures sont soldées.',
          },
        ],
      };
    },
  },

  // ------------------------------------------------------------------
  {
    id: 'recettes-prestations',
    category: 'finances',
    title: 'Recettes par prestation',
    description: 'Quantités et montants facturés pour chaque acte, médicament, examen ou journée d’hospitalisation.',
    roles: FINANCE_ROLES,
    period: 'periode',
    defaultMode: 'mois',
    run: async ({ period }) => {
      const p = period!;
      const [lignes, actes] = await Promise.all([
        fetchAll((a, b) => supabase.from('lignes_facture').select('description, code_acte, source_type, quantite, montant, factures!inner(date_facture, statut)')
          .gte('factures.date_facture', iso(p.from)).lte('factures.date_facture', iso(p.to)).neq('factures.statut', 'annulée').range(a, b)),
        catalogue(),
      ]);
      // Regroupement par code d'acte quand il existe, sinon par libellé
      const groupes = groupBy(lignes, (l: any) => (l.code_acte && l.code_acte !== 'PHARMA' ? l.code_acte : `#${String(l.description).split(' — ')[0].trim().toLowerCase()}`));
      const total = sum(lignes, (l: any) => l.montant);
      const rows = Array.from(groupes.values()).map((v: any[]) => {
        const l = v[0];
        return [String(l.description).split(' — ')[0], l.code_acte && l.code_acte !== 'PHARMA' ? l.code_acte : '', categorieLigne(l, actes), sum(v, (x: any) => x.quantite), sum(v, (x: any) => x.montant), ratio(sum(v, (x: any) => x.montant), total)];
      }).sort((a, b) => (b[4] as number) - (a[4] as number));
      return {
        kpis: [
          { label: 'Total facturé', value: total, type: 'money' },
          { label: 'Prestations distinctes', value: rows.length, type: 'number' },
          { label: 'Unités facturées', value: sum(lignes, (l: any) => l.quantite), type: 'number' },
        ],
        sections: [{
          title: 'Prestations facturées (classées par montant)',
          columns: [
            { header: 'Prestation', width: 34 }, { header: 'Code', width: 11 }, { header: 'Catégorie', width: 14 },
            { header: 'Quantité', type: 'number', width: 10 }, { header: 'Montant', type: 'money', width: 17 }, { header: 'Part', type: 'percent', width: 9 },
          ],
          rows,
          totals: ['TOTAL', '', '', sum(lignes, (l: any) => l.quantite), total, total ? 1 : 0],
          emptyText: 'Aucune prestation facturée sur la période.',
        }],
      };
    },
  },

  // ------------------------------------------------------------------
  {
    id: 'assurances',
    category: 'finances',
    title: 'Prises en charge des assurances',
    description: 'Montants à réclamer à chaque assureur, avec le détail par patient et par facture (bordereau).',
    roles: FINANCE_ROLES,
    period: 'periode',
    defaultMode: 'mois',
    orientation: 'landscape',
    signatures: ['Le responsable financier', "Visa de l'assureur"],
    run: async ({ period }) => {
      const p = period!;
      const factures = await fetchAll((a, b) => supabase.from('factures')
        .select('numero_facture, date_facture, montant_total, montant_assurance, montant_patient, statut, patients(nom, prenom, code_patient, assureur, numero_assurance)')
        .gt('montant_assurance', 0).neq('statut', 'annulée')
        .gte('date_facture', iso(p.from)).lte('date_facture', iso(p.to)).order('date_facture').range(a, b));
      const parAssureur = Array.from(groupBy(factures, (f: any) => f.patients?.assureur || 'Assureur non renseigné'), ([k, v]) => [k, v.length, sum(v, (f: any) => f.montant_total), sum(v, (f: any) => f.montant_assurance)]);
      const totalAss = sum(factures, (f: any) => f.montant_assurance);
      return {
        kpis: [
          { label: 'Total à réclamer', value: totalAss, type: 'money' },
          { label: 'Factures concernées', value: factures.length, type: 'number' },
          { label: 'Assureurs', value: parAssureur.length, type: 'number' },
        ],
        sections: [
          {
            title: 'Synthèse par assureur',
            columns: [{ header: 'Assureur', width: 40 }, { header: 'Factures', type: 'number', width: 15 }, { header: 'Total brut', type: 'money', width: 22 }, { header: 'Part assurance', type: 'money', width: 23 }],
            rows: parAssureur,
            totals: ['TOTAL', factures.length, sum(factures, (f: any) => f.montant_total), totalAss],
          },
          {
            title: 'Détail des prises en charge',
            columns: [
              { header: 'Assureur', width: 14 }, { header: 'N° assuré', width: 12 }, { header: 'Patient', width: 20 },
              { header: 'Facture', width: 14 }, { header: 'Date', type: 'date', width: 9 }, { header: 'Total brut', type: 'money', width: 11 },
              { header: 'Part assurance', type: 'money', width: 11 }, { header: 'Part patient', type: 'money', width: 9 },
            ],
            rows: factures.map((f: any) => [f.patients?.assureur || '—', f.patients?.numero_assurance, nom(f.patients), f.numero_facture, f.date_facture, Number(f.montant_total), Number(f.montant_assurance), Number(f.montant_patient)]),
            totals: ['TOTAL', '', '', '', '', sum(factures, (f: any) => f.montant_total), totalAss, sum(factures, (f: any) => f.montant_patient)],
            emptyText: 'Aucune prise en charge sur la période.',
          },
        ],
      };
    },
  },
];
