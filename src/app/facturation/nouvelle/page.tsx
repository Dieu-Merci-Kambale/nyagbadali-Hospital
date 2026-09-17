'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2, Plus, Trash2, Search, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import { useConfirm } from '@/context/ConfirmContext';

export default function NouvelleFacturePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientIdParam = searchParams.get('patient_id');
  const { confirm } = useConfirm();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Patient Search State
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState(patientIdParam || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Lignes Facture State
  const [lignes, setLignes] = useState([{ id: Date.now().toString(), description: '', quantite: 1, prix_unitaire: 0 }]);

  useEffect(() => {
    async function fetchPatients() {
      const { data } = await supabase
        .from('patients')
        .select('id, nom, prenom, code_patient')
        .order('nom');
      
      if (data) {
        setPatients(data);
        if (patientIdParam) {
          const p = data.find(p => p.id === patientIdParam);
          if (p) setSearchQuery(`${p.prenom} ${p.nom} (${p.code_patient})`);
        }
      }
      setLoading(false);
    }
    fetchPatients();
  }, [patientIdParam]);

  const filteredPatients = patients.filter(p => {
    const q = searchQuery.toLowerCase();
    return p.nom.toLowerCase().includes(q) || 
           p.prenom.toLowerCase().includes(q) || 
           p.code_patient.toLowerCase().includes(q);
  });

  const addLigne = () => {
    setLignes([...lignes, { id: Date.now().toString(), description: '', quantite: 1, prix_unitaire: 0 }]);
  };

  const removeLigne = (idToRemove: string) => {
    if (lignes.length > 1) {
      setLignes(lignes.filter(l => l.id !== idToRemove));
    }
  };

  const updateLigne = (id: string, field: string, value: any) => {
    setLignes(lignes.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const totalGlobal = lignes.reduce((acc, l) => acc + (l.quantite * l.prix_unitaire), 0);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!selectedPatientId) {
      setErrorMsg("Veuillez sélectionner un patient.");
      return;
    }

    if (totalGlobal === 0) {
      setErrorMsg("Le montant total de la facture ne peut pas être zéro.");
      return;
    }

    const isConfirmed = await confirm({
      title: 'Créer la facture',
      message: `Êtes-vous sûr de vouloir générer cette facture d'un montant de ${totalGlobal} FC ?`,
      confirmText: 'Oui, créer',
      type: 'info'
    });

    if (!isConfirmed) return;

    setSaving(true);
    setErrorMsg('');

    // 1. Créer la facture principale
    const factureData = {
      numero_facture: `FAC-${Date.now().toString().slice(-6)}`,
      patient_id: selectedPatientId,
      montant_total: totalGlobal,
      montant_assurance: 0,
      montant_patient: totalGlobal,
      tva: 0,
      statut: 'en_attente', // Toujours en attente à la création
      date_facture: new Date().toISOString().split('T')[0],
    };

    const { error: factureError, data: facture } = await supabase
      .from('factures')
      .insert([factureData])
      .select()
      .single();

    if (factureError) {
      console.error(factureError);
      setErrorMsg(`Erreur de création de la facture: ${factureError.message}`);
      setSaving(false);
      return;
    }

    // 2. Créer les lignes de facture
    if (facture) {
      const lignesToInsert = lignes.filter(l => l.description.trim() !== '').map(l => ({
        facture_id: facture.id,
        description: l.description,
        quantite: l.quantite,
        prix_unitaire: l.prix_unitaire,
        montant: l.quantite * l.prix_unitaire,
        couvert_assurance: false
      }));

      if (lignesToInsert.length > 0) {
        const { error: ligneError } = await supabase.from('lignes_facture').insert(lignesToInsert);
        if (ligneError) {
          console.error(ligneError);
          toast.error("Erreur lors de l'ajout des lignes de facture.");
        }
      }
    }

    toast.success("Facture créée avec succès !");
    // On redirige vers la vue détaillée de la facture pour gérer le paiement
    router.push(`/facturation/${facture.id}/edit`);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Loader2 size={24} className="animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.back()} className="btn btn-ghost" title="Retour">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">Nouvelle Facture</h1>
            <p className="page-subtitle">Création et émission d'une facture détaillée</p>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <AlertCircle size={18} /> {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">Informations Générales</span></div>
          <div className="card-body">
            
            <div className="form-group" style={{ position: 'relative', maxWidth: 600 }}>
              <label className="form-label">Rechercher le patient (Nom, Prénom ou ID) *</label>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--neutral-400)' }} />
                <input 
                  type="text" 
                  className="form-input" 
                  style={{ paddingLeft: 36 }}
                  placeholder="Tapez pour rechercher..." 
                  value={searchQuery}
                  onFocus={() => setIsDropdownOpen(true)}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSelectedPatientId('');
                    setIsDropdownOpen(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => setIsDropdownOpen(false), 200);
                  }}
                  required={!selectedPatientId}
                />
              </div>
              
              {isDropdownOpen && (
                <div style={{ 
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, 
                  background: 'white', border: '1px solid var(--neutral-200)', borderRadius: 8, 
                  marginTop: 4, maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}>
                  {filteredPatients.length > 0 ? (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {filteredPatients.map(p => (
                        <li 
                          key={p.id}
                          style={{ 
                            padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid var(--neutral-100)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            backgroundColor: selectedPatientId === p.id ? 'var(--primary-50)' : 'transparent'
                          }}
                          onMouseDown={() => {
                            setSelectedPatientId(p.id);
                            setSearchQuery(`${p.prenom} ${p.nom} (${p.code_patient})`);
                            setIsDropdownOpen(false);
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 500 }}>{p.prenom} {p.nom}</div>
                            <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>ID: {p.code_patient}</div>
                          </div>
                          {selectedPatientId === p.id && <Check size={16} className="text-primary-600" />}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--neutral-500)' }}>Aucun patient trouvé.</div>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="card-title">Détails des actes & prestations</span>
            <button type="button" onClick={addLigne} className="btn btn-outline btn-sm">
              <Plus size={16} /> Ajouter une ligne
            </button>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="data-table" style={{ margin: 0, border: 'none' }}>
              <thead style={{ background: 'var(--neutral-50)' }}>
                <tr>
                  <th style={{ width: '45%' }}>Description</th>
                  <th style={{ width: '15%' }}>Quantité</th>
                  <th style={{ width: '20%' }}>Prix Unitaire (FC)</th>
                  <th style={{ width: '15%' }}>Montant (FC)</th>
                  <th style={{ width: '5%', textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((ligne, index) => (
                  <tr key={ligne.id}>
                    <td>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="Ex: Consultation, Echographie..." 
                        value={ligne.description}
                        onChange={(e) => updateLigne(ligne.id, 'description', e.target.value)}
                        required
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        className="form-input" 
                        min="1"
                        value={ligne.quantite}
                        onChange={(e) => updateLigne(ligne.id, 'quantite', parseInt(e.target.value) || 1)}
                        required
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        className="form-input" 
                        min="0"
                        step="50"
                        value={ligne.prix_unitaire}
                        onChange={(e) => updateLigne(ligne.id, 'prix_unitaire', parseFloat(e.target.value) || 0)}
                        required
                      />
                    </td>
                    <td style={{ fontWeight: 600, verticalAlign: 'middle' }}>
                      {ligne.quantite * ligne.prix_unitaire} FC
                    </td>
                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      <button 
                        type="button" 
                        className="btn btn-ghost" 
                        style={{ color: 'var(--danger)', padding: 4 }}
                        onClick={() => removeLigne(ligne.id)}
                        disabled={lignes.length === 1}
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ padding: '20px 24px', background: 'var(--neutral-50)', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--neutral-200)' }}>
              <div style={{ width: 300 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14 }}>
                  <span style={{ color: 'var(--neutral-600)' }}>Sous-total</span>
                  <span>{totalGlobal} FC</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontSize: 14 }}>
                  <span style={{ color: 'var(--neutral-600)' }}>TVA (0%)</span>
                  <span>0 FC</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 16, borderTop: '1px solid var(--neutral-200)', fontSize: 18, fontWeight: 700 }}>
                  <span>Total Général</span>
                  <span style={{ color: 'var(--primary-600)' }}>{totalGlobal} FC</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" onClick={() => router.back()} className="btn btn-outline">Annuler</button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Créer et procéder au paiement
          </button>
        </div>
      </form>
    </div>
  );
}
