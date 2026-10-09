'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  CalendarDays,
  BedDouble,
  TrendingUp,
  Loader2,
  FlaskConical,
  Pill,
  ArrowRight,
  Clock,
  Stethoscope,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { hasAccess } from '@/lib/role-permissions';
import { ColumnChart, type Datum } from '@/components/charts/SimpleCharts';
import {
  formatMoney, formatDate, formatTime, toDateKey, startOfDayISO, endOfDayISO, statusBadge, RDV_STATUTS, LAB_STATUTS,
} from '@/lib/format';

interface Stats {
  totalPatients: number;
  patientsAujourdhui: number;
  rdvAujourdhui: number;
  litsOccupes: number;
  litsTotal: number;
  revenuMensuel: number;
  consultationsJour: number;
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<Stats>({
    totalPatients: 0, patientsAujourdhui: 0, rdvAujourdhui: 0,
    litsOccupes: 0, litsTotal: 0, revenuMensuel: 0, consultationsJour: 0,
  });
  const [loading, setLoading] = useState(true);
  const [recentPatients, setRecentPatients] = useState<any[]>([]);
  const [agenda, setAgenda] = useState<any[]>([]);
  const [revenus7j, setRevenus7j] = useState<Datum[]>([]);
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [stockCritique, setStockCritique] = useState<any[]>([]);
  const [hospitalises, setHospitalises] = useState<any[]>([]);

  const can = (m: Parameters<typeof hasAccess>[1]) => (profile ? hasAccess(profile.role, m) : false);
  const isMedecin = profile?.role === 'medecin' || profile?.role === 'medecin_chef';
  const seesMoney = can('facturation') || can('rapports');

