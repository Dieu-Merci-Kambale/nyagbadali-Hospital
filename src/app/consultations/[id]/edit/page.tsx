'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import MedicalAlerts from '@/components/patients/MedicalAlerts';
import ClinicalFields, { readClinicalForm } from '@/components/consultations/ClinicalFields';
import { explainDbError } from '@/lib/format';

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
      const { data } = await supabase
        .from('consultations')
        .select('*, patients (id, nom, prenom, code_patient)')
        .eq('id', id)
        .single();
      if (data) setConsultation(data);
      setLoading(false);
    }
    fetchDetails();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    if (!profile) {
      toast.error('Médecin non identifié. Veuillez vous reconnecter.');
      return;
    }

    const isConfirmed = await confirm({
      title: 'Modifier la consultation',
      message: 'Confirmez-vous la mise à jour de ce dossier de consultation ?',
      confirmText: 'Oui, modifier',
      type: 'info',
    });
    if (!isConfirmed) return;

    setSaving(true);
    const { error } = await supabase
      .from('consultations')
      .update(readClinicalForm(formData))
      .eq('id', id);

    if (error) {
      console.error(error);
      toast.error(`Erreur de mise à jour : ${explainDbError(error)}`);
      setSaving(false);
      return;
    }
    toast.success('Consultation mise à jour avec succès !');
    router.push(`/consultations/${id}`);
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
            <h1 className="page-title">Modifier la consultation</h1>
            <p className="page-subtitle">Patient : {consultation.patients?.prenom} {consultation.patients?.nom} ({consultation.patients?.code_patient})</p>
          </div>
        </div>
      </div>

      <MedicalAlerts patientId={consultation.patient_id} />

      <form onSubmit={handleSubmit}>
        <ClinicalFields defaults={consultation} allowCancel />

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
