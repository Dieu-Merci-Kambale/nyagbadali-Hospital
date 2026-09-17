'use client';

import { useState, useEffect } from 'react';
import {
  CalendarDays,
  Search,
  Plus,
  Clock,
  Filter,
  Loader2,
  Inbox,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const statutColors: Record<string, string> = {
  'planifié': 'badge-info',
  'confirmé': 'badge-success',
  'en_cours': 'badge-warning',
  'terminé': 'badge-neutral',
  'annulé': 'badge-danger',
  'absent': 'badge-danger',
};

export default function RendezVousPage() {
  const [rdvs, setRdvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatut, setFilterStatut] = useState('tous');
  const [search, setSearch] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [appliedDateDebut, setAppliedDateDebut] = useState('');
  const [appliedDateFin, setAppliedDateFin] = useState('');

  const fetchRDV = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('rendez_vous')
      .select('*, patients(nom, prenom, code_patient), personnel(nom, prenom, specialite)')
      .order('date_heure', { ascending: false });

    if (error) {
      console.error('Erreur:', error);
    } else {
      setRdvs(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRDV();
  }, []);

  const filtered = rdvs.filter(r => {
    const matchStatut = filterStatut === 'tous' || r.statut === filterStatut;
    const s = search.toLowerCase();
    const matchSearch = search === '' ||
      `${r.patients?.prenom} ${r.patients?.nom}`.toLowerCase().includes(s) ||
      (r.patients?.code_patient && r.patients.code_patient.toLowerCase().includes(s)) ||
      `${r.personnel?.prenom} ${r.personnel?.nom}`.toLowerCase().includes(s) ||
      (r.motif && r.motif.toLowerCase().includes(s));
      
    let matchDate = true;
    if (appliedDateDebut || appliedDateFin) {
      // Use created_at instead of date_heure as requested by the user
      const rDate = new Date(r.created_at).getTime();
      if (appliedDateDebut) {
        const [y, m, d] = appliedDateDebut.split('-');
        const dDebut = new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0);
        if (rDate < dDebut.getTime()) matchDate = false;
      }
      if (appliedDateFin) {
        const [y, m, d] = appliedDateFin.split('-');
        const dFin = new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999);
        if (rDate > dFin.getTime()) matchDate = false;
      }
    }
      
    return matchStatut && matchSearch && matchDate;
  });

  const handleFilter = () => {
    setAppliedDateDebut(dateDebut);
    setAppliedDateFin(dateFin);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, gap: 12 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
        <span style={{ fontWeight: 500, color: 'var(--neutral-500)' }}>Chargement des rendez-vous...</span>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Rendez-vous</h1>
          <p className="page-subtitle">{rdvs.length} rendez-vous enregistrés</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={fetchRDV} className="btn btn-outline" disabled={loading} title="Actualiser la liste">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualiser
          </button>
          <Link href="/rendez-vous/nouveau" className="btn btn-primary">
            <Plus size={16} /> Nouveau Rendez-vous
          </Link>
        </div>
      </div>

      {/* Search Area */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '14px 22px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="header-search" style={{ flex: 1, minWidth: 250 }}>
              <Search className="header-search-icon" />
              <input
                type="text"
                placeholder="Rechercher par patient, médecin, code patient ou motif..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="date"
                className="form-input"
                style={{ width: 140, padding: '8px 12px' }}
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
                title="Date de début"
              />
              <span style={{ color: 'var(--neutral-500)', fontSize: 13 }}>au</span>
              <input
                type="date"
                className="form-input"
                style={{ width: 140, padding: '8px 12px' }}
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
                title="Date de fin"
              />
              <button onClick={handleFilter} className="btn btn-primary" style={{ padding: '8px 16px' }}>
                <Filter size={16} /> Filtrer
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="tabs">
        {['tous', 'planifié', 'confirmé', 'en_cours', 'terminé', 'annulé'].map(s => (
          <button key={s} className={`tab ${filterStatut === s ? 'active' : ''}`} onClick={() => setFilterStatut(s)}>
            {s === 'tous' ? `Tous (${rdvs.length})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${rdvs.filter(r => r.statut === s).length})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <Inbox className="empty-state-icon" />
              <h3>Aucun rendez-vous</h3>
              <p>Il n&apos;y a aucun rendez-vous pour cette sélection.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Médecin</th>
                <th>Date & Heure</th>
                <th>Motif</th>
                <th>Type</th>
                <th>Durée</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((rdv: any, index: number) => (
                <tr key={rdv.id} className="animate-slide-in-right" style={{ animationDelay: `${index * 0.03}s` }}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{rdv.patients?.prenom} {rdv.patients?.nom}</div>
                    <div style={{ fontSize: 11, color: 'var(--neutral-400)' }}>{rdv.patients?.code_patient}</div>
                  </td>
                  <td>Dr. {rdv.personnel?.prenom} {rdv.personnel?.nom}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{new Date(rdv.date_heure).toLocaleDateString('fr-FR')}</div>
                    <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>
                      <Clock size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                      {new Date(rdv.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>
                  <td style={{ maxWidth: 200 }}>{rdv.motif}</td>
                  <td><span className="badge badge-info">{rdv.type}</span></td>
                  <td>{rdv.duree_minutes} min</td>
                  <td><span className={`badge ${statutColors[rdv.statut] || 'badge-neutral'}`}>{rdv.statut}</span></td>
                  <td>
                    <Link href={`/rendez-vous/${rdv.id}/edit`} className="btn btn-outline btn-sm">Gérer</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
