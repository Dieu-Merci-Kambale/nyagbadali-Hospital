'use client';

import { useState, useEffect } from 'react';
import {
  UserCog,
  Search,
  Plus,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Loader2,
  Inbox,
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { Personnel } from '@/types';

const roleLabels: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Administrateur',
  medecin_chef: 'Médecin Chef',
  medecin: 'Médecin',
  infirmier_chef: 'Infirmier Chef',
  infirmier: 'Infirmier(e)',
  technicien_labo: 'Technicien Labo',
  pharmacien: 'Pharmacien(ne)',
  caissier: 'Caissier(e)',
  receptionniste: 'Réceptionniste',
};

const roleColors: Record<string, string> = {
  super_admin: 'badge-danger',
  admin: 'badge-danger',
  medecin_chef: 'badge-purple',
  medecin: 'badge-info',
  infirmier_chef: 'badge-success',
  infirmier: 'badge-success',
  technicien_labo: 'badge-warning',
  pharmacien: 'badge-warning',
  caissier: 'badge-neutral',
  receptionniste: 'badge-neutral',
};

const avatarColors = ['avatar-blue', 'avatar-green', 'avatar-orange', 'avatar-purple', 'avatar-pink'];

export default function PersonnelPage() {
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('tous');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    async function fetchPersonnel() {
      setLoading(true);
      const { data, error } = await supabase
        .from('personnel')
        .select('*, departements!personnel_departement_id_fkey(nom)')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erreur:', error);
      } else if (data) {
        const mapped = data.map((p: any) => ({
          ...p,
          departement: p.departements ? { nom: p.departements.nom } : undefined,
        }));
        setPersonnel(mapped as Personnel[]);
      }
      setLoading(false);
    }
    fetchPersonnel();
  }, []);

  const filtered = personnel.filter((p) => {
    const matchSearch = search === '' ||
      `${p.prenom} ${p.nom}`.toLowerCase().includes(search.toLowerCase()) ||
      p.code_personnel.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === 'tous' || p.role === filterRole;
    return matchSearch && matchRole;
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, gap: 12 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
        <span style={{ fontWeight: 500, color: 'var(--neutral-500)' }}>Chargement du personnel...</span>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Personnel</h1>
          <p className="page-subtitle">{personnel.length} membres du personnel</p>
        </div>
        <Link href="/personnel/nouveau" className="btn btn-primary">
          <Plus size={16} /> Ajouter un Membre
        </Link>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '14px 22px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="header-search" style={{ flex: 1, minWidth: 250 }}>
              <Search className="header-search-icon" />
              <input
                type="text"
                placeholder="Rechercher par nom ou code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                id="staff-search"
              />
            </div>
            <select
              className="form-select"
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              style={{ width: 180 }}
              id="filter-role"
            >
              <option value="tous">Tous les rôles</option>
              {Object.entries(roleLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setViewMode('grid')}>Grille</button>
              <button className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setViewMode('list')}>Liste</button>
            </div>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <Inbox className="empty-state-icon" />
              <h3>Aucun personnel trouvé</h3>
              <p>Ajoutez des membres du personnel pour commencer.</p>
            </div>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
          {filtered.map((person, index) => (
            <div key={person.id} className="card animate-slide-up" style={{ animationDelay: `${index * 0.05}s`, cursor: 'pointer' }}>
              <div className="card-body" style={{ textAlign: 'center', padding: '28px 22px 22px' }}>
                <div className={`avatar avatar-xl ${avatarColors[index % avatarColors.length]}`} style={{ margin: '0 auto 14px' }}>
                  {person.prenom[0]}{person.nom[0]}
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--neutral-900)', marginBottom: 2 }}>
                  {person.role.startsWith('medecin') ? 'Dr. ' : ''}{person.prenom} {person.nom}
                </h3>
                {person.specialite && (
                  <p style={{ fontSize: 12, color: 'var(--primary-600)', fontWeight: 500, marginBottom: 8 }}>{person.specialite}</p>
                )}
                <span className={`badge ${roleColors[person.role] || 'badge-neutral'}`}>{roleLabels[person.role] || person.role}</span>
                <div style={{ marginTop: 16, padding: '12px 0 0', borderTop: '1px solid var(--neutral-100)', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--neutral-500)', textAlign: 'left' }}>
                  {person.departement && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MapPin size={13} /> {person.departement.nom}</div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Mail size={13} /> {person.email}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Calendar size={13} /> Depuis {new Date(person.date_embauche).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <Link href={`/personnel/${person.id}/edit`} className="btn btn-outline btn-sm" style={{ width: '100%' }}>
                    Gérer
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Membre</th>
                <th>Code</th>
                <th>Rôle</th>
                <th>Département</th>
                <th>Email</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((person, index) => (
                <tr key={person.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className={`avatar ${avatarColors[index % avatarColors.length]}`}>{person.prenom[0]}{person.nom[0]}</div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{person.role.startsWith('medecin') ? 'Dr. ' : ''}{person.prenom} {person.nom}</div>
                        {person.specialite && <div style={{ fontSize: 11, color: 'var(--primary-500)' }}>{person.specialite}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{person.code_personnel}</td>
                  <td><span className={`badge ${roleColors[person.role]}`}>{roleLabels[person.role]}</span></td>
                  <td>{person.departement?.nom || '—'}</td>
                  <td style={{ fontSize: 12 }}>{person.email}</td>
                  <td><span className={`badge ${person.statut === 'actif' ? 'badge-success' : 'badge-neutral'}`}>{person.statut}</span></td>
                  <td>
                    <Link href={`/personnel/${person.id}/edit`} className="btn btn-outline btn-sm">Gérer</Link>
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
