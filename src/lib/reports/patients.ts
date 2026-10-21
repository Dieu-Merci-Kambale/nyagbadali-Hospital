import { supabase } from '@/lib/supabase';
import { HOSP_STATUTS, ETATS_CIVILS } from '@/lib/format';
import type { ReportDefinition, ReportSection } from './types';
import { fetchAll, iso, nom, docteur, sum, ratio, ageAt, groupBy, daysBetween, TRANCHES_AGE, trancheAge } from './helpers';

const PATIENT_ROLES: ReportDefinition['roles'] = ['super_admin', 'admin', 'medecin_chef', 'medecin', 'infirmier_chef', 'infirmier', 'technicien_labo', 'receptionniste'];
const HOSP_ROLES: ReportDefinition['roles'] = ['super_admin', 'admin', 'medecin_chef', 'medecin', 'infirmier_chef', 'infirmier'];

const sexe = (s?: string) => (s === 'M' ? 'M' : s === 'F' ? 'F' : '—');

/** Pyramide simplifiée : effectifs par tranche d'âge et sexe. */
function repartitionAge(patients: any[]): ReportSection {
  const rows = [...TRANCHES_AGE.map((t) => t.label), 'Âge inconnu'].map((label) => {
    const v = patients.filter((p) => trancheAge(ageAt(p.date_naissance)) === label);
    return [label, v.filter((p) => p.sexe === 'M').length, v.filter((p) => p.sexe === 'F').length, v.length, ratio(v.length, patients.length)];
  }).filter((r) => (r[3] as number) > 0);
  return {
    title: "Répartition par tranche d'âge et sexe",
    columns: [{ header: "Tranche d'âge", width: 34 }, { header: 'Hommes', type: 'number', width: 16 }, { header: 'Femmes', type: 'number', width: 16 }, { header: 'Total', type: 'number', width: 16 }, { header: 'Part', type: 'percent', width: 18 }],
    rows,
    totals: ['TOTAL', patients.filter((p) => p.sexe === 'M').length, patients.filter((p) => p.sexe === 'F').length, patients.length, patients.length ? 1 : 0],
  };
}

function listePatients(patients: any[], title: string): ReportSection {
  return {
    title,
    columns: [
      { header: 'Code', width: 13 }, { header: 'Nom & prénom', width: 22 }, { header: 'Sexe', width: 5, align: 'center' },
      { header: 'Âge', type: 'number', width: 5 }, { header: 'Né(e) le', type: 'date', width: 10 }, { header: 'Téléphone', width: 13 },
      { header: 'Gr. sang.', width: 7 }, { header: 'Profession', width: 14 }, { header: 'État civil', width: 10 },
      { header: 'Assurance', width: 14 }, { header: 'Enregistré le', type: 'date', width: 11 },
    ],
    rows: patients.map((p) => [
      p.code_patient, nom(p), sexe(p.sexe), ageAt(p.date_naissance), p.date_naissance, p.telephone, p.groupe_sanguin,
      p.profession, (p.etat_civil && ETATS_CIVILS[p.etat_civil]) || null, p.assureur, p.created_at,
    ]),
    emptyText: 'Aucun patient.',
  };
}

