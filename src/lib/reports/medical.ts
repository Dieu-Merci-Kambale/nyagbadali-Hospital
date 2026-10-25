import { supabase } from '@/lib/supabase';
import { RDV_STATUTS, RDV_TYPES } from '@/lib/format';
import type { ReportDefinition } from './types';
import { fetchAll, iso, nom, docteur, ratio, ageAt, groupBy } from './helpers';

const MEDICAL_ROLES: ReportDefinition['roles'] = ['super_admin', 'admin', 'medecin_chef', 'medecin', 'infirmier_chef', 'infirmier'];
const RDV_ROLES: ReportDefinition['roles'] = ['super_admin', 'admin', 'medecin_chef', 'medecin', 'infirmier_chef', 'infirmier', 'receptionniste'];

const sexe = (s?: string) => (s === 'M' ? 'M' : s === 'F' ? 'F' : '—');

export const MEDICAL_REPORTS: ReportDefinition[] = [
  {
    id: 'registre-consultations',
    category: 'medical',
    title: 'Registre des consultations',
    description: 'Toutes les consultations de la période : patient, médecin, motif, diagnostic et statut.',
    roles: MEDICAL_ROLES,
    period: 'periode',
    defaultMode: 'jour',
    orientation: 'landscape',
    filters: [{
      key: 'medecin', label: 'Médecin', defaultValue: 'tous',
      options: [{ value: 'tous', label: 'Tous les médecins' }, { value: 'moi', label: 'Mes consultations' }],
    }],
    run: async ({ period, filters }) => {
      const p = period!;
      let moi: string | null = null;
      if (filters.medecin === 'moi') {
        const { data: u } = await supabase.auth.getUser();
        const { data: me } = await supabase.from('personnel').select('id').ilike('email', u.user?.email || '').maybeSingle();
        moi = me?.id || null;
      }
      const consultations = await fetchAll((a, b) => {
        let q = supabase.from('consultations')
          .select('date_consultation, motif, diagnostic_principal, statut, patient_id, patients(nom, prenom, code_patient, sexe, date_naissance), personnel(nom, prenom, role)')
          .gte('date_consultation', iso(p.from)).lte('date_consultation', iso(p.to)).order('date_consultation');
        if (moi) q = q.eq('medecin_id', moi);
        return q.range(a, b);
      });
      return {
        kpis: [
          { label: 'Consultations', value: consultations.length, type: 'number' },
          { label: 'Patients distincts', value: new Set(consultations.map((c: any) => c.patient_id)).size, type: 'number' },
          { label: 'Terminées', value: consultations.filter((c: any) => c.statut === 'terminée').length, type: 'number' },
          { label: 'En cours (examens attendus)', value: consultations.filter((c: any) => c.statut === 'en_cours').length, type: 'number' },
        ],
        sections: [{
          title: 'Consultations',
          columns: [
            { header: 'Date & heure', type: 'datetime', width: 12 }, { header: 'Patient', width: 17 }, { header: 'Code', width: 12 },
            { header: 'S / Âge', width: 7 }, { header: 'Médecin', width: 14 }, { header: 'Motif', width: 18 }, { header: 'Diagnostic', width: 20 },
          ],
          rows: consultations.map((c: any) => [c.date_consultation, nom(c.patients), c.patients?.code_patient, `${sexe(c.patients?.sexe)} / ${ageAt(c.patients?.date_naissance, new Date(c.date_consultation)) ?? '?'}`, docteur(c.personnel), c.motif, c.diagnostic_principal]),
          emptyText: 'Aucune consultation sur la période.',
        }],
      };
    },
  },
  {
    id: 'activite-medecins',
    category: 'medical',
    title: 'Activité par médecin',
    description: 'Pour chaque médecin : consultations, patients vus, prescriptions, examens demandés, admissions et rendez-vous honorés.',
    roles: ['super_admin', 'admin', 'medecin_chef'],
    period: 'periode',
    defaultMode: 'mois',
    orientation: 'landscape',
    signatures: ['Le médecin chef'],
    run: async ({ period }) => {
      const p = period!;
      const [medecins, consultations, prescriptions, analyses, admissions, rdvs] = await Promise.all([
        fetchAll((a, b) => supabase.from('personnel').select('id, nom, prenom, specialite').in('role', ['medecin', 'medecin_chef']).order('nom').range(a, b)),
        fetchAll((a, b) => supabase.from('consultations').select('medecin_id, patient_id').gte('date_consultation', iso(p.from)).lte('date_consultation', iso(p.to)).range(a, b)),
        fetchAll((a, b) => supabase.from('prescriptions').select('id, consultations!inner(medecin_id, date_consultation)')
          .gte('consultations.date_consultation', iso(p.from)).lte('consultations.date_consultation', iso(p.to)).range(a, b)),
        fetchAll((a, b) => supabase.from('analyses_laboratoire').select('medecin_prescripteur_id').neq('statut', 'annulé').gte('date_demande', iso(p.from)).lte('date_demande', iso(p.to)).range(a, b)),
        fetchAll((a, b) => supabase.from('hospitalisations').select('medecin_responsable_id').gte('date_admission', iso(p.from)).lte('date_admission', iso(p.to)).range(a, b)),
        fetchAll((a, b) => supabase.from('rendez_vous').select('medecin_id, statut').gte('date_heure', iso(p.from)).lte('date_heure', iso(p.to)).range(a, b)),
      ]);
      const rows = medecins.map((m: any) => {
        const cs = consultations.filter((c: any) => c.medecin_id === m.id);
        const rv = rdvs.filter((r: any) => r.medecin_id === m.id);
        return [
          docteur(m), m.specialite, cs.length, new Set(cs.map((c: any) => c.patient_id)).size,
          prescriptions.filter((x: any) => x.consultations?.medecin_id === m.id).length,
          analyses.filter((x: any) => x.medecin_prescripteur_id === m.id).length,
          admissions.filter((x: any) => x.medecin_responsable_id === m.id).length,
          rv.filter((r: any) => r.statut === 'terminé').length,
          ratio(rv.filter((r: any) => r.statut === 'absent').length, rv.filter((r: any) => ['terminé', 'absent'].includes(r.statut)).length),
        ];
      }).sort((a, b) => (b[2] as number) - (a[2] as number));
      const tot = (i: number) => rows.reduce((s, r) => s + (r[i] as number), 0);
      return {
        kpis: [
          { label: 'Consultations', value: consultations.length, type: 'number' },
          { label: 'Prescriptions', value: prescriptions.length, type: 'number' },
          { label: 'Examens demandés', value: analyses.length, type: 'number' },
          { label: 'Admissions', value: admissions.length, type: 'number' },
        ],
        sections: [{
          title: 'Activité par médecin',
          columns: [
            { header: 'Médecin', width: 18 }, { header: 'Spécialité', width: 15 }, { header: 'Consult.', type: 'number', width: 9 },
            { header: 'Patients', type: 'number', width: 9 }, { header: 'Prescript.', type: 'number', width: 9 }, { header: 'Examens', type: 'number', width: 9 },
            { header: 'Admissions', type: 'number', width: 10 }, { header: 'RDV vus', type: 'number', width: 9 }, { header: 'Absentéisme', type: 'percent', width: 12 },
          ],
          rows,
          totals: ['TOTAL', '', tot(2), '', tot(4), tot(5), tot(6), tot(7), ''],
          emptyText: 'Aucun médecin enregistré.',
        }],
      };
    },
  },
  {
    id: 'morbidite',
    category: 'medical',
    title: 'Morbidité (diagnostics)',
    description: 'Diagnostics posés sur la période, répartis par sexe et tranche d’âge (format des rapports sanitaires SNIS).',
    roles: MEDICAL_ROLES,
    period: 'periode',
    defaultMode: 'mois',
    orientation: 'landscape',
    signatures: ['Le médecin chef'],
    run: async ({ period }) => {
      const p = period!;
      const consultations = await fetchAll((a, b) => supabase.from('consultations')
        .select('date_consultation, diagnostic_principal, patients(sexe, date_naissance)')
        .not('diagnostic_principal', 'is', null).neq('statut', 'annulée')
        .gte('date_consultation', iso(p.from)).lte('date_consultation', iso(p.to)).range(a, b));
      const avecDiag = consultations.filter((c: any) => String(c.diagnostic_principal || '').trim());
      // Regroupement insensible à la casse et aux espaces superflus
      const groupes = groupBy(avecDiag, (c: any) => String(c.diagnostic_principal).trim().toLowerCase().replace(/\s+/g, ' '));
      const age = (c: any) => ageAt(c.patients?.date_naissance, new Date(c.date_consultation));
      const dans = (c: any, min: number, max: number) => { const a = age(c); return a !== null && a >= min && a <= max; };
      const rows = Array.from(groupes.values()).map((v: any[]) => [
        String(v[0].diagnostic_principal).trim(), v.length,
        v.filter((c) => c.patients?.sexe === 'M').length, v.filter((c) => c.patients?.sexe === 'F').length,
        v.filter((c) => dans(c, 0, 4)).length, v.filter((c) => dans(c, 5, 14)).length,
        v.filter((c) => dans(c, 15, 49)).length, v.filter((c) => dans(c, 50, 200)).length,
        ratio(v.length, avecDiag.length),
      ]).sort((a, b) => (b[1] as number) - (a[1] as number));
      const col = (i: number) => rows.reduce((s, r) => s + (r[i] as number), 0);
      return {
        kpis: [
          { label: 'Consultations avec diagnostic', value: avecDiag.length, type: 'number' },
          { label: 'Diagnostics distincts', value: rows.length, type: 'number' },
          { label: 'Diagnostic le plus fréquent', value: rows[0] ? String(rows[0][0]) : '—' },
        ],
        sections: [{
          title: 'Diagnostics par sexe et tranche d’âge',
          columns: [
            { header: 'Diagnostic', width: 30 }, { header: 'Cas', type: 'number', width: 8 }, { header: 'M', type: 'number', width: 7 },
            { header: 'F', type: 'number', width: 7 }, { header: '0-4 ans', type: 'number', width: 9 }, { header: '5-14 ans', type: 'number', width: 9 },
            { header: '15-49 ans', type: 'number', width: 10 }, { header: '50 ans +', type: 'number', width: 9 }, { header: 'Part', type: 'percent', width: 9 },
          ],
          rows,
          totals: ['TOTAL', col(1), col(2), col(3), col(4), col(5), col(6), col(7), avecDiag.length ? 1 : 0],
          emptyText: 'Aucun diagnostic sur la période.',
        }],
        notes: ['Les diagnostics identiques à la casse près sont regroupés. Les âges sont calculés à la date de la consultation.'],
      };
    },
  },
  {
    id: 'rendez-vous',
    category: 'medical',
    title: 'Rendez-vous',
    description: 'Agenda de la période avec statut de chaque rendez-vous, taux de présence et d’absentéisme.',
    roles: RDV_ROLES,
    period: 'periode',
    defaultMode: 'jour',
    orientation: 'landscape',
    run: async ({ period }) => {
      const p = period!;
      const rdvs = await fetchAll((a, b) => supabase.from('rendez_vous')
        .select('date_heure, duree_minutes, motif, type, statut, numero_queue, patients(nom, prenom, code_patient, telephone), personnel(nom, prenom, role)')
        .gte('date_heure', iso(p.from)).lte('date_heure', iso(p.to)).order('date_heure').range(a, b));
      const passes = rdvs.filter((r: any) => ['terminé', 'absent'].includes(r.statut));
      return {
        kpis: [
          { label: 'Rendez-vous', value: rdvs.length, type: 'number' },
          { label: 'Honorés', value: rdvs.filter((r: any) => r.statut === 'terminé').length, type: 'number' },
          { label: 'Absents', value: rdvs.filter((r: any) => r.statut === 'absent').length, type: 'number' },
          { label: "Taux d'absentéisme", value: ratio(rdvs.filter((r: any) => r.statut === 'absent').length, passes.length), type: 'percent' },
        ],
        sections: [
          {
            title: 'Répartition par statut',
            columns: [{ header: 'Statut', width: 50 }, { header: 'Nombre', type: 'number', width: 25 }, { header: 'Part', type: 'percent', width: 25 }],
            rows: Array.from(groupBy(rdvs, (r: any) => RDV_STATUTS[r.statut]?.label || r.statut), ([k, v]) => [k, v.length, ratio(v.length, rdvs.length)]),
            totals: ['TOTAL', rdvs.length, rdvs.length ? 1 : 0],
          },
          {
            title: 'Liste des rendez-vous',
            columns: [
              { header: 'Date & heure', type: 'datetime', width: 12 }, { header: 'Ticket', width: 6, align: 'center' }, { header: 'Patient', width: 18 },
              { header: 'Téléphone', width: 12 }, { header: 'Médecin', width: 14 }, { header: 'Type', width: 10 }, { header: 'Motif', width: 18 }, { header: 'Statut', width: 10 },
            ],
            rows: rdvs.map((r: any) => [r.date_heure, r.numero_queue ? String(r.numero_queue) : '', nom(r.patients), r.patients?.telephone, docteur(r.personnel), RDV_TYPES[r.type] || r.type, r.motif, RDV_STATUTS[r.statut]?.label || r.statut]),
            highlightRows: rdvs.map((r: any, i: number) => (r.statut === 'absent' ? i : -1)).filter((i: number) => i >= 0),
            emptyText: 'Aucun rendez-vous sur la période.',
          },
        ],
      };
    },
  },
];
