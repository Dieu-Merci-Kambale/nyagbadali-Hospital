import { supabase } from '@/lib/supabase';
import { LAB_STATUTS } from '@/lib/format';
import { statutDemande } from '@/lib/lab-catalogue';
import { roleLabels } from '@/lib/role-permissions';
import type { ReportDefinition } from './types';
import { fetchAll, iso, nom, docteur, sum, ratio, groupBy } from './helpers';

const LAB_ROLES: ReportDefinition['roles'] = ['super_admin', 'admin', 'medecin_chef', 'medecin', 'technicien_labo'];
const heures = (a?: string | null, b?: string | null) => (a && b ? (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000 : null);

export const LAB_REPORTS: ReportDefinition[] = [
  {
    id: 'registre-laboratoire',
    category: 'laboratoire',
    title: 'Registre du laboratoire',
    description: 'Toutes les demandes d’examens de la période : patient, examens, prescripteur, avancement et statut.',
    roles: LAB_ROLES,
    period: 'periode',
    defaultMode: 'jour',
    orientation: 'landscape',
    signatures: ['Le technicien de laboratoire', 'Le biologiste'],
    run: async ({ period }) => {
      const p = period!;
      const demandes = await fetchAll((a, b) => supabase.from('demandes_laboratoire')
        .select('numero, date_demande, urgent, patients(nom, prenom, code_patient), personnel!demandes_laboratoire_medecin_prescripteur_id_fkey(nom, prenom), analyses_laboratoire(type_analyse, statut)')
        .gte('date_demande', iso(p.from)).lte('date_demande', iso(p.to)).order('date_demande').range(a, b));
      const examens = demandes.flatMap((d: any) => d.analyses_laboratoire || []).filter((a: any) => a.statut !== 'annulé');
      return {
        kpis: [
          { label: 'Demandes', value: demandes.length, type: 'number', hint: `${demandes.filter((d: any) => d.urgent).length} urgente(s)` },
          { label: 'Examens', value: examens.length, type: 'number' },
          { label: 'Examens validés', value: examens.filter((a: any) => a.statut === 'terminé').length, type: 'number' },
          { label: 'En attente', value: examens.filter((a: any) => a.statut !== 'terminé').length, type: 'number' },
        ],
        sections: [{
          title: 'Demandes d’examens',
          columns: [
            { header: 'N° demande', width: 14 }, { header: 'Date', type: 'datetime', width: 12 }, { header: 'Patient', width: 18 },
            { header: 'Examens demandés', width: 32 }, { header: 'Prescripteur', width: 14 }, { header: 'Validés', width: 7, align: 'center' }, { header: 'Statut', width: 11 },
          ],
          rows: demandes.map((d: any) => {
            const ex = (d.analyses_laboratoire || []).filter((a: any) => a.statut !== 'annulé');
            return [
              `${d.numero}${d.urgent ? ' (URGENT)' : ''}`, d.date_demande, `${nom(d.patients)} (${d.patients?.code_patient || '—'})`,
              ex.map((a: any) => a.type_analyse).join(', '), d.personnel ? docteur(d.personnel) : '—',
              `${ex.filter((a: any) => a.statut === 'terminé').length}/${ex.length}`, LAB_STATUTS[statutDemande(d.analyses_laboratoire || [])]?.label,
            ];
          }),
          highlightRows: demandes.map((d: any, i: number) => (d.urgent ? i : -1)).filter((i: number) => i >= 0),
          emptyText: 'Aucune demande sur la période.',
        }],
      };
    },
  },
  {
    id: 'activite-laboratoire',
    category: 'laboratoire',
    title: 'Activité & délais par examen',
    description: 'Nombre d’examens par type, taux de résultats anormaux et délai moyen de rendu des résultats.',
    roles: LAB_ROLES,
    period: 'periode',
    defaultMode: 'mois',
    orientation: 'landscape',
    run: async ({ period }) => {
      const p = period!;
      const analyses = await fetchAll((a, b) => supabase.from('analyses_laboratoire')
        .select('type_analyse, statut, urgent, date_demande, date_prelevement, date_resultat, resultats')
        .gte('date_demande', iso(p.from)).lte('date_demande', iso(p.to)).range(a, b));
      const anormal = (a: any) => (a.resultats?.parametres || []).some((x: any) => x.anormal);
      const rows = Array.from(groupBy(analyses, (a: any) => a.type_analyse), ([k, v]) => {
        const faits = v.filter((a: any) => a.statut === 'terminé');
        const delais = faits.map((a: any) => heures(a.date_demande, a.date_resultat)).filter((h): h is number => h !== null && h >= 0);
        return [
          k, v.filter((a: any) => a.statut !== 'annulé').length, faits.length, v.filter((a: any) => a.statut === 'annulé').length,
          faits.filter(anormal).length, ratio(faits.filter(anormal).length, faits.length),
          delais.length ? Math.round((sum(delais, (h) => h) / delais.length) * 10) / 10 : null,
        ];
      }).sort((a, b) => (b[1] as number) - (a[1] as number));
      const faits = analyses.filter((a: any) => a.statut === 'terminé');
      const delais = faits.map((a: any) => heures(a.date_demande, a.date_resultat)).filter((h): h is number => h !== null && h >= 0);
      return {
        kpis: [
          { label: 'Examens demandés', value: analyses.filter((a: any) => a.statut !== 'annulé').length, type: 'number' },
          { label: 'Examens réalisés', value: faits.length, type: 'number' },
          { label: 'Résultats anormaux', value: ratio(faits.filter(anormal).length, faits.length), type: 'percent' },
          { label: 'Délai moyen de rendu', value: delais.length ? `${(sum(delais, (h) => h) / delais.length).toFixed(1).replace('.', ',')} h` : '—' },
        ],
        sections: [{
          title: 'Activité par type d’examen',
          columns: [
            { header: 'Examen', width: 30 }, { header: 'Demandés', type: 'number', width: 10 }, { header: 'Réalisés', type: 'number', width: 10 },
            { header: 'Annulés', type: 'number', width: 9 }, { header: 'Anormaux', type: 'number', width: 10 }, { header: 'Taux anormal', type: 'percent', width: 12 },
            { header: 'Délai moyen (h)', type: 'number', width: 13 },
          ],
          rows,
          totals: ['TOTAL', sum(rows, (r) => r[1] as number), sum(rows, (r) => r[2] as number), sum(rows, (r) => r[3] as number), sum(rows, (r) => r[4] as number), ratio(sum(rows, (r) => r[4] as number), sum(rows, (r) => r[2] as number)), ''],
          emptyText: 'Aucun examen sur la période.',
        }],
        notes: ['Délai de rendu = temps entre la demande et la validation du résultat.'],
      };
    },
  },
  {
    id: 'resultats-anormaux',
    category: 'laboratoire',
    title: 'Résultats anormaux',
    description: 'Examens validés présentant au moins une valeur hors des normes, avec le détail des paramètres.',
    roles: LAB_ROLES,
    period: 'periode',
    defaultMode: 'mois',
    orientation: 'landscape',
    run: async ({ period }) => {
      const p = period!;
      const analyses = (await fetchAll((a, b) => supabase.from('analyses_laboratoire')
        .select('date_resultat, type_analyse, resultats, patients(nom, prenom, code_patient), personnel!analyses_laboratoire_medecin_prescripteur_id_fkey(nom, prenom)')
        .eq('statut', 'terminé').gte('date_resultat', iso(p.from)).lte('date_resultat', iso(p.to)).order('date_resultat').range(a, b)))
        .filter((a: any) => (a.resultats?.parametres || []).some((x: any) => x.anormal));
      return {
        kpis: [{ label: 'Examens avec anomalies', value: analyses.length, type: 'number' }],
        sections: [{
          title: 'Résultats hors normes',
          columns: [
            { header: 'Validé le', type: 'datetime', width: 12 }, { header: 'Patient', width: 18 }, { header: 'Examen', width: 18 },
            { header: 'Valeurs anormales (valeur / référence)', width: 34 }, { header: 'Prescripteur', width: 14 },
          ],
          rows: analyses.map((a: any) => [
            a.date_resultat, `${nom(a.patients)} (${a.patients?.code_patient || '—'})`, a.type_analyse,
            (a.resultats.parametres || []).filter((x: any) => x.anormal).map((x: any) => `${x.nom} : ${x.valeur}${x.unite ? ` ${x.unite}` : ''} (réf. ${x.reference || '—'})`).join(' ; '),
            a.personnel ? docteur(a.personnel) : '—',
          ]),
          emptyText: 'Aucun résultat anormal sur la période.',
        }],
      };
    },
  },
];

// ===== Administration =====
export const ADMIN_REPORTS: ReportDefinition[] = [
  {
    id: 'liste-personnel',
    category: 'administration',
    title: 'Liste du personnel & effectifs',
    description: 'Personnel par rôle et par département, avec coordonnées, date d’embauche et statut.',
    roles: ['super_admin', 'admin'],
    period: 'aucune',
    orientation: 'landscape',
    signatures: ['Le responsable des ressources humaines'],
    filters: [{
      key: 'statut', label: 'Statut', defaultValue: 'actif',
      options: [{ value: 'tous', label: 'Tous' }, { value: 'actif', label: 'Actifs' }, { value: 'congé', label: 'En congé' }, { value: 'inactif', label: 'Inactifs' }],
    }],
    run: async ({ filters }) => {
      const personnel = await fetchAll((a, b) => {
        let q = supabase.from('personnel').select('*, departements!personnel_departement_id_fkey(nom)').order('nom');
        if (filters.statut && filters.statut !== 'tous') q = q.eq('statut', filters.statut);
        return q.range(a, b);
      });
      return {
        kpis: [
          { label: 'Effectif', value: personnel.length, type: 'number' },
          { label: 'Médecins', value: personnel.filter((p: any) => p.role?.startsWith('medecin')).length, type: 'number' },
          { label: 'Infirmiers', value: personnel.filter((p: any) => p.role?.startsWith('infirmier')).length, type: 'number' },
          { label: 'Départements', value: new Set(personnel.map((p: any) => p.departement_id).filter(Boolean)).size, type: 'number' },
        ],
        sections: [
          {
            title: 'Effectifs par rôle',
            columns: [{ header: 'Rôle', width: 50 }, { header: 'Hommes', type: 'number', width: 15 }, { header: 'Femmes', type: 'number', width: 15 }, { header: 'Total', type: 'number', width: 20 }],
            rows: Array.from(groupBy(personnel, (p: any) => roleLabels[p.role as keyof typeof roleLabels] || p.role), ([k, v]) => [k, v.filter((p: any) => p.sexe === 'M').length, v.filter((p: any) => p.sexe === 'F').length, v.length]),
            totals: ['TOTAL', personnel.filter((p: any) => p.sexe === 'M').length, personnel.filter((p: any) => p.sexe === 'F').length, personnel.length],
          },
          {
            title: 'Effectifs par département',
            columns: [{ header: 'Département', width: 50 }, { header: 'Médecins', type: 'number', width: 15 }, { header: 'Autres', type: 'number', width: 15 }, { header: 'Total', type: 'number', width: 20 }],
            rows: Array.from(groupBy(personnel, (p: any) => p.departements?.nom || 'Non affecté'), ([k, v]) => [k, v.filter((p: any) => p.role?.startsWith('medecin')).length, v.filter((p: any) => !p.role?.startsWith('medecin')).length, v.length]),
            totals: ['TOTAL', personnel.filter((p: any) => p.role?.startsWith('medecin')).length, personnel.filter((p: any) => !p.role?.startsWith('medecin')).length, personnel.length],
          },
          {
            title: 'Liste nominative',
            columns: [
              { header: 'Code', width: 10 }, { header: 'Nom & prénom', width: 18 }, { header: 'Rôle', width: 14 }, { header: 'Spécialité', width: 13 },
              { header: 'Département', width: 13 }, { header: 'Téléphone', width: 12 }, { header: 'Email', width: 18 }, { header: 'Embauché le', type: 'date', width: 10 }, { header: 'Statut', width: 7 },
            ],
            rows: personnel.map((p: any) => [p.code_personnel, nom(p), roleLabels[p.role as keyof typeof roleLabels] || p.role, p.specialite, p.departements?.nom, p.telephone, p.email, p.date_embauche, p.statut]),
          },
        ],
      };
    },
  },
  {
    id: 'journal-activite',
    category: 'administration',
    title: "Journal d'activité",
    description: 'Créations, modifications et suppressions effectuées par chaque utilisateur sur la période (traçabilité).',
    roles: ['super_admin', 'admin'],
    period: 'periode',
    defaultMode: 'jour',
    orientation: 'landscape',
    run: async ({ period }) => {
      const p = period!;
      const logs = await fetchAll((a, b) => supabase.from('audit_logs').select('timestamp, user_email, action, table_name, new_values, old_values')
        .gte('timestamp', iso(p.from)).lte('timestamp', iso(p.to)).order('timestamp').range(a, b), 10000);
      const ACTION: Record<string, string> = { INSERT: 'Création', UPDATE: 'Modification', DELETE: 'Suppression' };
      const decrire = (l: any) => {
        const v = l.new_values || l.old_values || {};
        return v.prenom && v.nom ? `${v.prenom} ${v.nom}` : v.numero_facture || v.numero || v.nom_commercial || v.nom_medicament || v.type_analyse || v.libelle || v.motif || v.motif_admission || v.nom || '';
      };
      return {
        kpis: [
          { label: 'Actions', value: logs.length, type: 'number' },
          { label: 'Utilisateurs actifs', value: new Set(logs.map((l: any) => l.user_email)).size, type: 'number' },
          { label: 'Suppressions', value: logs.filter((l: any) => l.action === 'DELETE').length, type: 'number' },
        ],
        sections: [
          {
            title: 'Actions par utilisateur',
            columns: [{ header: 'Utilisateur', width: 40 }, { header: 'Créations', type: 'number', width: 15 }, { header: 'Modifications', type: 'number', width: 15 }, { header: 'Suppressions', type: 'number', width: 15 }, { header: 'Total', type: 'number', width: 15 }],
            rows: Array.from(groupBy(logs, (l: any) => l.user_email || 'système'), ([k, v]) => [k, v.filter((l: any) => l.action === 'INSERT').length, v.filter((l: any) => l.action === 'UPDATE').length, v.filter((l: any) => l.action === 'DELETE').length, v.length]),
          },
          {
            title: 'Détail des actions',
            columns: [{ header: 'Date & heure', type: 'datetime', width: 14 }, { header: 'Utilisateur', width: 22 }, { header: 'Action', width: 12 }, { header: 'Module', width: 16 }, { header: 'Élément', width: 36 }],
            rows: logs.map((l: any) => [l.timestamp, l.user_email || 'système', ACTION[l.action] || l.action, l.table_name, decrire(l)]),
            highlightRows: logs.map((l: any, i: number) => (l.action === 'DELETE' ? i : -1)).filter((i: number) => i >= 0),
            emptyText: 'Aucune activité sur la période.',
          },
        ],
      };
    },
  },
];
