'use client';

import { useState, useEffect } from 'react';
import {
  Users,
  CalendarDays,
  BedDouble,
  TrendingUp,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

function formatCDF(montant: number): string {
  return new Intl.NumberFormat('fr-FR', { useGrouping: true, maximumFractionDigits: 0 }).format(montant) + ' FC';
}

interface Stats {
  totalPatients: number;
  patientsAujourdhui: number;
  rdvAujourdhui: number;
  litsOccupes: number;
  litsTotal: number;
  revenuMensuel: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    totalPatients: 0, patientsAujourdhui: 0, rdvAujourdhui: 0,
    litsOccupes: 0, litsTotal: 0, revenuMensuel: 0,
  });
  const [loading, setLoading] = useState(true);
  const [recentPatients, setRecentPatients] = useState<any[]>([]);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);

      const now = new Date();
      const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const localMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

      const [
        totalPatientsQuery,
        patientsAujourdhuiQuery,
        rdvAujourdhuiQuery,
        litsTotalQuery,
        litsOccupesQuery,
        paiementsMoisQuery,
        derniersPatientsQuery,
      ] = await Promise.all([
        supabase.from('patients').select('*', { count: 'exact', head: true }),
        supabase.from('patients').select('*', { count: 'exact', head: true }).gte('created_at', localToday),
        supabase.from('rendez_vous').select('*', { count: 'exact', head: true }).like('date_heure', `${localToday}%`),
        supabase.from('lits').select('*', { count: 'exact', head: true }),
        supabase.from('lits').select('*', { count: 'exact', head: true }).eq('statut', 'occupé'),
        supabase.from('paiements').select('montant').gte('date_paiement', localMonthStart),
        supabase.from('patients').select('*').order('created_at', { ascending: false }).limit(5),
      ]);

      const totalPatients = totalPatientsQuery.count || 0;
      const patientsAujourdhui = patientsAujourdhuiQuery.count || 0;
      const rdvAujourdhui = rdvAujourdhuiQuery.count || 0;
      const litsTotal = litsTotalQuery.count || 0;
      const litsOccupes = litsOccupesQuery.count || 0;
      const revenuMensuel = (paiementsMoisQuery.data ?? []).reduce((sum, paiement) => sum + (Number(paiement.montant) || 0), 0);
      const derniers = derniersPatientsQuery.data ?? [];

      setStats({
        totalPatients,
        patientsAujourdhui,
        rdvAujourdhui,
        litsTotal,
        litsOccupes,
        revenuMensuel,
      });
      setRecentPatients(derniers);
      setLoading(false);
    }

    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, gap: 12 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
        <span style={{ fontWeight: 500, color: 'var(--neutral-500)' }}>Chargement du tableau de bord...</span>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Patients', value: stats.totalPatients, icon: <Users size={22} />, color: 'blue', sub: `+${stats.patientsAujourdhui} aujourd'hui` },
    { label: "RDV Aujourd'hui", value: stats.rdvAujourdhui, icon: <CalendarDays size={22} />, color: 'green', sub: 'rendez-vous planifiés' },
    { label: 'Lits Occupés', value: `${stats.litsOccupes}/${stats.litsTotal}`, icon: <BedDouble size={22} />, color: 'orange', sub: stats.litsTotal > 0 ? `${Math.round((stats.litsOccupes / stats.litsTotal) * 100)}% occupation` : 'Aucun lit configuré' },
    { label: 'Revenu Mensuel', value: formatCDF(stats.revenuMensuel), icon: <TrendingUp size={22} />, color: 'purple', sub: 'ce mois' },
  ];

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tableau de Bord</h1>
          <p className="page-subtitle">Vue d&apos;ensemble de l&apos;activité hospitalière</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
        {statCards.map((card) => (
          <div key={card.label} className="stat-card animate-slide-up">
            <div className={`stat-card-icon ${card.color}`}>{card.icon}</div>
            <div className="stat-card-info">
              <h3>{card.label}</h3>
              <div className="stat-value">{card.value}</div>
              <div className="stat-change positive">{card.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Patients */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🕐 Derniers Patients Enregistrés</span>
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
                  <td style={{ fontWeight: 600 }}>{p.prenom} {p.nom}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.code_patient}</td>
                  <td>{p.sexe === 'M' ? '♂ Masculin' : '♀ Féminin'}</td>
                  <td>{p.telephone || '—'}</td>
                  <td>{new Date(p.created_at).toLocaleDateString('fr-FR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
