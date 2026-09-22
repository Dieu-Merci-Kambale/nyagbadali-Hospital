'use client';

import { useState, useEffect } from 'react';
import {
  Receipt,
  Search,
  Plus,
  CreditCard,
  Banknote,
  FileCheck,
  Clock,
  Ban,
  CheckCircle,
  AlertCircle,
  Loader2,
  Inbox,
  Filter
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

function formatCDF(montant: number): string {
  return new Intl.NumberFormat('fr-CD', { style: 'decimal', maximumFractionDigits: 0 }).format(montant) + ' FC';
}

const statutConfig: Record<string, { label: string; class: string; icon: React.ReactNode }> = {
  'en_attente': { label: 'En attente', class: 'badge-warning', icon: <Clock size={12} /> },
  'payée': { label: 'Payée', class: 'badge-success', icon: <CheckCircle size={12} /> },
  'annulée': { label: 'Annulée', class: 'badge-danger', icon: <Ban size={12} /> },
  'partielle': { label: 'Partielle', class: 'badge-info', icon: <AlertCircle size={12} /> },
};

export default function FacturationPage() {
  const [factures, setFactures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('tous');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [appliedEndDate, setAppliedEndDate] = useState('');

  useEffect(() => {
    async function fetchFactures() {
      setLoading(true);
      const { data, error } = await supabase
        .from('factures')
        .select('*, patients(nom, prenom, code_patient), paiements(montant)')
        .order('date_facture', { ascending: false });

      if (error) {
        console.error('Erreur:', error);
      } else {
        const enrichedData = data?.map(f => ({
          ...f,
          montant_paye: f.paiements?.reduce((acc: number, p: any) => acc + p.montant, 0) || 0
        })) || [];
        setFactures(enrichedData);
      }
      setLoading(false);
    }
    fetchFactures();
  }, []);

  const filtered = factures.filter((f) => {
    const matchSearch = search === '' ||
      `${f.patients?.prenom} ${f.patients?.nom}`.toLowerCase().includes(search.toLowerCase()) ||
      f.patients?.code_patient?.toLowerCase().includes(search.toLowerCase());
    const matchStatut = filterStatut === 'tous' || f.statut === filterStatut;
    
    let matchDate = true;
    if (appliedStartDate || appliedEndDate) {
      const fDate = new Date(f.created_at).getTime();
      if (appliedStartDate) {
        const [y, m, d] = appliedStartDate.split('-');
        const dDebut = new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0);
        if (fDate < dDebut.getTime()) matchDate = false;
      }
      if (appliedEndDate) {
        const [y, m, d] = appliedEndDate.split('-');
        const dFin = new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999);
        if (fDate > dFin.getTime()) matchDate = false;
      }
    }

    return matchSearch && matchStatut && matchDate;
  });

  const handleFilter = () => {
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
  };

  const revenuTotal = factures.filter(f => f.statut === 'payée' || f.statut === 'partielle').reduce((acc, f) => acc + (f.montant_paye || 0), 0);
  const enAttente = factures
    .filter(f => f.statut !== 'payée' && f.statut !== 'annulée')
    .reduce((acc, f) => acc + (f.montant_patient - (f.montant_paye || 0)), 0);
  
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, gap: 12 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
        <span style={{ fontWeight: 500, color: 'var(--neutral-500)' }}>Chargement des factures...</span>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Facturation</h1>
          <p className="page-subtitle">Gestion des paiements et factures</p>
        </div>
        <Link href="/facturation/nouvelle" className="btn btn-primary">
          <Plus size={16} /> Nouvelle Facture
        </Link>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-card-icon green"><Banknote size={22} /></div>
          <div className="stat-card-info">
            <h3>Revenus Encaissés</h3>
            <div className="stat-value">{formatCDF(revenuTotal)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon orange"><Clock size={22} /></div>
          <div className="stat-card-info">
            <h3>Paiements en attente</h3>
            <div className="stat-value">{formatCDF(enAttente)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon blue"><FileCheck size={22} /></div>
          <div className="stat-card-info">
            <h3>Factures Émises</h3>
            <div className="stat-value">{factures.length}</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '14px 22px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="header-search" style={{ flex: 1, minWidth: 250 }}>
              <Search className="header-search-icon" />
              <input type="text" placeholder="Rechercher un patient ou un code..." value={search} onChange={(e) => setSearch(e.target.value)} id="invoice-search" />
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--neutral-500)' }}>Du:</span>
              <input type="date" className="form-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: 140 }} />
              <span style={{ fontSize: 13, color: 'var(--neutral-500)' }}>Au:</span>
              <input type="date" className="form-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: 140 }} />
              <button onClick={handleFilter} className="btn btn-primary" style={{ padding: '8px 16px' }}>
                <Filter size={16} /> Filtrer
              </button>
            </div>

            <select className="form-select" value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={{ width: 160 }} id="filter-status">
              <option value="tous">Tous les statuts</option>
              <option value="en_attente">En attente</option>
              <option value="payée">Payée</option>
              <option value="partielle">Partielle</option>
              <option value="annulée">Annulée</option>
            </select>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
         <div className="card">
         <div className="card-body">
           <div className="empty-state">
             <Inbox className="empty-state-icon" />
             <h3>Aucune facture</h3>
             <p>Il n&apos;y a aucune facture enregistrée pour cette sélection.</p>
           </div>
         </div>
       </div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Montant Total</th>
                <th>Montant Payé</th>
                <th>Reste à Payer</th>
                <th>Date</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((facture: any, index: number) => {
                const config = statutConfig[facture.statut] || statutConfig['en_attente'];
                const reste = facture.montant_patient - (facture.montant_paye || 0);
                return (
                  <tr key={facture.id} className="animate-slide-in-right" style={{ animationDelay: `${index * 0.03}s` }}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{facture.patients?.prenom} {facture.patients?.nom}</div>
                      <div style={{ fontSize: 11, color: 'var(--neutral-400)' }}>{facture.patients?.code_patient}</div>
                    </td>
                    <td style={{ fontWeight: 700 }}>
                      <div style={{ color: 'var(--neutral-900)' }}>{formatCDF(facture.montant_patient)}</div>
                      {facture.montant_assurance > 0 && <div style={{ fontSize: 11, color: 'var(--neutral-400)', fontWeight: 400 }}>Assurance: {formatCDF(facture.montant_assurance)}</div>}
                    </td>
                    <td style={{ color: 'var(--success)' }}>{formatCDF(facture.montant_paye || 0)}</td>
                    <td style={{ color: reste > 0 ? 'var(--danger)' : 'var(--neutral-400)' }}>{formatCDF(reste)}</td>
                    <td>{new Date(facture.date_facture).toLocaleDateString('fr-FR')}</td>
                    <td>
                      <span className={`badge ${config.class}`}>
                        {config.icon}
                        <span style={{ marginLeft: 4 }}>{config.label}</span>
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Link href={`/facturation/${facture.id}`} className="btn btn-sm btn-outline">
                          Détails / Encaisser
                        </Link>
                        <button className="btn btn-sm btn-ghost">
                          <Receipt size={14} style={{ marginRight: 4 }} /> Reçu
                        </button>
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
