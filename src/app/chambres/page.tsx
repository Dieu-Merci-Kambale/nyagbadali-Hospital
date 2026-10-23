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
  AlertCircle,
  Lock,
  Eye
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Pagination from '@/components/ui/Pagination';
import { usePagination } from '@/lib/usePagination';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole, RestrictionBanner } from '@/components/AdminGuard';
import { compareChambres } from '@/lib/batiments';

const RESERVE = "Accès refusé : opération réservée au super administrateur et à l'administrateur";
// Apparence uniforme des boutons verrouillés (grisés, sans effet au survol)
const lockedStyle: React.CSSProperties = {
  background: 'var(--neutral-100)', color: 'var(--neutral-400)', border: '1px solid var(--neutral-200)',
  boxShadow: 'none', cursor: 'not-allowed', opacity: 1,
};

export default function ChambresPage() {
  const { profile } = useAuth();
  // Séparation des tâches : seuls le super administrateur et l'administrateur configurent l'hébergement
  const canManage = isAdminRole(profile?.role);
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
        setChambres((data || []).sort(compareChambres));
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
      (c.etage && c.etage.toLowerCase().includes(s)) ||
      (c.departement?.nom && c.departement.nom.toLowerCase().includes(s))
    );
  });
  const { pageItems, page, pageCount, total, setPage } = usePagination(filtered, search);

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
          <p className="page-subtitle">{canManage ? "Gérez la configuration de l'hébergement hospitalier" : "Consultez l'hébergement hospitalier"}</p>
        </div>
        {canManage ? (
          <Link href="/chambres/nouvelle" className="btn btn-primary">
            <Plus size={16} /> Nouvelle Chambre
          </Link>
        ) : (
          <button type="button" className="btn" disabled aria-disabled="true" title={RESERVE} style={lockedStyle}>
            <Lock size={16} /> Nouvelle Chambre
          </button>
        )}
      </div>

      {!canManage && (
        <RestrictionBanner>
          Conformément à la politique de contrôle interne de l&apos;établissement, la création et la modification des chambres
          et des lits (ajout, suppression, mise en maintenance) sont exclusivement réservées au super administrateur et à
          l&apos;administrateur. L&apos;occupation des lits se met à jour automatiquement lors des admissions, transferts et sorties.
        </RestrictionBanner>
      )}

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
              placeholder="Rechercher par chambre, bâtiment ou département..."
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
              {canManage && (
                <Link href="/chambres/nouvelle" className="btn btn-primary" style={{ marginTop: 16 }}>
                  Créer une chambre
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
                <th>Chambre / salle</th>
                <th>Bâtiment</th>
                <th>Département</th>
                <th>Type</th>
                <th>Capacité</th>
                <th>Lits Enregistrés</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((c, index) => {
                const totalL = c.lits ? c.lits.length : 0;
                // Alerte si la capacité max est atteinte ou si les lits dépassent
                const statusColor = totalL < c.capacite ? 'var(--warning-600)' : (totalL > c.capacite ? 'var(--danger-600)' : 'var(--success-600)');
                
                return (
                  <tr key={c.id} className="animate-slide-in-right" style={{ animationDelay: `${index * 0.03}s` }}>
                    <td style={{ fontWeight: 600, fontSize: 15 }}>{c.numero}</td>
                    <td>{c.etage || '—'}</td>
                    <td>{c.departement?.nom || '—'}</td>
                    <td style={{ textTransform: 'capitalize' }}>{c.type}</td>
                    <td>{c.capacite} lits max</td>
                    <td>
                      <span style={{ fontWeight: 600, color: statusColor }}>
                        {totalL} / {c.capacite}
                      </span>
                    </td>
                    <td>
                      {canManage ? (
                        <Link href={`/chambres/${c.id}/edit`} className="btn btn-sm btn-outline">
                          <Edit size={14} style={{ marginRight: 6 }} /> Gérer la chambre
                        </Link>
                      ) : (
                        <button type="button" className="btn btn-sm" disabled aria-disabled="true" title={RESERVE} style={lockedStyle}>
                          <Lock size={14} style={{ marginRight: 6 }} /> Gérer la chambre
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} pageCount={pageCount} total={total} onPageChange={setPage} label="chambres" />
        </div>
      )}
    </div>
  );
}
