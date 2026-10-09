'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FlaskConical,
  Plus,
  Clock,
  CheckCircle,
  Loader2,
  Inbox,
  Search,
  Microscope,
  RefreshCw,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { LAB_STATUTS, statusBadge, formatDate, formatTime, explainDbError } from '@/lib/format';

const TABS = [
  { key: 'actifs', label: 'À traiter' },
  { key: 'demandé', label: 'Demandés' },
  { key: 'prélevé', label: 'Prélevés' },
  { key: 'en_cours', label: 'En analyse' },
  { key: 'terminé', label: 'Résultats' },
  { key: 'tous', label: 'Tous' },
];

export default function LaboratoirePage() {
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('actifs');

  const fetchAnalyses = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('analyses_laboratoire')
      .select('*, patients(nom, prenom, code_patient), personnel!analyses_laboratoire_medecin_prescripteur_id_fkey(nom, prenom)')
      .order('date_demande', { ascending: false });

    if (error) {
      console.error('Erreur:', error);
      setDbError(explainDbError(error));
      toast.error('Impossible de charger les analyses.');
    } else {
      setDbError('');
      setAnalyses(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAnalyses();
  }, [fetchAnalyses]);

  const count = (statut: string) => analyses.filter((a) => a.statut === statut).length;

  const filtered = analyses.filter((a) => {
    const q = search.toLowerCase();
    const matchSearch = q === '' ||
      `${a.patients?.prenom || ''} ${a.patients?.nom || ''}`.toLowerCase().includes(q) ||
      (a.patients?.code_patient || '').toLowerCase().includes(q) ||
      (a.type_analyse || '').toLowerCase().includes(q);
    const matchTab =
      tab === 'tous' ||
      (tab === 'actifs' ? ['demandé', 'prélevé', 'en_cours'].includes(a.statut) : a.statut === tab);
    return matchSearch && matchTab;
  });

  // Les demandes urgentes passent en tête des listes de travail
  const sorted = tab === 'terminé' || tab === 'tous'
    ? filtered
    : [...filtered].sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent));

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, gap: 12 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
        <span style={{ fontWeight: 500, color: 'var(--neutral-500)' }}>Chargement du laboratoire...</span>
      </div>
    );
  }

  const stats = [
    { label: 'Demandés', count: count('demandé'), color: 'blue', icon: <Clock size={22} /> },
    { label: 'Prélevés', count: count('prélevé'), color: 'purple', icon: <FlaskConical size={22} /> },
    { label: 'En analyse', count: count('en_cours'), color: 'orange', icon: <Microscope size={22} /> },
    { label: 'Résultats disponibles', count: count('terminé'), color: 'green', icon: <CheckCircle size={22} /> },
  ];

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Laboratoire</h1>
          <p className="page-subtitle">Demandes d&apos;examens, prélèvements et résultats</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={fetchAnalyses} className="btn btn-outline" title="Actualiser">
            <RefreshCw size={16} /> Actualiser
          </button>
          <Link href="/laboratoire/nouveau" className="btn btn-primary">
            <Plus size={16} /> Nouvelle demande
          </Link>
        </div>
      </div>

      {dbError && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <AlertTriangle size={18} /> {dbError}
        </div>
      )}

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        {stats.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className={`stat-card-icon ${stat.color}`}>{stat.icon}</div>
            <div className="stat-card-info">
              <h3>{stat.label}</h3>
              <div className="stat-value">{stat.count}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '14px 22px' }}>
          <div className="header-search" style={{ width: '100%' }}>
            <Search className="header-search-icon" />
            <input
              type="text"
              placeholder="Rechercher par patient, code patient ou type d'examen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => {
          const n = t.key === 'tous' ? analyses.length
            : t.key === 'actifs' ? analyses.filter((a) => ['demandé', 'prélevé', 'en_cours'].includes(a.statut)).length
            : count(t.key);
          return (
            <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label} ({n})
            </button>
          );
        })}
      </div>

      {sorted.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <Inbox className="empty-state-icon" />
              <h3>Aucune analyse</h3>
              <p>Aucune demande d&apos;analyse ne correspond à cette sélection.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Demande</th>
                <th>Patient</th>
                <th>Examen</th>
                <th>Prescripteur</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((analyse) => {
                const st = statusBadge(LAB_STATUTS, analyse.statut);
                return (
                  <tr key={analyse.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{formatDate(analyse.date_demande)}</div>
                      <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{formatTime(analyse.date_demande)}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{analyse.patients?.prenom} {analyse.patients?.nom}</div>
                      <div style={{ fontSize: 11, color: 'var(--neutral-400)' }}>{analyse.patients?.code_patient}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {analyse.type_analyse}
                        {analyse.urgent && <span className="badge badge-danger">Urgent</span>}
                      </div>
                    </td>
                    <td>{analyse.personnel ? `Dr. ${analyse.personnel.prenom} ${analyse.personnel.nom}` : '—'}</td>
                    <td><span className={`badge ${st.badge}`}>{st.label}</span></td>
                    <td>
                      <Link href={`/laboratoire/${analyse.id}`} className="btn btn-outline btn-sm">
                        <Eye size={14} /> {analyse.statut === 'terminé' || analyse.statut === 'annulé' ? 'Consulter' : 'Traiter'}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