export const PATIENT_REPORTS: ReportDefinition[] = [
  {
    id: 'registre-patients',
    category: 'patients',
    title: 'Registre des patients',
    description: 'Liste complète des patients avec identité, contact, assurance, et répartition par âge et sexe.',
    roles: PATIENT_ROLES,
    period: 'aucune',
    orientation: 'landscape',
    filters: [{
      key: 'statut', label: 'Statut', defaultValue: 'actif',
      options: [{ value: 'tous', label: 'Tous' }, { value: 'actif', label: 'Actifs' }, { value: 'inactif', label: 'Inactifs' }, { value: 'décédé', label: 'Décédés' }],
    }],
    run: async ({ filters }) => {
      const patients = await fetchAll((a, b) => {
        let q = supabase.from('patients').select('*').order('nom').order('prenom');
        if (filters.statut && filters.statut !== 'tous') q = q.eq('statut', filters.statut);
        return q.range(a, b);
      });
      return {
        kpis: [
          { label: 'Patients', value: patients.length, type: 'number' },
          { label: 'Hommes', value: patients.filter((p) => p.sexe === 'M').length, type: 'number' },
          { label: 'Femmes', value: patients.filter((p) => p.sexe === 'F').length, type: 'number' },
          { label: 'Assurés', value: ratio(patients.filter((p) => p.assureur).length, patients.length), type: 'percent' },
        ],
        sections: [repartitionAge(patients), listePatients(patients, 'Liste des patients')],
      };
    },
  },
  {
    id: 'nouveaux-patients',
    category: 'patients',
    title: 'Nouveaux patients',
    description: 'Patients enregistrés sur la période, avec répartition par âge et sexe.',
    roles: PATIENT_ROLES,
    period: 'periode',
    defaultMode: 'mois',
    orientation: 'landscape',
    run: async ({ period }) => {
      const p = period!;
      const patients = await fetchAll((a, b) => supabase.from('patients').select('*')
        .gte('created_at', iso(p.from)).lte('created_at', iso(p.to)).order('created_at').range(a, b));
      return {
        kpis: [
          { label: 'Nouveaux patients', value: patients.length, type: 'number' },
          { label: 'Hommes', value: patients.filter((x) => x.sexe === 'M').length, type: 'number' },
          { label: 'Femmes', value: patients.filter((x) => x.sexe === 'F').length, type: 'number' },
          { label: 'Enfants de moins de 5 ans', value: patients.filter((x) => { const a = ageAt(x.date_naissance); return a !== null && a < 5; }).length, type: 'number' },
        ],
        sections: [repartitionAge(patients), listePatients(patients, 'Patients enregistrés')],
      };
    },
  },

  // ===== Hospitalisation =====
  {
    id: 'patients-hospitalises',
    category: 'hospitalisation',
    title: 'Patients hospitalisés (internés)',
    description: 'Liste des patients actuellement hospitalisés : chambre, lit, durée de séjour, médecin, motif et diagnostic.',
    roles: HOSP_ROLES,
    period: 'aucune',
    orientation: 'landscape',
    signatures: ['Infirmier(e) de garde', 'Médecin responsable'],
    run: async () => {
      const [hosp, lits] = await Promise.all([
        fetchAll((a, b) => supabase.from('hospitalisations')
          .select('date_admission, type_admission, motif_admission, diagnostic_entree, patients(nom, prenom, code_patient, sexe, date_naissance, allergies), lits(numero, type_lit, chambres(numero, etage)), medecin:personnel(nom, prenom)')
          .eq('statut', 'actif').order('date_admission').range(a, b)),
        fetchAll((a, b) => supabase.from('lits').select('statut').range(a, b)),
      ]);
      const durees = hosp.map((h: any) => daysBetween(h.date_admission) + 1);
      return {
        kpis: [
          { label: 'Patients internés', value: hosp.length, type: 'number' },
          { label: 'Admis en urgence', value: hosp.filter((h: any) => h.type_admission === 'urgence').length, type: 'number' },
          { label: 'Durée moyenne actuelle', value: hosp.length ? `${(sum(durees, (d) => d) / hosp.length).toFixed(1).replace('.', ',')} j` : '—' },
          { label: "Taux d'occupation des lits", value: ratio(lits.filter((l: any) => l.statut === 'occupé').length, lits.length), type: 'percent' },
        ],
        sections: [{
          title: 'Liste des patients hospitalisés',
          columns: [
            { header: 'Patient', width: 18 }, { header: 'Code', width: 12 }, { header: 'S / Âge', width: 7 },
            { header: 'Chambre / lit', width: 11 }, { header: 'Admis le', type: 'datetime', width: 12 }, { header: 'Jours', type: 'number', width: 6 },
            { header: 'Type', width: 9 }, { header: 'Médecin', width: 13 }, { header: 'Motif / diagnostic', width: 24 },
          ],
          rows: hosp.map((h: any, i: number) => [
            nom(h.patients), h.patients?.code_patient, `${sexe(h.patients?.sexe)} / ${ageAt(h.patients?.date_naissance) ?? '?'}`,
            h.lits ? `Ch. ${h.lits.chambres?.numero} / ${h.lits.numero}` : '—', h.date_admission, durees[i], h.type_admission,
            h.medecin ? docteur(h.medecin) : '—', [h.motif_admission, h.diagnostic_entree].filter(Boolean).join(' — '),
          ]),
          highlightRows: hosp.map((h: any, i: number) => (h.type_admission === 'urgence' ? i : -1)).filter((i: number) => i >= 0),
          emptyText: 'Aucun patient hospitalisé actuellement.',
        }],
      };
    },
  },
  {
    id: 'mouvements-hospitaliers',
    category: 'hospitalisation',
    title: 'Mouvements hospitaliers',
    description: 'Admissions et sorties de la période : guérisons, transferts, décès, durée moyenne de séjour (DMS).',
    roles: HOSP_ROLES,
    period: 'periode',
    defaultMode: 'mois',
    orientation: 'landscape',
    signatures: ['Le médecin chef'],
    run: async ({ period }) => {
      const p = period!;
      const sel = 'date_admission, date_sortie, statut, type_admission, motif_admission, diagnostic_entree, diagnostic_sortie, patients(nom, prenom, code_patient, sexe, date_naissance), lits(numero, chambres(numero)), medecin:personnel(nom, prenom)';
      const [admissions, sorties] = await Promise.all([
        fetchAll((a, b) => supabase.from('hospitalisations').select(sel).gte('date_admission', iso(p.from)).lte('date_admission', iso(p.to)).order('date_admission').range(a, b)),
        fetchAll((a, b) => supabase.from('hospitalisations').select(sel).gte('date_sortie', iso(p.from)).lte('date_sortie', iso(p.to)).order('date_sortie').range(a, b)),
      ]);
      const sejours = sorties.map((h: any) => Math.max(1, Math.ceil((new Date(h.date_sortie).getTime() - new Date(h.date_admission).getTime()) / 86_400_000)));
      const deces = sorties.filter((h: any) => h.statut === 'décédé').length;
      return {
        kpis: [
          { label: 'Admissions', value: admissions.length, type: 'number', hint: `${admissions.filter((h: any) => h.type_admission === 'urgence').length} en urgence` },
          { label: 'Sorties', value: sorties.length, type: 'number' },
          { label: 'Durée moyenne de séjour', value: sejours.length ? `${(sum(sejours, (d) => d) / sejours.length).toFixed(1).replace('.', ',')} j` : '—' },
          { label: 'Décès', value: deces, type: 'number', hint: `Taux : ${(ratio(deces, sorties.length) * 100).toFixed(1).replace('.', ',')} %` },
        ],
        sections: [
          {
            title: 'Sorties par mode',
            columns: [{ header: 'Mode de sortie', width: 50 }, { header: 'Nombre', type: 'number', width: 25 }, { header: 'Part', type: 'percent', width: 25 }],
            rows: Array.from(groupBy(sorties, (h: any) => HOSP_STATUTS[h.statut]?.label || h.statut), ([k, v]) => [k === 'Sorti' ? 'Sortie (guérison / décharge)' : k, v.length, ratio(v.length, sorties.length)]),
            totals: ['TOTAL', sorties.length, sorties.length ? 1 : 0],
          },
          {
            title: 'Admissions de la période',
            columns: [
              { header: 'Admis le', type: 'datetime', width: 12 }, { header: 'Patient', width: 18 }, { header: 'Code', width: 12 },
              { header: 'Type', width: 9 }, { header: 'Lit', width: 10 }, { header: 'Médecin', width: 14 }, { header: 'Motif', width: 25 },
            ],
            rows: admissions.map((h: any) => [h.date_admission, nom(h.patients), h.patients?.code_patient, h.type_admission, h.lits ? `Ch. ${h.lits.chambres?.numero} / ${h.lits.numero}` : '—', h.medecin ? docteur(h.medecin) : '—', h.motif_admission]),
            emptyText: 'Aucune admission sur la période.',
          },
          {
            title: 'Sorties de la période',
            columns: [
              { header: 'Sorti le', type: 'datetime', width: 12 }, { header: 'Patient', width: 18 }, { header: 'Admis le', type: 'date', width: 10 },
              { header: 'Jours', type: 'number', width: 6 }, { header: 'Mode', width: 10 }, { header: 'Diagnostic de sortie', width: 44 },
            ],
            rows: sorties.map((h: any, i: number) => [h.date_sortie, nom(h.patients), h.date_admission, sejours[i], HOSP_STATUTS[h.statut]?.label || h.statut, h.diagnostic_sortie || h.diagnostic_entree]),
            highlightRows: sorties.map((h: any, i: number) => (h.statut === 'décédé' ? i : -1)).filter((i: number) => i >= 0),
            emptyText: 'Aucune sortie sur la période.',
          },
        ],
      };
    },
  },
  {
    id: 'occupation-lits',
    category: 'hospitalisation',
    title: 'Occupation des lits',
    description: 'État de chaque chambre et de chaque lit : occupés, disponibles, en maintenance, avec le patient présent.',
    roles: HOSP_ROLES,
    period: 'aucune',
    orientation: 'landscape',
    run: async () => {
      const [chambres, lits, hosp] = await Promise.all([
        fetchAll((a, b) => supabase.from('chambres').select('id, numero, etage, type, capacite, departements(nom)').order('numero').range(a, b)),
        fetchAll((a, b) => supabase.from('lits').select('id, numero, type_lit, statut, chambre_id').order('numero').range(a, b)),
        fetchAll((a, b) => supabase.from('hospitalisations').select('lit_id, date_admission, patients(nom, prenom, code_patient)').eq('statut', 'actif').range(a, b)),
      ]);
      const occupant = new Map(hosp.map((h: any) => [h.lit_id, h]));
      const parChambre = chambres.map((c: any) => {
        const ls = lits.filter((l: any) => l.chambre_id === c.id);
        const occ = ls.filter((l: any) => l.statut === 'occupé').length;
        return [c.numero, c.etage, c.type, c.departements?.nom, ls.length, occ, ls.filter((l: any) => l.statut === 'disponible').length, ls.filter((l: any) => ['maintenance', 'réservé'].includes(l.statut)).length, ratio(occ, ls.length)];
      });
      const total = lits.length;
      const occupes = lits.filter((l: any) => l.statut === 'occupé').length;
      const chambreNum = new Map(chambres.map((c: any) => [c.id, c.numero]));
      return {
        kpis: [
          { label: 'Lits', value: total, type: 'number' },
          { label: 'Occupés', value: occupes, type: 'number' },
          { label: 'Disponibles', value: lits.filter((l: any) => l.statut === 'disponible').length, type: 'number' },
          { label: "Taux d'occupation", value: ratio(occupes, total), type: 'percent' },
        ],
        sections: [
          {
            title: 'Occupation par chambre',
            columns: [
              { header: 'Chambre', width: 10 }, { header: 'Étage', width: 11 }, { header: 'Type', width: 12 }, { header: 'Service', width: 17 },
              { header: 'Lits', type: 'number', width: 8 }, { header: 'Occupés', type: 'number', width: 9 }, { header: 'Libres', type: 'number', width: 9 },
              { header: 'Indispo.', type: 'number', width: 9 }, { header: 'Occupation', type: 'percent', width: 11 },
            ],
            rows: parChambre,
            totals: ['TOTAL', '', '', '', total, occupes, lits.filter((l: any) => l.statut === 'disponible').length, lits.filter((l: any) => ['maintenance', 'réservé'].includes(l.statut)).length, ratio(occupes, total)],
          },
          {
            title: 'Détail des lits',
            columns: [
              { header: 'Chambre', width: 10 }, { header: 'Lit', width: 12 }, { header: 'Type de lit', width: 16 }, { header: 'Statut', width: 12 },
              { header: 'Patient présent', width: 28 }, { header: 'Depuis le', type: 'date', width: 12 },
            ],
            rows: lits.map((l: any) => {
              const h: any = occupant.get(l.id);
              return [chambreNum.get(l.chambre_id) || '—', l.numero, String(l.type_lit || '').replace('_', ' '), l.statut, h ? `${nom(h.patients)} (${h.patients?.code_patient})` : '', h?.date_admission];
            }),
          },
        ],
      };
    },
  },
];
