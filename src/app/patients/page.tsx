'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Search,
  UserPlus,
  Filter,
  Download,
  Phone,
  Mail,
  Eye,
  Edit,
  ChevronLeft,
  ChevronRight,
  Shield,
  Loader2,
  Inbox
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Patient } from '@/types';
import { downloadCsv, formatDate } from '@/lib/format';

const PAGE_SIZE = 20;

function getAge(dateNaissance: string): number {
  if (!dateNaissance) return 0;
  const today = new Date();
  const birth = new Date(dateNaissance);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

const avatarColors = ['avatar-blue', 'avatar-green', 'avatar-orange', 'avatar-purple', 'avatar-pink'];

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSexe, setFilterSexe] = useState<string>('tous');
  const [showFilters, setShowFilters] = useState(false);
  const [filterStatut, setFilterStatut] = useState<string>('tous');
  const [filterAssurance, setFilterAssurance] = useState<string>('tous');
  const [page, setPage] = useState(1);

  useEffect(() => {
    async function fetchPatients() {
      setLoading(true);
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Erreur lors du chargement des patients:', error);
      } else if (data) {
        setPatients(data as Patient[]);
      }
      setLoading(false);
    }
    
    fetchPatients();
  }, []);

  const filtered = patients.filter((p) => {
    const matchSearch =
      search === '' ||
      `${p.prenom} ${p.nom}`.toLowerCase().includes(search.toLowerCase()) ||
      p.code_patient?.toLowerCase().includes(search.toLowerCase()) ||
      p.telephone?.includes(search);
    const matchSexe = filterSexe === 'tous' || p.sexe === filterSexe;
    const matchStatut = filterStatut === 'tous' || p.statut === filterStatut;
    const matchAssurance = filterAssurance === 'tous' || (filterAssurance === 'oui' ? !!p.assureur : !p.assureur);
    return matchSearch && matchSexe && matchStatut && matchAssurance;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleExport = () => {
    downloadCsv(
      `patients-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Code', 'Nom', 'Prénom', 'Sexe', 'Date de naissance', 'Âge', 'Téléphone', 'Email', 'Adresse', 'Groupe sanguin', 'Assureur', 'N° assurance', "Contact d'urgence", 'Tél. urgence', 'Statut', 'Enregistré le'],
      filtered.map((p) => [
        p.code_patient, p.nom, p.prenom, p.sexe, formatDate(p.date_naissance), getAge(p.date_naissance), p.telephone, p.email, p.adresse,
        p.groupe_sanguin, p.assureur, p.numero_assurance, p.contact_urgence_nom, p.contact_urgence_tel, p.statut, formatDate(p.created_at),
      ])
    );
  };

  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Patients</h1>
          <p className="page-subtitle">
            {loading ? 'Chargement des données...' : `${patients.length} patients enregistrés dans la base`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-outline" onClick={() => setShowFilters(!showFilters)}>
            <Filter size={16} /> Filtres
          </button>
          <button className="btn btn-outline" onClick={handleExport} disabled={loading || filtered.length === 0} title="Exporter la liste filtrée (CSV / Excel)">
            <Download size={16} /> Exporter
          </button>
          <Link href="/patients/nouveau" className="btn btn-primary">
            <UserPlus size={16} /> Nouveau Patient
          </Link>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '14px 22px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="header-search" style={{ flex: 1, minWidth: 250 }}>
              <Search className="header-search-icon" />
              <input
                type="text"
                placeholder="Rechercher par nom, code patient ou téléphone..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                id="patient-search"
              />
            </div>
            {showFilters && (
              <>
                <select
                  className="form-select"
                  value={filterSexe}
                  onChange={(e) => { setFilterSexe(e.target.value); setPage(1); }}
                  style={{ width: 140 }}
                  id="filter-sexe"
                >
                  <option value="tous">Tous les sexes</option>
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                </select>
                <select className="form-select" value={filterStatut} onChange={(e) => { setFilterStatut(e.target.value); setPage(1); }} style={{ width: 150 }}>
                  <option value="tous">Tous les statuts</option>
                  <option value="actif">Actifs</option>
                  <option value="inactif">Inactifs</option>
                  <option value="décédé">Décédés</option>
                </select>
                <select className="form-select" value={filterAssurance} onChange={(e) => { setFilterAssurance(e.target.value); setPage(1); }} style={{ width: 160 }}>
                  <option value="tous">Assurés et non assurés</option>
                  <option value="oui">Assurés</option>
                  <option value="non">Non assurés</option>
                </select>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Patients Table */}
      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Code</th>
              <th>Âge / Sexe</th>
              <th>Téléphone</th>
              <th>Groupe Sanguin</th>
              <th>Assurance</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8}>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px 0', color: 'var(--primary-600)' }}>
                    <Loader2 className="animate-spin" size={24} style={{ marginRight: 10 }} />
                    <span style={{ fontWeight: 500 }}>Chargement depuis Supabase...</span>
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">
                    <Inbox className="empty-state-icon" />
                    <h3>Aucun patient trouvé</h3>
                    <p>Commencez par enregistrer un nouveau patient dans le système.</p>
                    <Link href="/patients/nouveau" className="btn btn-primary" style={{ marginTop: 16 }}>
                      <UserPlus size={16} /> Ajouter un patient
                    </Link>
                  </div>
                </td>
              </tr>
            ) : (
              pageItems.map((patient, index) => (
                <tr key={patient.id} className="animate-slide-in-right" style={{ animationDelay: `${index * 0.03}s` }}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className={`avatar ${avatarColors[index % avatarColors.length]}`}>
                        {patient.prenom[0]}{patient.nom[0]}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--neutral-800)' }}>
                          {patient.prenom} {patient.nom}
                        </div>
                        {patient.email && (
                          <div style={{ fontSize: 11, color: 'var(--neutral-400)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Mail size={10} /> {patient.email}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--primary-600)', fontWeight: 600 }}>
                      {patient.code_patient || 'En attente...'}
                    </span>
                  </td>
                  <td>
                    {getAge(patient.date_naissance)} ans &middot;{' '}
                    <span className={`badge ${patient.sexe === 'M' ? 'badge-info' : 'badge-purple'}`} style={{ fontSize: 10 }}>
                      {patient.sexe === 'M' ? '♂ M' : '♀ F'}
                    </span>
                  </td>
                  <td>
                    {patient.telephone ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Phone size={12} style={{ color: 'var(--neutral-400)' }} />
                        {patient.telephone}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--neutral-300)' }}>—</span>
                    )}
                  </td>
                  <td>
                    {patient.groupe_sanguin ? (
                      <span className="badge badge-danger" style={{ fontSize: 11, fontWeight: 700 }}>
                        {patient.groupe_sanguin}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--neutral-300)' }}>—</span>
                    )}
                  </td>
                  <td>
                    {patient.assureur ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Shield size={12} style={{ color: 'var(--accent-500)' }} />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{patient.assureur}</div>
                          <div style={{ fontSize: 10, color: 'var(--neutral-400)' }}>{patient.numero_assurance}</div>
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--neutral-300)', fontSize: 12 }}>Non assuré</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${
                      patient.statut === 'actif' ? 'badge-success' :
                      patient.statut === 'inactif' ? 'badge-neutral' :
                      'badge-danger'
                    }`}>
                      {patient.statut}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Link href={`/patients/${patient.id}`} className="btn btn-ghost btn-sm" title="Voir le dossier">
                        <Eye size={14} />
                      </Link>
                      <Link href={`/patients/${patient.id}/edit`} className="btn btn-ghost btn-sm" title="Modifier">
                        <Edit size={14} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {!loading && patients.length > 0 && (
          <div style={{
            padding: '14px 22px',
            borderTop: '1px solid var(--neutral-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 13,
            color: 'var(--neutral-500)',
          }}>
            <span>
              {filtered.length === 0
                ? 'Aucun résultat'
                : `Affichage de ${(currentPage - 1) * PAGE_SIZE + 1} à ${Math.min(currentPage * PAGE_SIZE, filtered.length)} sur ${filtered.length} patient${filtered.length > 1 ? 's' : ''}`}
              {filtered.length !== patients.length && ` (${patients.length} au total)`}
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className="btn btn-outline btn-sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                <ChevronLeft size={14} /> Précédent
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === totalPages || Math.abs(n - currentPage) <= 1)
                .map((n, i, arr) => (
                  <span key={n} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {i > 0 && n - arr[i - 1] > 1 && <span>…</span>}
                    <button className={`btn btn-sm ${n === currentPage ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPage(n)}>{n}</button>
                  </span>
                ))}
              <button className="btn btn-outline btn-sm" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>
                Suivant <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
