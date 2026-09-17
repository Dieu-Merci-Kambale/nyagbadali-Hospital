'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2, Pill } from 'lucide-react';
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

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedMedicamentId(val);
    
    if (val) {
      const med = medicaments.find(m => m.id === val);
      if (med) {
        setCustomNomMedicament(med.nom_commercial);
        setDosage(med.dosage || '');
      }
    } else {
      setCustomNomMedicament('');
      setDosage('');
    }
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

    const { error } = await supabase.from('prescriptions').insert([dataToInsert]);

    if (error) {
      console.error(error);
      setErrorMsg(error.message);
      setSaving(false);
    } else {
      router.push(`/consultations/${consultation_id}`);
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
            
            <div className="form-group">
              <label className="form-label">Sélectionner dans l'inventaire (Optionnel)</label>
              <select className="form-select" value={selectedMedicamentId} onChange={handleSelectChange}>
                <option value="">-- Saisie libre (Médicament hors stock) --</option>
                {medicaments.map(med => {
                  const isLow = med.stock_actuel <= med.stock_minimum;
                  const isRupture = med.stock_actuel === 0;
                  return (
                    <option key={med.id} value={med.id} disabled={isRupture}>
                      {med.nom_commercial} {med.dosage ? `(${med.dosage})` : ''} - Stock: {med.stock_actuel} {isRupture ? '(Rupture)' : isLow ? '(Faible)' : ''}
                    </option>
                  );
                })}
              </select>
              <p style={{ fontSize: 12, color: 'var(--neutral-500)', marginTop: 4 }}>
                Sélectionnez un médicament de la base de données pour faciliter la délivrance par la pharmacie. Les médicaments en rupture sont grisés.
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
