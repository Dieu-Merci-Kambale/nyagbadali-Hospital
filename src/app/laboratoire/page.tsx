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
  Siren,
  FileSpreadsheet,
  BookOpen,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import Pagination from '@/components/ui/Pagination';
import { usePagination } from '@/lib/usePagination';
import { LAB_STATUTS, statusBadge, formatDate, formatTime, explainDbError, titreSoignant } from '@/lib/format';
import { statutDemande } from '@/lib/lab-catalogue';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import { useAuth } from '@/contexts/AuthContext';
import { canRequestLab } from '@/lib/role-permissions';

const TABS = [
  { key: 'actifs', label: 'À traiter' },
  { key: 'demandé', label: 'À prélever' },
  { key: 'prélevé', label: 'Prélevées' },
  { key: 'en_cours', label: 'En analyse' },
  { key: 'terminé', label: 'Terminées' },
  { key: 'tous', label: 'Toutes' },
];

const DOT: Record<string, string> = {
  'demandé': 'var(--neutral-400)',
  'prélevé': 'var(--primary-500)',
  'en_cours': 'var(--warning)',
  'terminé': 'var(--success)',
  'annulé': 'var(--danger)',
};

export default function LaboratoirePage() {
  const { profile } = useAuth();
  const [demandes, setDemandes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('actifs');

  const fetchDemandes = useCallback(async (silencieux = false) => {
    if (!silencieux) setLoading(true);
    const { data, error } = await supabase
      .from('demandes_laboratoire')
      .select(`
        *,
        patients(nom, prenom, code_patient),
        personnel!demandes_laboratoire_medecin_prescripteur_id_fkey(nom, prenom, role),
        analyses_laboratoire(id, type_analyse, statut, urgent, resultats)
      `)
      .order('date_demande', { ascending: false });

    if (error) {
      console.error('Erreur:', error);
      setDbError(explainDbError(error));
      if (!silencieux) toast.error('Impossible de charger le laboratoire.');
    } else {
      setDbError('');
      setDemandes((data || []).map((d: any) => ({ ...d, statut: statutDemande(d.analyses_laboratoire || []) })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDemandes();
  }, [fetchDemandes]);

  // Nouvelles demandes et résultats saisis sur d'autres postes
  useLiveRefresh(() => fetchDemandes(true), ['demandes_laboratoire', 'analyses_laboratoire']);

  const examens = demandes.flatMap((d) => d.analyses_laboratoire || []);
  const countExamens = (statut: string) => examens.filter((a: any) => a.statut === statut).length;
  const estActive = (d: any) => ['demandé', 'prélevé', 'en_cours'].includes(d.statut);
  const countDemandes = (key: string) => key === 'tous' ? demandes.length
    : key === 'actifs' ? demandes.filter(estActive).length
      : demandes.filter((d) => d.statut === key).length;

  const filtered = demandes.filter((d) => {
    const q = search.toLowerCase();
    const matchSearch = q === '' ||
      `${d.patients?.prenom || ''} ${d.patients?.nom || ''}`.toLowerCase().includes(q) ||
      (d.patients?.code_patient || '').toLowerCase().includes(q) ||
      (d.numero || '').toLowerCase().includes(q) ||
      (d.analyses_laboratoire || []).some((a: any) => (a.type_analyse || '').toLowerCase().includes(q));
    const matchTab = tab === 'tous' || (tab === 'actifs' ? estActive(d) : d.statut === tab);
    return matchSearch && matchTab;
  });
  const { pageItems, page, pageCount, total, setPage } = usePagination(filtered, [search, tab]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, gap: 12 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
        <span style={{ fontWeight: 500, color: 'var(--neutral-500)' }}>Chargement du laboratoire...</span>
      </div>
    );
  }

  const stats = [
    { label: 'Examens à prélever', count: countExamens('demandé'), color: 'blue', icon: <Clock size={22} /> },
    { label: 'Prélevés', count: countExamens('prélevé'), color: 'purple', icon: <FlaskConical size={22} /> },
    { label: 'En analyse', count: countExamens('en_cours'), color: 'orange', icon: <Microscope size={22} /> },
    { label: 'Résultats validés', count: countExamens('terminé'), color: 'green', icon: <CheckCircle size={22} /> },
  ];

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Laboratoire</h1>
          <p className="page-subtitle">Demandes d&apos;examens, prélèvements et résultats</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => fetchDemandes()} className="btn btn-outline" title="Actualiser">
            <RefreshCw size={16} /> Actualiser
          </button>
          <Link href="/laboratoire/rapports" className="btn btn-outline">
            <FileSpreadsheet size={16} /> Rapports
          </Link>
          <Link href="/laboratoire/examens" className="btn btn-outline">
            <BookOpen size={16} /> Catalogue des examens
          </Link>
          {canRequestLab(profile?.role) && (
            <Link href="/laboratoire/nouveau" className="btn btn-primary">
              <Plus size={16} /> Nouvelle demande
            </Link>
          )}
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
              placeholder="Rechercher par patient, code patient, n° de demande ou examen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label} ({countDemandes(t.key)})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <Inbox className="empty-state-icon" />
              <h3>Aucune demande</h3>
              <p>Aucune demande d&apos;examens ne correspond à cette sélection.</p>
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
                <th>Examens</th>
                <th>Prescripteur</th>
                <th>Avancement</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((d) => {
                const st = statusBadge(LAB_STATUTS, d.statut);
                const ex = (d.analyses_laboratoire || []) as any[];
                const actifs = ex.filter((a) => a.statut !== 'annulé');
                const valides = actifs.filter((a) => a.statut === 'terminé').length;
                const anomalies = ex.reduce((n, a) => n + ((a.resultats?.parametres || []).filter((p: any) => p.anormal).length), 0);
                return (
                  <tr key={d.id}>
                    <td>
                      <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 12 }}>{d.numero}</div>
                      <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{formatDate(d.date_demande)} à {formatTime(d.date_demande)}</div>
                      {d.urgent && <span className="badge badge-danger" style={{ marginTop: 4 }}><Siren size={11} /> Urgent</span>}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{d.patients?.prenom} {d.patients?.nom}</div>
                      <div style={{ fontSize: 11, color: 'var(--neutral-400)' }}>{d.patients?.code_patient}</div>
                    </td>
                    <td style={{ maxWidth: 320 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {ex.map((a) => (
                          <span
                            key={a.id}
                            title={statusBadge(LAB_STATUTS, a.statut).label}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '3px 8px', borderRadius: 999,
                              background: 'var(--neutral-50)', border: '1px solid var(--neutral-200)',
                              textDecoration: a.statut === 'annulé' ? 'line-through' : 'none', color: 'var(--neutral-700)',
                            }}
                          >
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: DOT[a.statut] || 'var(--neutral-400)' }} />
                            {a.type_analyse}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>{d.personnel ? `${titreSoignant(d.personnel.role)}${d.personnel.prenom} ${d.personnel.nom}` : '—'}</td>
                    <td style={{ minWidth: 150 }}>
                      <span className={`badge ${st.badge}`}>{st.label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                        <div className="bar-track" style={{ flex: 1 }}>
                          <div className="bar-fill" style={{ width: `${actifs.length ? (valides / actifs.length) * 100 : 0}%`, background: 'var(--success)' }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--neutral-500)', whiteSpace: 'nowrap' }}>{valides}/{actifs.length}</span>
                      </div>
                      {anomalies > 0 && <div style={{ fontSize: 11, color: 'var(--danger-600)', fontWeight: 600, marginTop: 4 }}>{anomalies} valeur(s) anormale(s)</div>}
                    </td>
                    <td>
                      <Link href={`/laboratoire/demande/${d.id}`} className="btn btn-outline btn-sm">
                        <Eye size={14} /> {estActive(d) ? 'Traiter' : 'Consulter'}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} pageCount={pageCount} total={total} onPageChange={setPage} label="demandes" />
        </div>
      )}
    </div>
  );
}
