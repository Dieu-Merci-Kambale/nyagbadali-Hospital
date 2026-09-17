'use client';

import { useState, useEffect } from 'react';
import {
  FlaskConical,
  Plus,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  Inbox,
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const statutConfig: Record<string, { label: string; class: string; icon: React.ReactNode }> = {
  'demandé': { label: 'Demandé', class: 'badge-neutral', icon: <Clock size={12} /> },
  'prélevé': { label: 'Prélevé', class: 'badge-info', icon: <FlaskConical size={12} /> },
  'en_traitement': { label: 'En traitement', class: 'badge-warning', icon: <AlertCircle size={12} /> },
  'validé': { label: 'Validé', class: 'badge-success', icon: <CheckCircle size={12} /> },
};

export default function LaboratoirePage() {
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('tous');

  useEffect(() => {
    async function fetchAnalyses() {
      setLoading(true);
      const { data, error } = await supabase
        .from('analyses_laboratoire')
        .select('*, patients(nom, prenom, code_patient), personnel!analyses_laboratoire_medecin_prescripteur_id_fkey(nom, prenom)')
        .order('date_demande', { ascending: false });

      if (error) {
        console.error('Erreur:', error);
      } else {
        setAnalyses(data || []);
      }
      setLoading(false);
    }
    fetchAnalyses();
  }, []);

  const filtered = analyses.filter((a) => {
    const matchSearch = search === '' ||
      a.patients?.nom.toLowerCase().includes(search.toLowerCase()) ||
      a.type_analyse.toLowerCase().includes(search.toLowerCase());
    const matchStatut = filterStatut === 'tous' || a.statut === filterStatut;
    return matchSearch && matchStatut;
  });

  const totalDemandes = analyses.length;
  const enAttente = analyses.filter(a => a.statut === 'demandé').length;
  const enCours = analyses.filter(a => a.statut === 'en_cours').length;
  const termines = analyses.filter(a => a.statut === 'terminé').length;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, gap: 12 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
        <span style={{ fontWeight: 500, color: 'var(--neutral-500)' }}>Chargement du laboratoire...</span>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Laboratoire</h1>
          <p className="page-subtitle">Analyses biologiques et résultats</p>
        </div>
        <Link href="/laboratoire/nouveau" className="btn btn-primary">
          <Plus size={16} /> Nouvelle Analyse
        </Link>
      </div>

      {/* Workflow Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        {[
          { label: 'Demandés', count: 0, color: 'blue', icon: <Clock size={22} /> },
          { label: 'Prélevés', count: 0, color: 'purple', icon: <FlaskConical size={22} /> },
          { label: 'En traitement', count: 0, color: 'orange', icon: <AlertCircle size={22} /> },
          { label: 'Validés', count: 0, color: 'green', icon: <CheckCircle size={22} /> },
        ].map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className={`stat-card-icon ${stat.color}`}>{stat.icon}</div>
            <div className="stat-card-info">
              <h3>{stat.label}</h3>
              <div className="stat-value">{stat.count}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Data Table */}
      {filtered.length === 0 ? (
        <div className="card">
          <div className="card-header">
            <span className="card-title">🔬 Demandes d&apos;analyses</span>
          </div>
          <div className="card-body">
            <div className="empty-state">
              <Inbox className="empty-state-icon" />
              <h3>Aucune demande d&apos;analyse</h3>
              <p>Les demandes d&apos;analyses apparaîtront ici lorsqu&apos;elles seront créées.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Patient</th>
                <th>Prescripteur</th>
                <th>Type d'analyse</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((analyse) => (
                <tr key={analyse.id}>
                  <td>{new Date(analyse.date_demande).toLocaleDateString('fr-FR')}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{analyse.patients?.prenom} {analyse.patients?.nom}</div>
                    <div style={{ fontSize: 11, color: 'var(--neutral-400)' }}>{analyse.patients?.code_patient}</div>
                  </td>
                  <td>Dr. {analyse.personnel?.prenom} {analyse.personnel?.nom}</td>
                  <td>{analyse.type_analyse}</td>
                  <td><span className={`badge ${statutConfig[analyse.statut]?.class || 'badge-neutral'}`}>{analyse.statut}</span></td>
                  <td>
                    <Link href={`/laboratoire/${analyse.id}/edit`} className="btn btn-outline btn-sm">Saisir Résultat</Link>
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
