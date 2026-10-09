'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3, Loader2, Download, Stethoscope, UserPlus, BedDouble, Banknote, Receipt, CalendarX, FlaskConical, TrendingUp, Table2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ColumnChart, BarList, type Datum } from '@/components/charts/SimpleCharts';
import { formatMoney, toDateKey, downloadCsv, MODES_PAIEMENT, capitalize } from '@/lib/format';

type Periode = 'mois' | 'mois_prec' | '7j' | '30j' | 'annee' | 'perso';

const PERIODES: { key: Periode; label: string }[] = [
  { key: 'mois', label: 'Ce mois-ci' },
  { key: 'mois_prec', label: 'Mois précédent' },
  { key: '7j', label: '7 derniers jours' },
  { key: '30j', label: '30 derniers jours' },
  { key: 'annee', label: 'Cette année' },
  { key: 'perso', label: 'Personnalisée' },
];

function rangeFor(p: Periode, debut: string, fin: string): { from: Date; to: Date } {
  const now = new Date();
  const startOf = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const endOf = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
  switch (p) {
    case 'mois': return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOf(now) };
    case 'mois_prec': return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: endOf(new Date(now.getFullYear(), now.getMonth(), 0)) };
    case '7j': return { from: startOf(new Date(Date.now() - 6 * 86_400_000)), to: endOf(now) };
    case '30j': return { from: startOf(new Date(Date.now() - 29 * 86_400_000)), to: endOf(now) };
    case 'annee': return { from: new Date(now.getFullYear(), 0, 1), to: endOf(now) };
    case 'perso': {
      const from = debut ? startOf(new Date(`${debut}T00:00:00`)) : new Date(now.getFullYear(), now.getMonth(), 1);
      const to = fin ? endOf(new Date(`${fin}T00:00:00`)) : endOf(now);
      return { from, to };
    }
  }
}

const countBy = <T,>(rows: T[], key: (r: T) => string, value: (r: T) => number = () => 1): Datum[] => {
  const map = new Map<string, number>();
  rows.forEach((r) => {
    const k = key(r) || 'Non renseigné';
    map.set(k, (map.get(k) || 0) + value(r));
  });
  return Array.from(map, ([label, v]) => ({ label, value: v }));
};

