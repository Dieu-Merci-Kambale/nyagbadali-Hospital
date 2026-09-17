'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';

export default function EditConsultationPage() {
  const router = useRouter();
  const { id } = useParams();
  const { profile } = useAuth();
  const { confirm } = useConfirm();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [consultation, setConsultation] = useState<any>(null);

  useEffect(() => {
    async function fetchDetails() {
      if (!id) return;
      const { data, error } = await supabase
        .from('consultations')
        .select(`
          *,
          patients (id, nom, prenom, code_patient)
        `)
        .eq('id', id)
        .single();
        
      if (data) {
        setConsultation(data);
      }
      setLoading(false);
    }
    fetchDetails();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const isConfirmed = await confirm({
      title: 'Modifier la consultation',
      message: 'Confirmez-vous la mise à jour de ce dossier de consultation ?',
      confirmText: 'Oui, modifier',
      type: 'info'
    });

    if (!isConfirmed) return;

    setSaving(true);
    
    if (!profile) {
      toast.error("Médecin non identifié. Veuillez vous reconnecter.");
      setSaving(false);
      return;
    }

    const formData = new FormData(e.currentTarget);
    
    const constantes = {
      poids: formData.get('poids') as string,
      temperature: formData.get('temperature') as string,
      tension: formData.get('tension') as string,
    };

    const dataToUpdate = {
      motif: formData.get('motif') as string,
      diagnostic_principal: (formData.get('diagnostic_principal') as string) || null,
      notes_privees: (formData.get('notes') as string) || null,
      constantes: constantes,
      statut: formData.get('statut') as string,
    };

    const { error } = await supabase
      .from('consultations')
      .update(dataToUpdate)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error(error);
      toast.error(`Erreur de mise à jour: ${error.message}`);
      setSaving(false);
    } else {
      toast.success("Consultation mise à jour avec succès !");
      router.refresh();
      router.push(`/consultations/${id}`);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Loader2 size={24} className="animate-spin text-primary-500" />
      </div>
    );
  }

  if (!consultation) {
    return (
      <div className="empty-state">
        <AlertCircle size={24} className="text-danger-500" />
        <h3>Consultation introuvable</h3>
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
            <h1 className="page-title">Modifier la Consultation</h1>
            <p className="page-subtitle">Patient : {consultation.patients?.prenom} {consultation.patients?.nom}</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">Constantes Vitales</span></div>
          <div className="card-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Poids (kg)</label>
                <input type="text" name="poids" defaultValue={consultation.constantes?.poids || ''} className="form-input" />
              </div>
              <div className="form-group">
                <label className="form-label">Température (°C)</label>
                <input type="text" name="temperature" defaultValue={consultation.constantes?.temperature || ''} className="form-input" />
              </div>
              <div className="form-group">
                <label className="form-label">Tension artérielle</label>
                <input type="text" name="tension" defaultValue={consultation.constantes?.tension || ''} className="form-input" />
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">Évaluation Clinique</span></div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Motif de consultation *</label>
              <input type="text" name="motif" defaultValue={consultation.motif} className="form-input" required />
            </div>
            
            <div className="form-group">
              <label className="form-label">Diagnostic principal</label>
              <input type="text" name="diagnostic_principal" defaultValue={consultation.diagnostic_principal || ''} className="form-input" />
            </div>
            
            <div className="form-group">
              <label className="form-label">Notes cliniques et traitement prescrit</label>
              <textarea name="notes" defaultValue={consultation.notes_privees || ''} className="form-textarea" rows={6}></textarea>
            </div>

            <div className="form-group">
              <label className="form-label">Statut de la consultation</label>
              <select name="statut" className="form-select" defaultValue={consultation.statut}>
                <option value="en_cours">En cours (En attente d'examens)</option>
                <option value="terminée">Terminée</option>
                <option value="annulée">Annulée</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" onClick={() => router.back()} className="btn btn-outline">Annuler</button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Enregistrer les modifications
          </button>
        </div>
      </form>
    </div>
  );
}
