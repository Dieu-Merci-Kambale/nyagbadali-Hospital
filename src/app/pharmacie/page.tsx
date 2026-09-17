'use client';

import { useState, useEffect } from 'react';
import {
  Pill,
  Search,
  Plus,
  AlertTriangle,
  Package,
  Calendar,
  CheckCircle,
  XCircle,
  Loader2,
  Inbox,
  LayoutDashboard,
  ClipboardList,
  ArrowRight,
  ShieldAlert,
  List as ListIcon,
  LayoutGrid
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { Medicament } from '@/types';
import { useConfirm } from '@/context/ConfirmContext';

function formatCDF(montant: number): string {
  return new Intl.NumberFormat('fr-CD', { style: 'decimal', maximumFractionDigits: 0 }).format(montant) + ' FC';
}

export default function PharmacieHubPage() {
  const { confirm } = useConfirm();
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventaire' | 'prescriptions'>('dashboard');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  
  const [medicaments, setMedicaments] = useState<Medicament[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [dispensing, setDispensing] = useState<string | null>(null);
  const [dispenseQty, setDispenseQty] = useState<Record<string, number>>({});

  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('tous');

  // Logic to auto-update expired meds
  const updateExpiredStatus = (meds: Medicament[]) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return meds.map(m => {
      if (m.date_peremption) {
        const peremption = new Date(m.date_peremption);
        if (peremption < today && m.statut !== 'expiré') {
          return { ...m, statut: 'expiré' as const };
        }
      }
      if (m.stock_actuel <= 0 && m.statut !== 'rupture') {
        return { ...m, statut: 'rupture' as const };
      }
      return m;
    });
  };

  const loadData = async () => {
    setLoading(true);
    
    // Fetch meds
    const { data: medsData } = await supabase
      .from('medicaments')
      .select('*')
      .order('nom_commercial', { ascending: true });
      
    const processedMeds = updateExpiredStatus((medsData || []) as Medicament[]);
    setMedicaments(processedMeds);

    // Fetch active prescriptions
    const { data: presData } = await supabase
      .from('prescriptions')
      .select('*, consultations(patients(nom, prenom, code_patient))')
      .eq('statut', 'active')
      .order('created_at', { ascending: false });

    setPrescriptions(presData || []);
    
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDispense = async (prescriptionId: string, medicamentId: string | undefined, nomMed: string) => {
    const qty = dispenseQty[prescriptionId];
    if (!qty || qty <= 0) {
      alert("Veuillez saisir une quantité valide à délivrer.");
      return;
    }

    // Trouver le médicament dans le stock
    const med = medicaments.find(m => m.id === medicamentId || (m.nom_commercial.toLowerCase() === nomMed.toLowerCase() && m.statut !== 'rupture' && m.statut !== 'expiré'));

    if (!med) {
      alert("Ce médicament n'est pas trouvé dans le stock ou est expiré/en rupture.");
      return;
    }

    if (med.stock_actuel < qty) {
      alert(`Stock insuffisant. Il ne reste que ${med.stock_actuel} en stock.`);
      return;
    }

    const isConfirmed = await confirm({
      title: 'Délivrer le médicament',
      message: `Vous êtes sur le point de délivrer ${qty} unité(s) de ${med.nom_commercial}. Le stock sera automatiquement déduit. Continuer ?`,
      confirmText: 'Oui, délivrer',
      type: 'info'
    });

    if (!isConfirmed) return;

    setDispensing(prescriptionId);

    // 1. Déduire le stock
    const newStock = med.stock_actuel - qty;
    let newStatus = med.statut;
    if (newStock <= 0) newStatus = 'rupture';

    const { error: stockErr } = await supabase
      .from('medicaments')
      .update({ stock_actuel: newStock, statut: newStatus })
      .eq('id', med.id);

    if (stockErr) {
      alert("Erreur lors de la mise à jour du stock.");
      setDispensing(null);
      return;
    }

    // 2. Mettre à jour la prescription
    const { error: presErr } = await supabase
      .from('prescriptions')
      .update({ statut: 'dispensée' })
      .eq('id', prescriptionId);

    if (presErr) {
      alert("Erreur lors de la mise à jour de la prescription.");
      setDispensing(null);
      return;
    }

    // Refresh
    await loadData();
    setDispensing(null);
  };

  // --- RENDERS ---

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, gap: 12 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
        <span style={{ fontWeight: 500, color: 'var(--neutral-500)' }}>Synchronisation avec la pharmacie centrale...</span>
      </div>
    );
  }

  const totalMedicaments = medicaments.length;
  const enRupture = medicaments.filter(m => m.statut === 'rupture').length;
  const stockBas = medicaments.filter(m => m.stock_actuel > 0 && m.stock_actuel <= m.stock_minimum && m.statut !== 'expiré').length;
  const expires = medicaments.filter(m => m.statut === 'expiré').length;
  
  const today = new Date();
  today.setHours(0,0,0,0);
  const peremptionProche = medicaments.filter(m => {
    if (!m.date_peremption || m.statut === 'expiré' || m.statut === 'rupture') return false;
    const p = new Date(m.date_peremption);
    const diffTime = Math.abs(p.getTime() - today.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    return diffDays <= 30; // 30 jours
  }).length;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pharmacie Centrale</h1>
          <p className="page-subtitle">Gestion intégrée des stocks et délivrance</p>
        </div>
        {activeTab === 'inventaire' && (
          <Link href="/pharmacie/nouveau" className="btn btn-primary">
            <Plus size={16} /> Ajouter un Médicament
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 24, borderBottom: '1px solid var(--neutral-200)', display: 'flex', gap: 24 }}>
        <button 
          className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} 
          onClick={() => setActiveTab('dashboard')}
          style={{ padding: '12px 0', fontWeight: 600, color: activeTab === 'dashboard' ? 'var(--primary-600)' : 'var(--neutral-500)', borderBottom: activeTab === 'dashboard' ? '2px solid var(--primary-600)' : 'none', display: 'flex', alignItems: 'center', gap: 8, background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer' }}
        >
          <LayoutDashboard size={18} /> Tableau de Bord
        </button>
        <button 
          className={`tab-btn ${activeTab === 'prescriptions' ? 'active' : ''}`} 
          onClick={() => setActiveTab('prescriptions')}
          style={{ padding: '12px 0', fontWeight: 600, color: activeTab === 'prescriptions' ? 'var(--primary-600)' : 'var(--neutral-500)', borderBottom: activeTab === 'prescriptions' ? '2px solid var(--primary-600)' : 'none', display: 'flex', alignItems: 'center', gap: 8, background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer' }}
        >
          <ClipboardList size={18} /> Comptoir de Délivrance
          {prescriptions.length > 0 && (
            <span style={{ background: 'var(--danger-500)', color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 12 }}>{prescriptions.length}</span>
          )}
        </button>
        <button 
          className={`tab-btn ${activeTab === 'inventaire' ? 'active' : ''}`} 
          onClick={() => setActiveTab('inventaire')}
          style={{ padding: '12px 0', fontWeight: 600, color: activeTab === 'inventaire' ? 'var(--primary-600)' : 'var(--neutral-500)', borderBottom: activeTab === 'inventaire' ? '2px solid var(--primary-600)' : 'none', display: 'flex', alignItems: 'center', gap: 8, background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer' }}
        >
          <Package size={18} /> Inventaire & Stocks
        </button>
      </div>

      {/* TAB: DASHBOARD */}
      {activeTab === 'dashboard' && (
        <div className="animate-slide-up">
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
            <div className="stat-card">
              <div className="stat-card-icon blue"><Pill size={22} /></div>
              <div className="stat-card-info"><h3>Références au stock</h3><div className="stat-value">{totalMedicaments}</div></div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon green"><ClipboardList size={22} /></div>
              <div className="stat-card-info"><h3>Ordonnances en attente</h3><div className="stat-value" style={{ color: prescriptions.length > 0 ? 'var(--warning-600)' : '' }}>{prescriptions.length}</div></div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon orange"><AlertTriangle size={22} /></div>
              <div className="stat-card-info"><h3>Stocks Critiques</h3><div className="stat-value">{stockBas + enRupture}</div></div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon red"><ShieldAlert size={22} /></div>
              <div className="stat-card-info"><h3>Périmés / Risques</h3><div className="stat-value">{expires + peremptionProche}</div></div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div className="card">
              <div className="card-header"><h3 style={{ margin: 0, fontSize: 16 }}>⚠️ Alertes de Péremption (30 jours)</h3></div>
              <div className="card-body">
                {medicaments.filter(m => {
                  if (!m.date_peremption || m.statut === 'expiré') return false;
                  const diff = Math.ceil(Math.abs(new Date(m.date_peremption).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                  return diff <= 30;
                }).length === 0 ? (
                  <p style={{ color: 'var(--neutral-500)', fontSize: 14 }}>Aucun médicament ne se périme prochainement.</p>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {medicaments.filter(m => {
                      if (!m.date_peremption || m.statut === 'expiré') return false;
                      return Math.ceil(Math.abs(new Date(m.date_peremption).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) <= 30;
                    }).map(m => (
                      <li key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 12, backgroundColor: 'var(--warning-50)', border: '1px solid var(--warning-200)', borderRadius: 8 }}>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--warning-900)' }}>{m.nom_commercial}</div>
                          <div style={{ fontSize: 12, color: 'var(--warning-700)' }}>Lot / {m.code}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, color: 'var(--warning-700)' }}>{new Date(m.date_peremption!).toLocaleDateString()}</div>
                          <div style={{ fontSize: 11, color: 'var(--warning-600)' }}>Expiration proche</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header"><h3 style={{ margin: 0, fontSize: 16 }}>❌ Médicaments Expirés</h3></div>
              <div className="card-body">
                {medicaments.filter(m => m.statut === 'expiré').length === 0 ? (
                  <p style={{ color: 'var(--neutral-500)', fontSize: 14 }}>Aucun médicament expiré en stock.</p>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {medicaments.filter(m => m.statut === 'expiré').map(m => (
                      <li key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 12, backgroundColor: 'var(--danger-50)', border: '1px solid var(--danger-200)', borderRadius: 8 }}>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--danger-900)' }}>{m.nom_commercial}</div>
                          <div style={{ fontSize: 12, color: 'var(--danger-700)' }}>Stock bloqué: {m.stock_actuel}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, color: 'var(--danger-700)' }}>Périmé le</div>
                          <div style={{ fontSize: 12, color: 'var(--danger-600)' }}>{m.date_peremption ? new Date(m.date_peremption).toLocaleDateString() : 'Inconnu'}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: PRESCRIPTIONS */}
      {activeTab === 'prescriptions' && (
        <div className="animate-slide-up">
          {prescriptions.length === 0 ? (
            <div className="card">
              <div className="card-body">
                <div className="empty-state">
                  <CheckCircle className="empty-state-icon" style={{ color: 'var(--success-500)' }} />
                  <h3>Comptoir vide</h3>
                  <p>Aucune prescription médicale n'est en attente de délivrance.</p>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {prescriptions.map((pres) => (
                <div key={pres.id} className="card" style={{ borderLeft: '4px solid var(--primary-500)' }}>
                  <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span className="badge badge-info">Prescription</span>
                        <span style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{new Date(pres.created_at).toLocaleString()}</span>
                      </div>
                      <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--neutral-900)', margin: '0 0 4px 0' }}>{pres.nom_medicament}</h3>
                      <p style={{ fontSize: 14, color: 'var(--neutral-600)', margin: '0 0 12px 0' }}>
                        Posologie: <strong>{pres.dosage}</strong> • <strong>{pres.frequence}</strong> pendant <strong>{pres.duree}</strong> ({pres.voie_administration})
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: 'var(--neutral-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12, color: 'var(--neutral-600)' }}>
                          {pres.consultations?.patients?.prenom?.[0]}{pres.consultations?.patients?.nom?.[0]}
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 500 }}>Patient: {pres.consultations?.patients?.prenom} {pres.consultations?.patients?.nom}</span>
                      </div>
                    </div>
                    
                    <div style={{ flex: 1, backgroundColor: 'var(--neutral-50)', padding: 16, borderRadius: 8, border: '1px solid var(--neutral-200)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div>
                        <label className="form-label" style={{ fontSize: 12 }}>Quantité à délivrer et déduire du stock *</label>
                        <input 
                          type="number" 
                          className="form-input" 
                          min="1" 
                          placeholder="Ex: 2 (boîtes)"
                          value={dispenseQty[pres.id] || ''}
                          onChange={(e) => setDispenseQty({...dispenseQty, [pres.id]: parseInt(e.target.value)})}
                        />
                      </div>
                      <button 
                        className="btn btn-primary" 
                        style={{ width: '100%', justifyContent: 'center' }}
                        disabled={dispensing === pres.id || !dispenseQty[pres.id]}
                        onClick={() => handleDispense(pres.id, pres.medicament_id, pres.nom_medicament)}
                      >
                        {dispensing === pres.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                        Délivrer & Déduire
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: INVENTAIRE */}
      {activeTab === 'inventaire' && (
        <div className="animate-slide-up">
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-body" style={{ padding: '14px 22px' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div className="header-search" style={{ flex: 1, minWidth: 250 }}>
                  <Search className="header-search-icon" />
                  <input type="text" placeholder="Rechercher par nom ou code..." value={search} onChange={(e) => setSearch(e.target.value)} id="pharmacy-search" />
                </div>
                <select className="form-select" value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={{ width: 180 }} id="filter-stock">
                  <option value="tous">Tous les statuts</option>
                  <option value="disponible">✅ Disponible</option>
                  <option value="rupture">❌ En rupture</option>
                  <option value="expiré">⚠️ Expiré</option>
                </select>
                <div style={{ display: 'flex', border: '1px solid var(--neutral-200)', borderRadius: 8, overflow: 'hidden' }}>
                  <button 
                    className={`btn ${viewMode === 'list' ? 'btn-primary' : 'btn-ghost'}`} 
                    style={{ borderRadius: 0, padding: '8px 12px', border: 'none' }}
                    onClick={() => setViewMode('list')}
                    title="Vue Liste"
                  >
                    <ListIcon size={18} />
                  </button>
                  <button 
                    className={`btn ${viewMode === 'grid' ? 'btn-primary' : 'btn-ghost'}`} 
                    style={{ borderRadius: 0, padding: '8px 12px', border: 'none', borderLeft: '1px solid var(--neutral-200)' }}
                    onClick={() => setViewMode('grid')}
                    title="Vue Grille"
                  >
                    <LayoutGrid size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {medicaments.filter(m => (search === '' || m.nom_commercial.toLowerCase().includes(search.toLowerCase()) || m.code.toLowerCase().includes(search.toLowerCase())) && (filterStatut === 'tous' || m.statut === filterStatut)).length === 0 ? (
            <div className="card">
              <div className="card-body">
                <div className="empty-state">
                  <Inbox className="empty-state-icon" />
                  <h3>Aucun médicament</h3>
                  <p>Aucun résultat ou stock vide.</p>
                </div>
              </div>
            </div>
          ) : (
            viewMode === 'list' ? (
              <div className="card">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Médicament</th>
                      <th>Famille & Forme</th>
                      <th>Stock Actuel</th>
                      <th>Prix (FC)</th>
                      <th>Statut</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {medicaments.filter(m => (search === '' || m.nom_commercial.toLowerCase().includes(search.toLowerCase()) || m.code.toLowerCase().includes(search.toLowerCase())) && (filterStatut === 'tous' || m.statut === filterStatut)).map((med) => {
                      const isLow = med.stock_actuel > 0 && med.stock_actuel <= med.stock_minimum;
                      return (
                        <tr key={med.id}>
                          <td style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>{med.code}</td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{med.nom_commercial}</div>
                            <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{med.nom_generique || '—'} {med.dosage ? `(${med.dosage})` : ''}</div>
                          </td>
                          <td>
                            <div style={{ fontSize: 13 }}>{med.famille}</div>
                            <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{med.forme}</div>
                          </td>
                          <td>
                            <span style={{ fontWeight: 600, color: isLow ? 'var(--warning-700)' : med.stock_actuel <= 0 ? 'var(--danger-700)' : 'var(--neutral-900)' }}>
                              {med.stock_actuel}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--neutral-400)', marginLeft: 4 }}>/ min {med.stock_minimum}</span>
                          </td>
                          <td style={{ fontWeight: 600 }}>{formatCDF(med.prix_unitaire)}</td>
                          <td>
                            <span className={`badge ${med.statut === 'disponible' ? 'badge-success' : med.statut === 'rupture' ? 'badge-danger' : med.statut === 'expiré' ? 'badge-neutral' : 'badge-warning'}`}>
                              {med.statut}
                            </span>
                          </td>
                          <td>
                            <Link href={`/pharmacie/${med.id}/edit`} className="btn btn-ghost btn-sm" style={{ padding: '6px 12px' }}>
                              Éditer
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                {medicaments.filter(m => (search === '' || m.nom_commercial.toLowerCase().includes(search.toLowerCase()) || m.code.toLowerCase().includes(search.toLowerCase())) && (filterStatut === 'tous' || m.statut === filterStatut)).map((med, index) => {
                  const stockPercent = Math.min(100, (med.stock_actuel / (med.stock_minimum * 3)) * 100);
                  const isLow = med.stock_actuel <= med.stock_minimum;
                  return (
                    <div key={med.id} className="card animate-slide-up" style={{ animationDelay: `${index * 0.05}s` }}>
                      <div className="card-body">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                          <div>
                            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--neutral-900)', marginBottom: 2 }}>{med.nom_commercial}</h3>
                            <p style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{med.nom_generique} · {med.forme} · {med.dosage}</p>
                          </div>
                          <span className={`badge ${med.statut === 'disponible' ? 'badge-success' : med.statut === 'rupture' ? 'badge-danger' : med.statut === 'expiré' ? 'badge-neutral' : 'badge-warning'}`}>{med.statut}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 16, marginBottom: 14, fontSize: 12 }}>
                          <div><span style={{ color: 'var(--neutral-400)' }}>Famille:</span> <span style={{ fontWeight: 600 }}>{med.famille}</span></div>
                          <div><span style={{ color: 'var(--neutral-400)' }}>Code:</span> <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{med.code}</span></div>
                        </div>
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                            <span style={{ color: 'var(--neutral-500)' }}>
                              <Package size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                              Stock: <strong style={{ color: isLow ? 'var(--danger)' : 'var(--neutral-800)' }}>{med.stock_actuel}</strong> / min. {med.stock_minimum}
                            </span>
                            <span style={{ fontWeight: 700, color: 'var(--neutral-700)' }}>{formatCDF(med.prix_unitaire)}</span>
                          </div>
                          <div style={{ height: 6, borderRadius: 10, background: 'var(--neutral-200)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${stockPercent}%`, borderRadius: 10, background: isLow ? 'linear-gradient(90deg, var(--danger), #f97316)' : 'linear-gradient(90deg, var(--accent-500), var(--primary-500))', transition: 'width 0.5s ease' }} />
                          </div>
                        </div>
                        {med.date_peremption && (
                          <div style={{ fontSize: 11, color: med.statut === 'expiré' ? 'var(--danger-600)' : 'var(--neutral-400)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                            <Calendar size={12} /> Expire le {new Date(med.date_peremption).toLocaleDateString('fr-FR')}
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--neutral-100)', paddingTop: 12 }}>
                          <Link href={`/pharmacie/${med.id}/edit`} className="btn btn-ghost btn-sm" style={{ color: 'var(--primary-600)' }}>
                            Mettre à jour
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
