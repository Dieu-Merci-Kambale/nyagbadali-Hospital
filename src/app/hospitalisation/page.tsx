'use client';

import { useState, useEffect } from 'react';
import {
  BedDouble,
  Search,
  Plus,
  Activity,
  LogOut,
  Calendar,
  AlertCircle,
  Loader2,
  Inbox,
  ArrowRight
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function HospitalisationPage() {
  const [hospitalisations, setHospitalisations] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalLits: 0,
    litsOccupes: 0,
    admissionsAujourdhui: 0
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('actif'); // actif = interné

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      
      // Fetch lits pour les stats
      const { data: lits } = await supabase.from('lits').select('statut');
      const totalLits = lits?.length || 0;
      const litsOccupes = lits?.filter(l => l.statut === 'occupé').length || 0;

      // Fetch hospitalisations
      const { data: hospData, error } = await supabase
        .from('hospitalisations')
        .select(`
          *,
          patients(nom, prenom, code_patient, photo_url),
          lits(numero, chambres(numero, etage)),
          medecin:personnel(nom, prenom)
        `)
        .order('date_admission', { ascending: false });

      if (error) {
        console.error('Erreur:', error);
      } else {
        setHospitalisations(hospData || []);
        
        // Count admissions today
        const today = new Date().toISOString().split('T')[0];
        const admissionsAujourdhui = hospData?.filter(h => h.date_admission.startsWith(today)).length || 0;
        
        setStats({
          totalLits,
          litsOccupes,
          admissionsAujourdhui
        });
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  const filtered = hospitalisations.filter((h) => {
    const matchSearch = search === '' ||
      `${h.patients?.prenom} ${h.patients?.nom}`.toLowerCase().includes(search.toLowerCase()) ||
      h.patients?.code_patient?.toLowerCase().includes(search.toLowerCase());
    const matchStatut = filterStatut === 'tous' || h.statut === filterStatut;
    return matchSearch && matchStatut;
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, gap: 12 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
        <span style={{ fontWeight: 500, color: 'var(--neutral-500)' }}>Chargement des données...</span>
      </div>
    );
  }

  const tauxOccupation = stats.totalLits > 0 ? Math.round((stats.litsOccupes / stats.totalLits) * 100) : 0;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Hospitalisation</h1>
          <p className="page-subtitle">Gestion des admissions et suivi des lits</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/hospitalisation/lits" className="btn btn-outline">
            <BedDouble size={16} /> Gestion des Lits
          </Link>
          <Link href="/hospitalisation/nouvelle" className="btn btn-primary">
            <Plus size={16} /> Nouvelle Admission
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-card-icon blue"><BedDouble size={22} /></div>
          <div className="stat-card-info">
            <h3>Taux d'Occupation</h3>
            <div className="stat-value">{tauxOccupation}%</div>
            <p style={{ fontSize: 13, color: 'var(--neutral-500)', marginTop: 4 }}>
              {stats.litsOccupes} lits occupés sur {stats.totalLits}
            </p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon green"><Activity size={22} /></div>
          <div className="stat-card-info">
            <h3>Admissions du Jour</h3>
            <div className="stat-value">{stats.admissionsAujourdhui}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon orange"><Calendar size={22} /></div>
          <div className="stat-card-info">
            <h3>Total Internés</h3>
            <div className="stat-value">{hospitalisations.filter(h => h.statut === 'actif').length}</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '14px 22px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div className="header-search" style={{ flex: 1, minWidth: 250 }}>
              <Search className="header-search-icon" />
              <input 
                type="text" 
                placeholder="Rechercher un patient ou code..." 
                value={search} 
                onChange={(e) => setSearch(e.target.value)} 
              />
            </div>
            <select className="form-select" value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={{ width: 180 }}>
              <option value="tous">Toutes les admissions</option>
              <option value="actif">Actuellement internés</option>
              <option value="sorti">Sortis / Déchargés</option>
              <option value="transféré">Transférés</option>
            </select>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <Inbox className="empty-state-icon" />
              <h3>Aucune hospitalisation</h3>
              <p>Il n'y a aucun patient correspondant à votre recherche.</p>
              {filterStatut === 'actif' && (
                <Link href="/hospitalisation/nouvelle" className="btn btn-outline" style={{ marginTop: 16 }}>
                  Admettre un patient
                </Link>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Admission</th>
                <th>Chambre & Lit</th>
                <th>Médecin Traitant</th>
                <th>Motif</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((hosp: any, index: number) => {
                const isActif = hosp.statut === 'actif';
                return (
                  <tr key={hosp.id} className="animate-slide-in-right" style={{ animationDelay: `${index * 0.03}s` }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {hosp.patients?.photo_url ? (
                          <img src={hosp.patients.photo_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: 'var(--primary-100)', color: 'var(--primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                            {hosp.patients?.prenom?.[0]}{hosp.patients?.nom?.[0]}
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: 600 }}>{hosp.patients?.prenom} {hosp.patients?.nom}</div>
                          <div style={{ fontSize: 11, color: 'var(--neutral-400)' }}>{hosp.patients?.code_patient}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{format(new Date(hosp.date_admission), 'dd MMM yyyy', { locale: fr })}</div>
                      <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{format(new Date(hosp.date_admission), 'HH:mm', { locale: fr })}</div>
                    </td>
                    <td>
                      {hosp.lits ? (
                        <>
                          <div style={{ fontWeight: 600, color: 'var(--primary-600)' }}>Ch. {hosp.lits?.chambres?.numero}</div>
                          <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{hosp.lits?.numero}</div>
                        </>
                      ) : (
                        <span className="badge badge-danger">Non assigné</span>
                      )}
                    </td>
                    <td>Dr. {hosp.medecin?.nom}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {hosp.motif_admission}
                    </td>
                    <td>
                      <span className={`badge ${isActif ? 'badge-success' : 'badge-neutral'}`}>
                        {isActif ? 'Interné' : hosp.statut}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Link href={`/hospitalisation/${hosp.id}/edit`} className="btn btn-sm btn-outline">
                          {isActif ? 'Gérer / Sortie' : 'Détails'} <ArrowRight size={14} style={{ marginLeft: 4 }} />
                        </Link>
                      </div>
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
