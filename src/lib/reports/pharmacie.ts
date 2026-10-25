import { supabase } from '@/lib/supabase';
import { MOUVEMENT_TYPES } from '@/lib/format';
import type { ReportDefinition } from './types';
import { fetchAll, iso, nom, docteur, sum, ratio, groupBy } from './helpers';

const PHARMA_ROLES: ReportDefinition['roles'] = ['super_admin', 'admin', 'medecin_chef', 'medecin', 'pharmacien'];

const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const joursAvant = (date?: string | null) => (date ? Math.ceil((new Date(date).getTime() - today().getTime()) / 86_400_000) : null);
const designation = (m: any) => `${m.nom_commercial}${m.dosage ? ` ${m.dosage}` : ''}`;

function etatStock(m: any): string {
  const j = joursAvant(m.date_peremption);
  if (j !== null && j < 0) return 'Périmé';
  if (m.stock_actuel <= 0) return 'Rupture';
  if (m.stock_actuel <= m.stock_minimum) return 'Critique';
  return 'Disponible';
}

export const PHARMACIE_REPORTS: ReportDefinition[] = [
  {
    id: 'inventaire',
    category: 'pharmacie',
    title: 'Inventaire valorisé (liste des médicaments)',
    description: 'Tous les médicaments : forme, dosage, stock, seuil, prix, valeur du stock, péremption et état.',
    roles: PHARMA_ROLES,
    period: 'aucune',
    orientation: 'landscape',
    signatures: ['Le pharmacien', 'Le responsable'],
    filters: [{
      key: 'etat', label: 'État', defaultValue: 'tous',
      options: [
        { value: 'tous', label: 'Tous les produits' }, { value: 'Disponible', label: 'Disponibles' },
        { value: 'Critique', label: 'Stock critique' }, { value: 'Rupture', label: 'En rupture' }, { value: 'Périmé', label: 'Périmés' },
      ],
    }],
    run: async ({ filters }) => {
      const tous = await fetchAll((a, b) => supabase.from('medicaments').select('*').order('nom_commercial').range(a, b));
      const meds = tous.filter((m: any) => filters.etat === 'tous' || !filters.etat || etatStock(m) === filters.etat);
      const valeur = sum(meds, (m: any) => m.stock_actuel * m.prix_unitaire);
      return {
        kpis: [
          { label: 'Références', value: meds.length, type: 'number' },
          { label: 'Valeur du stock', value: valeur, type: 'money' },
          { label: 'En rupture', value: tous.filter((m: any) => etatStock(m) === 'Rupture').length, type: 'number' },
          { label: 'Stock critique', value: tous.filter((m: any) => etatStock(m) === 'Critique').length, type: 'number' },
        ],
        sections: [
          {
            title: 'Valeur du stock par famille',
            columns: [{ header: 'Famille', width: 40 }, { header: 'Références', type: 'number', width: 15 }, { header: 'Unités', type: 'number', width: 15 }, { header: 'Valeur', type: 'money', width: 20 }, { header: 'Part', type: 'percent', width: 10 }],
            rows: Array.from(groupBy(meds, (m: any) => m.famille || 'Non classé'), ([k, v]) => [k, v.length, sum(v, (m: any) => m.stock_actuel), sum(v, (m: any) => m.stock_actuel * m.prix_unitaire), ratio(sum(v, (m: any) => m.stock_actuel * m.prix_unitaire), valeur)])
              .sort((a, b) => (b[3] as number) - (a[3] as number)),
            totals: ['TOTAL', meds.length, sum(meds, (m: any) => m.stock_actuel), valeur, valeur ? 1 : 0],
          },
          {
            title: 'Inventaire détaillé',
            columns: [
              { header: 'Code', width: 9 }, { header: 'Désignation', width: 18 }, { header: 'Générique', width: 14 }, { header: 'Forme', width: 8 },
              { header: 'Stock', type: 'number', width: 7 }, { header: 'Seuil', type: 'number', width: 6 }, { header: 'Prix unit.', type: 'money', width: 10 },
              { header: 'Valeur', type: 'money', width: 11 }, { header: 'Péremption', type: 'date', width: 9 }, { header: 'État', width: 8 },
            ],
            rows: meds.map((m: any) => [m.code, designation(m), m.nom_generique, m.forme, m.stock_actuel, m.stock_minimum, Number(m.prix_unitaire), m.stock_actuel * m.prix_unitaire, m.date_peremption, etatStock(m)]),
            highlightRows: meds.map((m: any, i: number) => (etatStock(m) !== 'Disponible' ? i : -1)).filter((i: number) => i >= 0),
            totals: ['TOTAL', `${meds.length} réf.`, '', '', sum(meds, (m: any) => m.stock_actuel), '', '', valeur, '', ''],
            emptyText: 'Aucun médicament.',
          },
        ],
      };
    },
  },
  {
    id: 'stocks-critiques',
    category: 'pharmacie',
    title: 'Ruptures & bon de commande suggéré',
    description: 'Produits en rupture ou sous le seuil minimum, avec quantité à commander et coût estimé.',
    roles: PHARMA_ROLES,
    period: 'aucune',
    orientation: 'landscape',
    signatures: ['Le pharmacien', 'Visa de la direction'],
    run: async () => {
      const meds = (await fetchAll((a, b) => supabase.from('medicaments').select('*').order('stock_actuel').range(a, b)))
        .filter((m: any) => m.stock_actuel <= m.stock_minimum);
      // Quantité suggérée : remonter le stock à deux fois le seuil minimum
      const rows = meds.map((m: any) => {
        const qte = Math.max(m.stock_minimum * 2 - m.stock_actuel, m.stock_minimum, 1);
        return [m.code, designation(m), m.forme, m.stock_actuel, m.stock_minimum, qte, m.fournisseur, Number(m.prix_unitaire), qte * m.prix_unitaire];
      });
      const cout = sum(rows, (r) => r[8] as number);
      return {
        kpis: [
          { label: 'Produits à commander', value: rows.length, type: 'number' },
          { label: 'Dont en rupture', value: meds.filter((m: any) => m.stock_actuel <= 0).length, type: 'number' },
          { label: 'Coût estimé de la commande', value: cout, type: 'money' },
        ],
        sections: [{
          title: 'Bon de commande suggéré',
          columns: [
            { header: 'Code', width: 9 }, { header: 'Désignation', width: 20 }, { header: 'Forme', width: 9 }, { header: 'Stock', type: 'number', width: 7 },
            { header: 'Seuil', type: 'number', width: 7 }, { header: 'À commander', type: 'number', width: 10 }, { header: 'Fournisseur', width: 15 },
            { header: 'Prix unit.', type: 'money', width: 11 }, { header: 'Coût estimé', type: 'money', width: 12 },
          ],
          rows,
          highlightRows: meds.map((m: any, i: number) => (m.stock_actuel <= 0 ? i : -1)).filter((i: number) => i >= 0),
          totals: ['TOTAL', `${rows.length} produit(s)`, '', '', '', sum(rows, (r) => r[5] as number), '', '', cout],
          emptyText: 'Aucun produit sous le seuil minimum.',
        }],
        notes: ['Quantité suggérée = de quoi remonter le stock à deux fois le seuil minimum (à ajuster selon la consommation réelle).'],
      };
    },
  },
  {
    id: 'peremptions',
    category: 'pharmacie',
    title: 'Produits périmés & à péremption proche',
    description: 'Produits déjà périmés ou qui expirent dans les 90 prochains jours, avec la valeur à risque.',
    roles: PHARMA_ROLES,
    period: 'aucune',
    orientation: 'landscape',
    run: async () => {
      const limite = new Date(today().getTime() + 90 * 86_400_000).toISOString().slice(0, 10);
      const meds = await fetchAll((a, b) => supabase.from('medicaments').select('*').not('date_peremption', 'is', null).lte('date_peremption', limite).order('date_peremption').range(a, b));
      const rows = meds.map((m: any) => {
        const j = joursAvant(m.date_peremption) as number;
        return [m.code, designation(m), m.fournisseur, m.stock_actuel, m.date_peremption, j, j < 0 ? 'Périmé' : j <= 30 ? 'Sous 30 jours' : 'Sous 90 jours', m.stock_actuel * m.prix_unitaire];
      });
      return {
        kpis: [
          { label: 'Périmés', value: rows.filter((r) => (r[5] as number) < 0).length, type: 'number' },
          { label: 'Expirent sous 30 jours', value: rows.filter((r) => (r[5] as number) >= 0 && (r[5] as number) <= 30).length, type: 'number' },
          { label: 'Valeur à risque', value: sum(rows, (r) => r[7] as number), type: 'money' },
        ],
        sections: [{
          title: 'Produits concernés',
          columns: [
            { header: 'Code', width: 10 }, { header: 'Désignation', width: 24 }, { header: 'Fournisseur', width: 16 }, { header: 'Stock', type: 'number', width: 8 },
            { header: 'Péremption', type: 'date', width: 11 }, { header: 'Jours restants', type: 'number', width: 10 }, { header: 'Alerte', width: 10 }, { header: 'Valeur', type: 'money', width: 11 },
          ],
          rows,
          highlightRows: rows.map((r, i) => ((r[5] as number) < 0 ? i : -1)).filter((i) => i >= 0),
          totals: ['TOTAL', `${rows.length} produit(s)`, '', sum(rows, (r) => r[3] as number), '', '', '', sum(rows, (r) => r[7] as number)],
          emptyText: 'Aucun produit périmé ou proche de la péremption.',
        }],
      };
    },
  },
  {
    id: 'mouvements-stock',
    category: 'pharmacie',
    title: 'Mouvements de stock',
    description: 'Entrées (réceptions), sorties (délivrances), ajustements d’inventaire et retraits de la période.',
    roles: PHARMA_ROLES,
    period: 'periode',
    defaultMode: 'mois',
    orientation: 'landscape',
    signatures: ['Le pharmacien'],
    run: async ({ period }) => {
      const p = period!;
      const mvts = await fetchAll((a, b) => supabase.from('mouvements_stock')
        .select('created_at, type, quantite, stock_avant, stock_apres, motif, reference, medicaments(nom_commercial, dosage, prix_unitaire), auteur:personnel(nom, prenom)')
        .gte('created_at', iso(p.from)).lte('created_at', iso(p.to)).order('created_at').range(a, b));
      const parType = Array.from(groupBy(mvts, (m: any) => m.type), ([k, v]) => [
        MOUVEMENT_TYPES[k]?.label || k, v.length, sum(v, (m: any) => m.quantite), sum(v, (m: any) => Math.abs(m.quantite) * Number(m.medicaments?.prix_unitaire || 0)),
      ]);
      return {
        kpis: [
          { label: 'Mouvements', value: mvts.length, type: 'number' },
          { label: 'Unités entrées', value: sum(mvts.filter((m: any) => m.quantite > 0), (m: any) => m.quantite), type: 'number' },
          { label: 'Unités sorties', value: Math.abs(sum(mvts.filter((m: any) => m.quantite < 0), (m: any) => m.quantite)), type: 'number' },
        ],
        sections: [
          {
            title: 'Synthèse par type',
            columns: [{ header: 'Type', width: 35 }, { header: 'Opérations', type: 'number', width: 20 }, { header: 'Quantité nette', type: 'number', width: 20 }, { header: 'Valeur', type: 'money', width: 25 }],
            rows: parType,
          },
          {
            title: 'Journal des mouvements',
            columns: [
              { header: 'Date', type: 'datetime', width: 12 }, { header: 'Médicament', width: 18 }, { header: 'Type', width: 10 }, { header: 'Quantité', type: 'number', width: 8 },
              { header: 'Avant', type: 'number', width: 7 }, { header: 'Après', type: 'number', width: 7 }, { header: 'Motif', width: 18 }, { header: 'Référence', width: 10 }, { header: 'Par', width: 12 },
            ],
            rows: mvts.map((m: any) => [m.created_at, m.medicaments ? designation(m.medicaments) : '—', MOUVEMENT_TYPES[m.type]?.label || m.type, m.quantite, m.stock_avant, m.stock_apres, m.motif, m.reference, nom(m.auteur)]),
            emptyText: 'Aucun mouvement sur la période.',
          },
        ],
      };
    },
  },
  {
    id: 'consommation',
    category: 'pharmacie',
    title: 'Consommation des médicaments',
    description: 'Quantités délivrées par médicament sur la période et valeur correspondante (aide à la commande).',
    roles: PHARMA_ROLES,
    period: 'periode',
    defaultMode: 'mois',
    run: async ({ period }) => {
      const p = period!;
      const sorties = await fetchAll((a, b) => supabase.from('mouvements_stock')
        .select('quantite, medicament_id, medicaments(nom_commercial, dosage, prix_unitaire, stock_actuel)')
        .eq('type', 'sortie').gte('created_at', iso(p.from)).lte('created_at', iso(p.to)).range(a, b));
      const jours = Math.max(1, Math.round((p.to.getTime() - p.from.getTime()) / 86_400_000));
      const rows = Array.from(groupBy(sorties, (m: any) => m.medicament_id), ([, v]) => {
        const med = v[0].medicaments || {};
        const qte = Math.abs(sum(v, (m: any) => m.quantite));
        const parJour = qte / jours;
        return [designation(med), v.length, qte, Number(med.prix_unitaire || 0) * qte, med.stock_actuel, parJour > 0 ? Math.floor(med.stock_actuel / parJour) : null];
      }).sort((a, b) => (b[2] as number) - (a[2] as number));
      return {
        kpis: [
          { label: 'Délivrances', value: sorties.length, type: 'number' },
          { label: 'Unités délivrées', value: sum(rows, (r) => r[2] as number), type: 'number' },
          { label: 'Valeur délivrée', value: sum(rows, (r) => r[3] as number), type: 'money' },
        ],
        sections: [{
          title: 'Consommation par médicament',
          columns: [
            { header: 'Médicament', width: 30 }, { header: 'Délivrances', type: 'number', width: 11 }, { header: 'Unités', type: 'number', width: 10 },
            { header: 'Valeur', type: 'money', width: 16 }, { header: 'Stock actuel', type: 'number', width: 11 }, { header: 'Autonomie (jours)', type: 'number', width: 14 },
          ],
          rows,
          totals: ['TOTAL', sorties.length, sum(rows, (r) => r[2] as number), sum(rows, (r) => r[3] as number), '', ''],
          emptyText: 'Aucune délivrance sur la période.',
        }],
        notes: ['Autonomie = nombre de jours couverts par le stock actuel au rythme de consommation de la période.'],
      };
    },
  },
  {
    id: 'ordonnances-attente',
    category: 'pharmacie',
    title: 'Ordonnances en attente de délivrance',
    description: 'Prescriptions actives non encore délivrées, avec disponibilité en stock.',
    roles: PHARMA_ROLES,
    period: 'aucune',
    orientation: 'landscape',
    run: async () => {
      const [pres, meds] = await Promise.all([
        fetchAll((a, b) => supabase.from('prescriptions')
          .select('created_at, nom_medicament, dosage, frequence, duree, medicament_id, consultations(patients(nom, prenom, code_patient), personnel(nom, prenom, role))')
          .eq('statut', 'active').order('created_at').range(a, b)),
        fetchAll((a, b) => supabase.from('medicaments').select('id, nom_commercial, stock_actuel').range(a, b)),
      ]);
      const stockDe = (p: any) => {
        const m = meds.find((x: any) => x.id === p.medicament_id) || meds.find((x: any) => x.nom_commercial.toLowerCase() === String(p.nom_medicament).toLowerCase());
        return m ? m.stock_actuel : null;
      };
      return {
        kpis: [
          { label: 'Prescriptions en attente', value: pres.length, type: 'number' },
          { label: 'Hors stock / indisponibles', value: pres.filter((p: any) => !stockDe(p)).length, type: 'number' },
        ],
        sections: [{
          title: 'Prescriptions à délivrer',
          columns: [
            { header: 'Prescrit le', type: 'datetime', width: 12 }, { header: 'Patient', width: 18 }, { header: 'Médicament', width: 17 },
            { header: 'Posologie', width: 20 }, { header: 'Durée', width: 9 }, { header: 'Prescripteur', width: 14 }, { header: 'Stock', type: 'number', width: 8 },
          ],
          rows: pres.map((p: any) => [p.created_at, `${nom(p.consultations?.patients)} (${p.consultations?.patients?.code_patient || '—'})`, `${p.nom_medicament} ${p.dosage || ''}`.trim(), p.frequence, p.duree, docteur(p.consultations?.personnel), stockDe(p)]),
          highlightRows: pres.map((p: any, i: number) => (!stockDe(p) ? i : -1)).filter((i: number) => i >= 0),
          emptyText: 'Aucune prescription en attente.',
        }],
      };
    },
  },
];
