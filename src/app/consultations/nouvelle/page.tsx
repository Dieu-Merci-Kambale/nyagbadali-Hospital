'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2, Search, Check } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';

export default function NouvelleConsultationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientIdParam = searchParams.get('patient_id');
  const { profile } = useAuth();
  const { confirm } = useConfirm();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState(patientIdParam || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!profile) {
      toast.error("Médecin non identifié. Veuillez vous reconnecter.");
      return;
    }

    if (!selectedPatientId) {
      setErrorMsg('Veuillez sélectionner un patient.');
      return;
    }

    const isConfirmed = await confirm({
      title: 'Enregistrer la consultation',
      message: 'Confirmez-vous la création de cette nouvelle consultation ?',
      confirmText: 'Oui, enregistrer',
      type: 'info'
    });

    if (!isConfirmed) return;

    setSaving(true);
    setErrorMsg('');

    const formData = new FormData(e.currentTarget);
    
    // Construire le JSON des constantes
    const constantes = {
      poids: formData.get('poids') as string,
      temperature: formData.get('temperature') as string,
      tension: formData.get('tension') as string,
    };

    const data = {
      patient_id: selectedPatientId,
      medecin_id: profile.id, // Le médecin connecté
      motif: formData.get('motif') as string,
      diagnostic_principal: (formData.get('diagnostic_principal') as string) || null,
      notes_privees: (formData.get('notes') as string) || null,
      constantes: constantes,
      statut: formData.get('statut') as string || 'terminée',
      date_consultation: new Date().toISOString()
    };

    try {
      const { error, data: inserted } = await supabase
        .from('consultations')
        .insert([data])
        .select('id')
        .single();

      if (error) throw error;
      
      toast.success("Consultation enregistrée avec succès !");
      router.push(`/consultations/${inserted.id}`);
    } catch (err: any) {
      console.error(err);
      toast.error(`Erreur d'enregistrement: ${err.message || 'Erreur inattendue'}`);
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
            <h1 className="page-title">Nouvelle Consultation</h1>
            <p className="page-subtitle">Saisie du dossier clinique</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">Patient</span></div>
          <div className="card-body">
            <div className="form-group" style={{ position: 'relative' }}>
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
                    // Timeout pour permettre au clic sur l'option de s'enregistrer
                    setTimeout(() => setIsDropdownOpen(false), 200);
                  }}
                  required={!selectedPatientId}
                />
              </div>
              
              {isDropdownOpen && (
                <div style={{ 
                  position: 'absolute', 
                  top: '100%', 
                  left: 0, 
                  right: 0, 
                  zIndex: 10, 
                  background: '#white', 
                  border: '1px solid var(--neutral-200)', 
                  borderRadius: 8, 
                  marginTop: 4, 
                  maxHeight: 200, 
                  overflowY: 'auto',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  backgroundColor: 'white'
                }}>
                  {filteredPatients.length > 0 ? (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {filteredPatients.map(p => (
                        <li 
                          key={p.id}
                          style={{ 
                            padding: '10px 16px', 
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--neutral-100)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
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
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--neutral-500)' }}>
                      Aucun patient trouvé.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">Constantes Vitales</span></div>
          <div className="card-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Poids (kg)</label>
                <input type="text" name="poids" className="form-input" placeholder="Ex: 75" />
              </div>
              <div className="form-group">
                <label className="form-label">Température (°C)</label>
                <input type="text" name="temperature" className="form-input" placeholder="Ex: 37.5" />
              </div>
              <div className="form-group">
                <label className="form-label">Tension artérielle</label>
                <input type="text" name="tension" className="form-input" placeholder="Ex: 120/80" />
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">Évaluation Clinique</span></div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Motif de consultation *</label>
              <input type="text" name="motif" className="form-input" required placeholder="Symptôme principal..." />
            </div>
            
            <div className="form-group">
              <label className="form-label">Diagnostic principal</label>
              <input type="text" name="diagnostic_principal" className="form-input" placeholder="Maladie ou affection diagnostiquée" />
            </div>
            
            <div className="form-group">
              <label className="form-label">Notes cliniques et traitement prescrit</label>
              <textarea name="notes" className="form-textarea" rows={6} placeholder="Examen physique, histoire de la maladie, prescriptions..."></textarea>
            </div>

            <div className="form-group">
              <label className="form-label">Statut de la consultation</label>
              <select name="statut" className="form-select" defaultValue="terminée">
                <option value="en_cours">En cours (En attente d'examens)</option>
                <option value="terminée">Terminée</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" onClick={() => router.back()} className="btn btn-outline">Annuler</button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Enregistrer
          </button>
        </div>
      </form>
    </div>
  );
}
