'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2, Pill, Search, Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';
import type { Medicament } from '@/types';

export default function NouvellePrescriptionPage() {
  const router = useRouter();
  const { id: consultation_id } = useParams();
  const { confirm } = useConfirm();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [medicaments, setMedicaments] = useState<Medicament[]>([]);
  const [selectedMedicamentId, setSelectedMedicamentId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [customNomMedicament, setCustomNomMedicament] = useState('');
  const [dosage, setDosage] = useState('');
  
  // Fetch medicaments from inventory
  useEffect(() => {
    async function fetchMedicaments() {
      const { data, error } = await supabase
        .from('medicaments')
        .select('*')
        .order('nom_commercial', { ascending: true });
        
      if (!error && data) {
        setMedicaments(data as Medicament[]);
      }
      setLoading(false);
    }
    fetchMedicaments();
  }, []);

  const filteredMedicaments = medicaments.filter(m => {
    const q = searchQuery.toLowerCase();
    return (m.nom_commercial || '').toLowerCase().includes(q) ||
           (m.nom_generique || '').toLowerCase().includes(q) ||
           (m.code || '').toLowerCase().includes(q) ||
           (m.dosage || '').toLowerCase().includes(q);
  });

  const handleSelectMedicament = (med: Medicament) => {
    setSelectedMedicamentId(med.id);
    setSearchQuery(`${med.nom_commercial}${med.dosage ? ` (${med.dosage})` : ''}`);
    setCustomNomMedicament(med.nom_commercial);
    setDosage(med.dosage || '');
    setIsDropdownOpen(false);
  };

  const handleClearMedicament = () => {
    setSelectedMedicamentId('');
    setSearchQuery('');
    setCustomNomMedicament('');
    setDosage('');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const formData = new FormData(e.currentTarget);
    
    const nom_med = customNomMedicament.trim();
    if (!nom_med) {
      setErrorMsg("Veuillez sélectionner ou saisir le nom d'un médicament.");
      return;
    }

    const isConfirmed = await confirm({
      title: 'Ajouter la prescription',
      message: `Voulez-vous prescrire ${nom_med} pour cette consultation ? Cette prescription sera envoyée directement à la pharmacie.`,
      confirmText: 'Oui, prescrire',
      type: 'info'
    });

    if (!isConfirmed) return;

    setSaving(true);
    setErrorMsg('');
    
    const dataToInsert = {
      consultation_id,
      medicament_id: selectedMedicamentId || null,
      nom_medicament: nom_med,
      dosage: formData.get('dosage') as string,
      voie_administration: formData.get('voie_administration') as string,
      frequence: formData.get('frequence') as string,
      duree: formData.get('duree') as string,
      instructions: (formData.get('instructions') as string) || null,
      statut: 'active'
    };

    try {
      const { error } = await supabase.from('prescriptions').insert([dataToInsert]);

      if (error) {
        throw error;
      }
      router.push(`/consultations/${consultation_id}`);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Une erreur inattendue est survenue.');
      setSaving(false);
    }
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
            <h1 className="page-title">Nouvelle Prescription</h1>
            <p className="page-subtitle">Ajouter un médicament à l'ordonnance</p>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <AlertCircle size={18} /> {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ maxWidth: 800 }}>
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">Détails du médicament</span></div>
          <div className="card-body">
            
            <div className="form-group" style={{ position: 'relative' }}>
              <label className="form-label">Rechercher dans l'inventaire (Optionnel)</label>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--neutral-400)' }} />
                <input
                  type="text"
                  className="form-input"
                  style={{ paddingLeft: 36, paddingRight: 36 }}
                  placeholder="Nom commercial, générique, code ou dosage..."
                  value={searchQuery}
                  onFocus={() => setIsDropdownOpen(true)}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSelectedMedicamentId('');
                    setIsDropdownOpen(true);
                  }}
                  onBlur={() => {
                    // Timeout pour permettre au clic sur l'option de s'enregistrer
                    setTimeout(() => setIsDropdownOpen(false), 200);
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={handleClearMedicament}
                    title="Effacer (saisie libre)"
                    style={{ position: 'absolute', right: 8, top: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--neutral-400)', padding: 2 }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {isDropdownOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 10,
                  border: '1px solid var(--neutral-200)',
                  borderRadius: 8,
                  marginTop: 4,
                  maxHeight: 240,
                  overflowY: 'auto',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  backgroundColor: 'white'
                }}>
                  {filteredMedicaments.length > 0 ? (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {filteredMedicaments.map(med => {
                        const isLow = med.stock_actuel <= med.stock_minimum;
                        const isRupture = med.stock_actuel === 0;
                        return (
                          <li
                            key={med.id}
                            style={{
                              padding: '10px 16px',
                              cursor: isRupture ? 'not-allowed' : 'pointer',
                              opacity: isRupture ? 0.5 : 1,
                              borderBottom: '1px solid var(--neutral-100)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              backgroundColor: selectedMedicamentId === med.id ? 'var(--primary-50)' : 'transparent'
                            }}
                            onMouseDown={(e) => {
                              if (isRupture) {
                                e.preventDefault();
                                return;
                              }
                              handleSelectMedicament(med);
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 500 }}>
                                {med.nom_commercial} {med.dosage ? `(${med.dosage})` : ''}
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>
                                {med.nom_generique ? `${med.nom_generique} • ` : ''}Stock: {med.stock_actuel}
                                {isRupture ? (
                                  <span style={{ color: 'var(--danger-600, #dc2626)', fontWeight: 500 }}> (Rupture)</span>
                                ) : isLow ? (
                                  <span style={{ color: 'var(--warning-600, #d97706)', fontWeight: 500 }}> (Faible)</span>
                                ) : null}
                              </div>
                            </div>
                            {selectedMedicamentId === med.id && <Check size={16} className="text-primary-600" />}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--neutral-500)' }}>
                      Aucun médicament trouvé. Saisissez le nom manuellement ci-dessous.
                    </div>
                  )}
                </div>
              )}
              <p style={{ fontSize: 12, color: 'var(--neutral-500)', marginTop: 4 }}>
                Sélectionnez un médicament de la base de données pour faciliter la délivrance par la pharmacie. Les médicaments en rupture sont grisés. Laissez vide pour une saisie libre (médicament hors stock).
              </p>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Nom du médicament prescrit *</label>
                <div style={{ position: 'relative' }}>
                  <Pill size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--neutral-400)' }} />
                  <input 
                    type="text" 
                    className="form-input" 
                    value={customNomMedicament}
                    onChange={(e) => setCustomNomMedicament(e.target.value)}
                    style={{ paddingLeft: 36 }}
                    required 
                    placeholder="Ex: Paracétamol" 
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Dosage</label>
                <input 
                  type="text" 
                  name="dosage" 
                  className="form-input" 
                  value={dosage}
                  onChange={(e) => setDosage(e.target.value)}
                  placeholder="Ex: 500mg, 1 cuillère..." 
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Voie d'administration *</label>
                <select name="voie_administration" className="form-select" required defaultValue="orale">
                  <option value="orale">Orale (Comprimés, Sirop...)</option>
                  <option value="iv">Intraveineuse (IV)</option>
                  <option value="im">Intramusculaire (IM)</option>
                  <option value="sc">Sous-cutanée (SC)</option>
                  <option value="rectale">Rectale (Suppositoire)</option>
                  <option value="topique">Topique (Pommade, Crème)</option>
                  <option value="inhalation">Inhalation</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">Posologie (Rythme et Durée)</span></div>
          <div className="card-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Fréquence *</label>
                <input type="text" name="frequence" className="form-input" required placeholder="Ex: 3 fois par jour, Toutes les 8h..." />
              </div>
              <div className="form-group">
                <label className="form-label">Durée du traitement *</label>
                <input type="text" name="duree" className="form-input" required placeholder="Ex: 5 jours, 1 mois..." />
              </div>
            </div>
            
            <div className="form-group">
              <label className="form-label">Instructions spéciales (Optionnel)</label>
              <textarea name="instructions" className="form-textarea" rows={3} placeholder="Ex: Prendre au cours des repas..."></textarea>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" onClick={() => router.back()} className="btn btn-outline">Annuler</button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Ajouter à l'ordonnance
          </button>
        </div>
      </form>
    </div>
  );
}