  useEffect(() => {
    if (!profile) return;
    async function loadDashboard() {
      setLoading(true);

      const now = new Date();
      const debutJour = startOfDayISO(now);
      const finJour = endOfDayISO(now);
      const debutMois = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const debut7j = startOfDayISO(new Date(Date.now() - 6 * 86_400_000));

      let agendaQuery = supabase
        .from('rendez_vous')
        .select('id, date_heure, motif, statut, numero_queue, medecin_id, patients(nom, prenom), personnel(nom)')
        .gte('date_heure', debutJour)
        .lte('date_heure', finJour)
        .order('date_heure');
      if (isMedecin) agendaQuery = agendaQuery.eq('medecin_id', profile!.id);

      const [
        totalPatientsQuery,
        patientsAujourdhuiQuery,
        rdvAujourdhuiQuery,
        litsTotalQuery,
        litsOccupesQuery,
        paiementsQuery,
        derniersPatientsQuery,
        consultationsJourQuery,
        agendaRes,
        labRes,
        medsRes,
        hospRes,
      ] = await Promise.all([
        supabase.from('patients').select('*', { count: 'exact', head: true }),
        supabase.from('patients').select('*', { count: 'exact', head: true }).gte('created_at', debutJour),
        supabase.from('rendez_vous').select('*', { count: 'exact', head: true }).gte('date_heure', debutJour).lte('date_heure', finJour).neq('statut', 'annulé'),
        supabase.from('lits').select('*', { count: 'exact', head: true }),
        supabase.from('lits').select('*', { count: 'exact', head: true }).eq('statut', 'occupé'),
        supabase.from('paiements').select('montant, date_paiement').gte('date_paiement', debut7j < debutMois ? debut7j : debutMois),
        supabase.from('patients').select('*').order('created_at', { ascending: false }).limit(5),
        supabase.from('consultations').select('*', { count: 'exact', head: true }).gte('date_consultation', debutJour),
        hasAccess(profile!.role, 'rendez-vous') ? agendaQuery : Promise.resolve({ data: [] as any[] }),
        hasAccess(profile!.role, 'laboratoire')
          ? supabase.from('analyses_laboratoire').select('id, type_analyse, statut, urgent, date_demande, patients(nom, prenom)').in('statut', ['demandé', 'prélevé', 'en_cours', 'terminé']).order('date_demande', { ascending: false }).limit(30)
          : Promise.resolve({ data: [] as any[] }),
        hasAccess(profile!.role, 'pharmacie')
          ? supabase.from('medicaments').select('id, nom_commercial, dosage, stock_actuel, stock_minimum').order('stock_actuel')
          : Promise.resolve({ data: [] as any[] }),
        hasAccess(profile!.role, 'hospitalisation')
          ? supabase.from('hospitalisations').select('id, date_admission, motif_admission, patients(nom, prenom), lits(numero, chambres(numero))').eq('statut', 'actif').order('date_admission', { ascending: false }).limit(6)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const paiements = paiementsQuery.data ?? [];
      const revenuMensuel = paiements
        .filter((p) => new Date(p.date_paiement).getTime() >= new Date(debutMois).getTime())
        .reduce((sum, p) => sum + (Number(p.montant) || 0), 0);

      const series: Datum[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const key = toDateKey(d);
        series.push({
          label: d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''),
          hint: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
          value: paiements.filter((p) => toDateKey(p.date_paiement) === key).reduce((s, p) => s + (Number(p.montant) || 0), 0),
        });
      }

      setStats({
        totalPatients: totalPatientsQuery.count || 0,
        patientsAujourdhui: patientsAujourdhuiQuery.count || 0,
        rdvAujourdhui: rdvAujourdhuiQuery.count || 0,
        litsTotal: litsTotalQuery.count || 0,
        litsOccupes: litsOccupesQuery.count || 0,
        revenuMensuel,
        consultationsJour: consultationsJourQuery.count || 0,
      });
      setRevenus7j(series);
      setRecentPatients(derniersPatientsQuery.data ?? []);
      setAgenda(agendaRes.data ?? []);
      const labData = (labRes.data ?? []) as any[];
      setAnalyses(
        profile!.role === 'technicien_labo'
          ? labData.filter((a) => a.statut !== 'terminé').sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent))
          : labData
      );
      setStockCritique(((medsRes.data ?? []) as any[]).filter((m) => m.stock_actuel <= m.stock_minimum));
      setHospitalises(hospRes.data ?? []);
      setLoading(false);
    }

    loadDashboard();
  }, [profile, isMedecin]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, gap: 12 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
        <span style={{ fontWeight: 500, color: 'var(--neutral-500)' }}>Chargement du tableau de bord...</span>
      </div>
    );
  }

  const heure = new Date().getHours();
  const salutation = heure < 12 ? 'Bonjour' : heure < 18 ? 'Bon après-midi' : 'Bonsoir';

  const statCards = [
    { label: 'Total patients', value: stats.totalPatients, icon: <Users size={22} />, color: 'blue', sub: `+${stats.patientsAujourdhui} aujourd'hui`, href: can('patients') ? '/patients' : undefined },
    { label: "RDV aujourd'hui", value: stats.rdvAujourdhui, icon: <CalendarDays size={22} />, color: 'green', sub: `${stats.consultationsJour} consultation(s) réalisée(s)`, href: can('rendez-vous') ? '/rendez-vous' : undefined },
    { label: 'Lits occupés', value: `${stats.litsOccupes}/${stats.litsTotal}`, icon: <BedDouble size={22} />, color: 'orange', sub: stats.litsTotal > 0 ? `${Math.round((stats.litsOccupes / stats.litsTotal) * 100)}% d'occupation` : 'Aucun lit configuré', href: can('hospitalisation') ? '/hospitalisation' : undefined },
    seesMoney
      ? { label: 'Encaissements du mois', value: formatMoney(stats.revenuMensuel), icon: <TrendingUp size={22} />, color: 'purple', sub: 'ce mois', href: can('rapports') ? '/rapports' : '/facturation' }
      : { label: 'Consultations du jour', value: stats.consultationsJour, icon: <Stethoscope size={22} />, color: 'purple', sub: "aujourd'hui", href: can('consultations') ? '/consultations' : undefined },
  ];

  const laboTitre = profile?.role === 'technicien_labo' ? 'Analyses à traiter' : 'Dernières analyses';

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{salutation}{profile ? `, ${profile.role.startsWith('medecin') ? 'Dr. ' : ''}${profile.prenom}` : ''}</h1>
          <p className="page-subtitle">Vue d&apos;ensemble de l&apos;activité hospitalière</p>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
        {statCards.map((card) => {
          const content = (
            <div className="stat-card animate-slide-up" style={{ height: '100%' }}>
              <div className={`stat-card-icon ${card.color}`}>{card.icon}</div>
              <div className="stat-card-info">
                <h3>{card.label}</h3>
                <div className="stat-value" style={{ fontSize: String(card.value).length > 10 ? 20 : undefined }}>{card.value}</div>
                <div className="stat-change positive">{card.sub}</div>
              </div>
            </div>
          );
          return card.href
            ? <Link key={card.label} href={card.href} style={{ textDecoration: 'none', color: 'inherit' }}>{content}</Link>
            : <div key={card.label}>{content}</div>;
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20, marginBottom: 20 }}>
        {can('rendez-vous') && (
          <div className="card">
            <div className="card-header">
              <span className="card-title"><Clock size={16} /> {isMedecin ? 'Mes rendez-vous du jour' : "Agenda d'aujourd'hui"}</span>
              <Link href="/rendez-vous" className="btn btn-ghost btn-sm">Agenda <ArrowRight size={14} /></Link>
            </div>
            <div className="card-body" style={{ padding: agenda.length ? 0 : undefined }}>
              {agenda.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--neutral-400)', padding: '20px 0' }}>Aucun rendez-vous aujourd&apos;hui.</p>
              ) : (
                <table className="data-table">
                  <tbody>
                    {agenda.slice(0, 7).map((r) => {
                      const st = statusBadge(RDV_STATUTS, r.statut);
                      return (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 700, width: 70 }}>{formatTime(r.date_heure)}</td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{r.patients?.prenom} {r.patients?.nom}</div>
                            <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{r.motif}{!isMedecin && r.personnel ? ` • Dr. ${r.personnel.nom}` : ''}</div>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {r.numero_queue && <span className="badge badge-info" style={{ marginRight: 6 }}>N° {r.numero_queue}</span>}
                            <span className={`badge ${st.badge}`}>{st.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {agenda.length > 7 && <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--neutral-500)', padding: 10 }}>+ {agenda.length - 7} autre(s)</p>}
            </div>
          </div>
        )}

        {seesMoney && (
          <div className="card">
            <div className="card-header">
              <span className="card-title"><TrendingUp size={16} /> Encaissements des 7 derniers jours</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{formatMoney(revenus7j.reduce((s, d) => s + d.value, 0))}</span>
            </div>
            <div className="card-body">
              <ColumnChart data={revenus7j} height={170} format={(v) => formatMoney(v).replace(' FC', '')} emptyText="Aucun encaissement sur les 7 derniers jours." />
            </div>
          </div>
        )}

        {can('laboratoire') && (
          <div className="card">
            <div className="card-header">
              <span className="card-title"><FlaskConical size={16} /> {laboTitre}</span>
              <Link href="/laboratoire" className="btn btn-ghost btn-sm">Laboratoire <ArrowRight size={14} /></Link>
            </div>
            <div className="card-body" style={{ padding: analyses.length ? 0 : undefined }}>
              {analyses.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--neutral-400)', padding: '20px 0' }}>Aucune analyse en cours.</p>
              ) : (
                <table className="data-table">
                  <tbody>
                    {analyses.slice(0, 6).map((a) => {
                      const st = statusBadge(LAB_STATUTS, a.statut);
                      return (
                        <tr key={a.id}>
                          <td>
                            <Link href={`/laboratoire/${a.id}`} style={{ fontWeight: 600, color: 'var(--neutral-800)', textDecoration: 'none' }}>{a.type_analyse}</Link>
                            <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{a.patients?.prenom} {a.patients?.nom} • {formatDate(a.date_demande)}</div>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {a.urgent && <span className="badge badge-danger" style={{ marginRight: 6 }}>Urgent</span>}
                            <span className={`badge ${st.badge}`}>{st.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {can('pharmacie') && (
          <div className="card">
            <div className="card-header">
              <span className="card-title"><Pill size={16} /> Stocks critiques</span>
              <Link href="/pharmacie" className="btn btn-ghost btn-sm">Pharmacie <ArrowRight size={14} /></Link>
            </div>
            <div className="card-body" style={{ padding: stockCritique.length ? 0 : undefined }}>
              {stockCritique.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--neutral-400)', padding: '20px 0' }}>Tous les stocks sont au-dessus du seuil minimum.</p>
              ) : (
                <table className="data-table">
                  <tbody>
                    {stockCritique.slice(0, 6).map((m) => (
                      <tr key={m.id}>
                        <td style={{ fontWeight: 600 }}>{m.nom_commercial} <span style={{ fontWeight: 400, color: 'var(--neutral-500)' }}>{m.dosage}</span></td>
                        <td style={{ textAlign: 'right' }}>
                          <span className={`badge ${m.stock_actuel <= 0 ? 'badge-danger' : 'badge-warning'}`}>
                            {m.stock_actuel <= 0 ? 'Rupture' : `${m.stock_actuel} / min ${m.stock_minimum}`}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {can('hospitalisation') && (
          <div className="card">
            <div className="card-header">
              <span className="card-title"><BedDouble size={16} /> Patients hospitalisés</span>
              <Link href="/hospitalisation" className="btn btn-ghost btn-sm">Hospitalisation <ArrowRight size={14} /></Link>
            </div>
            <div className="card-body" style={{ padding: hospitalises.length ? 0 : undefined }}>
              {hospitalises.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--neutral-400)', padding: '20px 0' }}>Aucun patient hospitalisé.</p>
              ) : (
                <table className="data-table">
                  <tbody>
                    {hospitalises.map((h) => (
                      <tr key={h.id}>
                        <td>
                          <Link href={`/hospitalisation/${h.id}`} style={{ fontWeight: 600, color: 'var(--neutral-800)', textDecoration: 'none' }}>{h.patients?.prenom} {h.patients?.nom}</Link>
                          <div style={{ fontSize: 11, color: 'var(--neutral-500)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.motif_admission}</div>
                        </td>
                        <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--neutral-500)' }}>
                          {h.lits ? `Ch. ${h.lits.chambres?.numero} / ${h.lits.numero}` : '—'}<br />depuis le {formatDate(h.date_admission)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {can('patients') && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">🕐 Derniers patients enregistrés</span>
            <Link href="/patients" className="btn btn-ghost btn-sm">Tous les patients <ArrowRight size={14} /></Link>
          </div>
          {recentPatients.length === 0 ? (
            <div className="card-body" style={{ textAlign: 'center', padding: 40, color: 'var(--neutral-400)' }}>
              Aucun patient enregistré pour le moment.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Code</th>
                  <th>Sexe</th>
                  <th>Téléphone</th>
                  <th>Date d&apos;enregistrement</th>
                </tr>
              </thead>
              <tbody>
                {recentPatients.map((p: any) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}><Link href={`/patients/${p.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{p.prenom} {p.nom}</Link></td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.code_patient}</td>
                    <td>{p.sexe === 'M' ? '♂ Masculin' : '♀ Féminin'}</td>
                    <td>{p.telephone || '—'}</td>
                    <td>{formatDate(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
