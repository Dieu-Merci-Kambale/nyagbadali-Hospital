'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BedDouble,
  Search,
  Plus,
  Edit,
  Loader2,
  Inbox,
  LayoutGrid,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function ChambresPage() {
  const [chambres, setChambres] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetchChambres() {
      setLoading(true);
      const { data, error } = await supabase
        .from('chambres')
        .select(`
          *,
          departement:departement_id (nom),
          lits (id, statut)
        `)
        .order('numero', { ascending: true });

      if (error) {
        console.error('Erreur de chargement:', error);
      } else {
        setChambres(data || []);
      }
      setLoading(false);
    }
    fetchChambres();
  }, []);

  const filtered = chambres.filter(c => {
    const s = search.toLowerCase();
    return (
      search === '' ||
      c.numero.toLowerCase().includes(s) ||
      (c.departement?.nom && c.departement.nom.toLowerCase().includes(s))
    );
  });

  // Calcul des statistiques
  const totalChambres = chambres.length;
  let totalLits = 0;
  let litsDisponibles = 0;
  let litsOccupes = 0;

  chambres.forEach(c => {
    if (c.lits) {
      totalLits += c.lits.length;
      c.lits.forEach((lit: any) => {
        if (lit.statut === 'disponible') litsDisponibles++;
        if (lit.statut === 'occupé') litsOccupes++;
      });
    }
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, gap: 12 }}>
        <Loader2 size={24} className="animate-spin text-primary-500" />
        <span style={{ fontWeight: 500, color: 'var(--neutral-500)' }}>Chargement des chambres...</span>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Chambres & Lits</h1>
          <p className="page-subtitle">Gérez la configuration de l'hébergement hospitalier</p>
        </div>
        <Link href="/chambres/nouvelle" className="btn btn-primary">
          <Plus size={16} /> Nouvelle Chambre
        </Link>
      </div>

      {/* Statistiques */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-card-icon blue"><LayoutGrid size={22} /></div>
          <div className="stat-card-info">
            <h3>Total Chambres</h3>
            <div className="stat-value">{totalChambres}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ backgroundColor: 'var(--neutral-100)', color: 'var(--neutral-600)' }}>
            <BedDouble size={22} />
          </div>
          <div className="stat-card-info">
            <h3>Total Lits (enregistrés)</h3>
            <div className="stat-value">{totalLits}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon green"><CheckCircle size={22} /></div>
          <div className="stat-card-info">
            <h3>Lits Disponibles</h3>
            <div className="stat-value" style={{ color: 'var(--success-600)' }}>{litsDisponibles}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon red"><AlertCircle size={22} /></div>
          <div className="stat-card-info">
            <h3>Lits Occupés</h3>
            <div className="stat-value" style={{ color: 'var(--danger-600)' }}>{litsOccupes}</div>
          </div>
        </div>
      </div>

      {/* Barre de recherche */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '14px 22px' }}>
          <div className="header-search" style={{ maxWidth: 400 }}>
            <Search className="header-search-icon" />
            <input
              type="text"
              placeholder="Rechercher par numéro ou département..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Liste des chambres */}
      {filtered.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <Inbox className="empty-state-icon" />
              <h3>Aucune chambre trouvée</h3>
              <p>Aucune chambre ne correspond à votre recherche ou la base est vide.</p>
              <Link href="/chambres/nouvelle" className="btn btn-primary" style={{ marginTop: 16 }}>
                Créer une chambre
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Numéro</th>
                <th>Département</th>
                <th>Étage</th>
                <th>Type</th>
                <th>Capacité</th>
                <th>Lits Enregistrés</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, index) => {
                const totalL = c.lits ? c.lits.length : 0;
                // Alerte si la capacité max est atteinte ou si les lits dépassent
                const statusColor = totalL < c.capacite ? 'var(--warning-600)' : (totalL > c.capacite ? 'var(--danger-600)' : 'var(--success-600)');
                
                return (
                  <tr key={c.id} className="animate-slide-in-right" style={{ animationDelay: `${index * 0.03}s` }}>
                    <td style={{ fontWeight: 600, fontSize: 15 }}>Chambre {c.numero}</td>
                    <td>{c.departement?.nom || '—'}</td>
                    <td>{c.etage}</td>
                    <td style={{ textTransform: 'capitalize' }}>{c.type}</td>
                    <td>{c.capacite} lits max</td>
                    <td>
                      <span style={{ fontWeight: 600, color: statusColor }}>
                        {totalL} / {c.capacite}
                      </span>
                    </td>
                    <td>
                      <Link href={`/chambres/${c.id}/edit`} className="btn btn-sm btn-outline">
                        <Edit size={14} style={{ marginRight: 6 }} /> Gérer la chambre
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