export default function RapportsPage() {
  const [periode, setPeriode] = useState<Periode>('mois');
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [loading, setLoading] = useState(true);
  const [showTable, setShowTable] = useState(false);
  const [data, setData] = useState<{
    consultations: any[]; patients: any[]; admissions: any[]; sorties: any[]; paiements: any[];
    factures: any[]; rdvs: any[]; analyses: any[]; lits: any[];
  } | null>(null);

  const { from, to } = useMemo(() => rangeFor(periode, debut, fin), [periode, debut, fin]);

  const load = useCallback(async () => {
    setLoading(true);
    const f = from.toISOString();
    const t = to.toISOString();
    const [c, p, adm, sor, pay, fac, rdv, lab, lits] = await Promise.all([
      supabase.from('consultations').select('id, date_consultation, diagnostic_principal, statut, medecin_id, personnel(nom, prenom)').gte('date_consultation', f).lte('date_consultation', t),
      supabase.from('patients').select('id, created_at, sexe').gte('created_at', f).lte('created_at', t),
      supabase.from('hospitalisations').select('id, date_admission, type_admission').gte('date_admission', f).lte('date_admission', t),
      supabase.from('hospitalisations').select('id, date_admission, date_sortie, statut').gte('date_sortie', f).lte('date_sortie', t),
      supabase.from('paiements').select('montant, mode_paiement, date_paiement').gte('date_paiement', f).lte('date_paiement', t),
      supabase.from('factures').select('montant_total, montant_assurance, montant_patient, statut, date_facture').gte('date_facture', f).lte('date_facture', t),
      supabase.from('rendez_vous').select('statut, date_heure').gte('date_heure', f).lte('date_heure', t),
      supabase.from('analyses_laboratoire').select('type_analyse, statut, date_demande').gte('date_demande', f).lte('date_demande', t),
      supabase.from('lits').select('statut'),
    ]);
    setData({
      consultations: c.data || [], patients: p.data || [], admissions: adm.data || [], sorties: sor.data || [],
      paiements: pay.data || [], factures: fac.data || [], rdvs: rdv.data || [], analyses: lab.data || [], lits: lits.data || [],
    });
    setLoading(false);
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    if (!data) return null;
    const encaisse = data.paiements.reduce((s, p) => s + Number(p.montant || 0), 0);
    const facturesValides = data.factures.filter((f) => f.statut !== 'annulée');
    const facture = facturesValides.reduce((s, f) => s + Number(f.montant_total || 0), 0);
    const partAssurance = facturesValides.reduce((s, f) => s + Number(f.montant_assurance || 0), 0);
    const rdvPasses = data.rdvs.filter((r) => ['terminé', 'absent'].includes(r.statut));
    const absents = data.rdvs.filter((r) => r.statut === 'absent').length;
    const dms = data.sorties.length
      ? data.sorties.reduce((s, h) => s + (new Date(h.date_sortie).getTime() - new Date(h.date_admission).getTime()) / 86_400_000, 0) / data.sorties.length
      : 0;
    const litsOccupes = data.lits.filter((l) => l.statut === 'occupé').length;

    // Encaissements par jour (ou par mois sur une longue période)
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
    const parMois = days > 62;
    const buckets: Datum[] = [];
    if (parMois) {
      const cur = new Date(from.getFullYear(), from.getMonth(), 1);
      while (cur <= to) {
        const key = `${cur.getFullYear()}-${cur.getMonth()}`;
        const value = data.paiements.filter((p) => { const d = new Date(p.date_paiement); return `${d.getFullYear()}-${d.getMonth()}` === key; }).reduce((s, p) => s + Number(p.montant || 0), 0);
        buckets.push({ label: cur.toLocaleDateString('fr-FR', { month: 'short' }), hint: cur.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }), value });
        cur.setMonth(cur.getMonth() + 1);
      }
    } else {
      for (let i = 0; i < days; i++) {
        const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
        const key = toDateKey(d);
        const value = data.paiements.filter((p) => toDateKey(p.date_paiement) === key).reduce((s, p) => s + Number(p.montant || 0), 0);
        buckets.push({ label: String(d.getDate()), hint: d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }), value });
      }
    }

    return {
      consultations: data.consultations.length,
      nouveauxPatients: data.patients.length,
      admissions: data.admissions.length,
      sorties: data.sorties.length,
      encaisse,
      facture,
      partAssurance,
      nbFactures: facturesValides.length,
      absenteisme: rdvPasses.length ? Math.round((absents / rdvPasses.length) * 100) : 0,
      dms,
      occupation: data.lits.length ? Math.round((litsOccupes / data.lits.length) * 100) : 0,
      analyses: data.analyses.length,
      encaissementsSerie: buckets,
      parMois,
      parMode: countBy(data.paiements, (p) => MODES_PAIEMENT[p.mode_paiement] || capitalize(p.mode_paiement), (p) => Number(p.montant || 0)),
      parMedecin: countBy(data.consultations, (c) => (c.personnel ? `Dr. ${c.personnel.prenom} ${c.personnel.nom}` : 'Non attribué')),
      diagnostics: countBy(data.consultations.filter((c) => c.diagnostic_principal), (c) => String(c.diagnostic_principal).trim()),
      examens: countBy(data.analyses.filter((a) => a.statut !== 'annulé'), (a) => a.type_analyse),
    };
  }, [data, from, to]);

  const periodeLabel = `du ${from.toLocaleDateString('fr-FR')} au ${to.toLocaleDateString('fr-FR')}`;

  const exportCsv = () => {
    if (!stats) return;
    const rows: (string | number)[][] = [
      ['Période', periodeLabel],
      ['Consultations', stats.consultations],
      ['Nouveaux patients', stats.nouveauxPatients],
      ['Admissions', stats.admissions],
      ['Sorties', stats.sorties],
      ['Durée moyenne de séjour (jours)', stats.dms.toFixed(1).replace('.', ',')],
      ["Taux d'occupation actuel (%)", stats.occupation],
      ['Analyses de laboratoire', stats.analyses],
      ['Taux d\'absentéisme aux RDV (%)', stats.absenteisme],
      ['Factures émises', stats.nbFactures],
      ['Montant facturé (FC)', Math.round(stats.facture)],
      ['Part assurance (FC)', Math.round(stats.partAssurance)],
      ['Encaissements (FC)', Math.round(stats.encaisse)],
      [],
      ['Encaissements par mode de paiement'],
      ...stats.parMode.map((d) => [d.label, Math.round(d.value)]),
      [],
      ['Consultations par médecin'],
      ...stats.parMedecin.sort((a, b) => b.value - a.value).map((d) => [d.label, d.value]),
      [],
      ['Diagnostics les plus fréquents'],
      ...stats.diagnostics.sort((a, b) => b.value - a.value).map((d) => [d.label, d.value]),
      [],
      [stats.parMois ? 'Encaissements par mois' : 'Encaissements par jour'],
      ...stats.encaissementsSerie.map((d) => [d.hint || d.label, Math.round(d.value)]),
    ];
    downloadCsv(`rapport-activite-${toDateKey(from)}-${toDateKey(to)}.csv`, ['Indicateur', 'Valeur'], rows);
  };

  const kpis = stats ? [
    { label: 'Consultations', value: stats.consultations, icon: <Stethoscope size={22} />, color: 'blue' },
    { label: 'Nouveaux patients', value: stats.nouveauxPatients, icon: <UserPlus size={22} />, color: 'teal' },
    { label: 'Admissions', value: stats.admissions, icon: <BedDouble size={22} />, color: 'orange', sub: `${stats.sorties} sortie(s) • DMS ${stats.dms.toFixed(1).replace('.', ',')} j` },
    { label: 'Encaissements', value: formatMoney(stats.encaisse), icon: <Banknote size={22} />, color: 'green', sub: `Facturé : ${formatMoney(stats.facture)}` },
    { label: 'Factures émises', value: stats.nbFactures, icon: <Receipt size={22} />, color: 'purple', sub: `Part assurance : ${formatMoney(stats.partAssurance)}` },
    { label: "Taux d'occupation", value: `${stats.occupation} %`, icon: <TrendingUp size={22} />, color: 'blue', sub: 'Lits occupés actuellement' },
    { label: 'Absentéisme RDV', value: `${stats.absenteisme} %`, icon: <CalendarX size={22} />, color: 'red', sub: 'Absents / RDV passés' },
    { label: 'Analyses demandées', value: stats.analyses, icon: <FlaskConical size={22} />, color: 'purple' },
  ] : [];

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Rapports & statistiques</h1>
          <p className="page-subtitle">Activité de l&apos;hôpital {periodeLabel}</p>
        </div>
        <button className="btn btn-outline" onClick={exportCsv} disabled={!stats}><Download size={16} /> Exporter le rapport</button>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '14px 22px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {PERIODES.map((p) => (
            <button key={p.key} className={`btn btn-sm ${periode === p.key ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPeriode(p.key)}>{p.label}</button>
          ))}
          {periode === 'perso' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 8 }}>
              <input type="date" className="form-input" style={{ width: 150 }} value={debut} onChange={(e) => setDebut(e.target.value)} />
              <span style={{ color: 'var(--neutral-500)', fontSize: 13 }}>au</span>
              <input type="date" className="form-input" style={{ width: 150 }} value={fin} onChange={(e) => setFin(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      {loading || !stats ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>
      ) : (
        <>
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
            {kpis.map((k) => (
              <div key={k.label} className="stat-card">
                <div className={`stat-card-icon ${k.color}`}>{k.icon}</div>
                <div className="stat-card-info">
                  <h3>{k.label}</h3>
                  <div className="stat-value" style={{ fontSize: typeof k.value === 'string' && k.value.length > 10 ? 20 : undefined }}>{k.value}</div>
                  {k.sub && <div style={{ fontSize: 12, color: 'var(--neutral-500)', marginTop: 2 }}>{k.sub}</div>}
                </div>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <span className="card-title"><BarChart3 size={16} /> Encaissements {stats.parMois ? 'par mois' : 'par jour'}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowTable((v) => !v)}><Table2 size={14} /> {showTable ? 'Graphique' : 'Tableau'}</button>
            </div>
            <div className="card-body">
              {showTable ? (
                <table className="data-table">
                  <thead><tr><th>{stats.parMois ? 'Mois' : 'Jour'}</th><th style={{ textAlign: 'right' }}>Encaissé</th></tr></thead>
                  <tbody>
                    {stats.encaissementsSerie.map((d, i) => (
                      <tr key={i}><td style={{ textTransform: 'capitalize' }}>{d.hint || d.label}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(d.value)}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <ColumnChart data={stats.encaissementsSerie} format={(v) => formatMoney(v).replace(' FC', '')} emptyText="Aucun encaissement sur la période." />
              )}
              <p style={{ fontSize: 12, color: 'var(--neutral-400)', marginTop: 8 }}>Montants en francs congolais (FC).</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card">
              <div className="card-header"><span className="card-title">Encaissements par mode de paiement</span></div>
              <div className="card-body"><BarList data={stats.parMode} format={formatMoney} emptyText="Aucun encaissement." /></div>
            </div>
            <div className="card">
              <div className="card-header"><span className="card-title">Consultations par médecin</span></div>
              <div className="card-body"><BarList data={stats.parMedecin} emptyText="Aucune consultation." /></div>
            </div>
            <div className="card">
              <div className="card-header"><span className="card-title">Diagnostics les plus fréquents</span></div>
              <div className="card-body"><BarList data={stats.diagnostics} emptyText="Aucun diagnostic renseigné." /></div>
            </div>
            <div className="card">
              <div className="card-header"><span className="card-title">Examens de laboratoire demandés</span></div>
              <div className="card-body"><BarList data={stats.examens} emptyText="Aucun examen demandé." /></div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
