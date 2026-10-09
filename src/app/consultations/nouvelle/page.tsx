'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Save, Loader2, CalendarCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import PatientSearch from '@/components/ui/PatientSearch';
import MedicalAlerts from '@/components/patients/MedicalAlerts';
import ClinicalFields, { readClinicalForm } from '@/components/consultations/ClinicalFields';
import { explainDbError } from '@/lib/format';

function NouvelleConsultationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientIdParam = searchParams.get('patient_id');
  const rdvIdParam = searchParams.get('rdv_id');
  const { profile } = useAuth();
  const { confirm } = useConfirm();

  const [saving, setSaving] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    if (!profile) {
      toast.error('Médecin non identifié. Veuillez vous reconnecter.');
      return;
    }
    if (!selectedPatientId) {
      toast.error('Veuillez sélectionner un patient.');
      return;
    }

    const isConfirmed = await confirm({
      title: 'Enregistrer la consultation',
      message: 'Confirmez-vous la création de cette nouvelle consultation ?',
      confirmText: 'Oui, enregistrer',
      type: 'info',
    });
    if (!isConfirmed) return;

    setSaving(true);

    const data = {
      patient_id: selectedPatientId,
      medecin_id: profile.id,
      rdv_id: rdvIdParam || null,
      departement_id: profile.departement_id || null,
      date_consultation: new Date().toISOString(),
      ...readClinicalForm(formData),
    };

    const { error, data: inserted } = await supabase
      .from('consultations')
      .insert([data])
      .select('id')
      .single();

    if (error) {
      console.error(error);
      toast.error(`Erreur d'enregistrement : ${explainDbError(error)}`);
      setSaving(false);
      return;
    }

    // Le rendez-vous à l'origine de la consultation est clôturé
    if (rdvIdParam) {
      await supabase.from('rendez_vous').update({ statut: 'terminé' }).eq('id', rdvIdParam);
    }

    toast.success('Consultation enregistrée avec succès !');
    router.push(`/consultations/${inserted.id}`);
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.back()} className="btn btn-ghost" title="Retour">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">Nouvelle consultation</h1>
            <p className="page-subtitle">Saisie du dossier clinique</p>
          </div>
        </div>
        {rdvIdParam && (
          <span className="badge badge-info" style={{ padding: '6px 12px' }}><CalendarCheck size={14} /> Issue d&apos;un rendez-vous</span>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">Patient</span></div>
          <div className="card-body">
            <PatientSearch
              label="Rechercher le patient (nom, prénom ou ID)"
              value={selectedPatientId}
              onChange={(id) => setSelectedPatientId(id)}
              initialPatientId={patientIdParam}
            />
            {selectedPatientId && <MedicalAlerts key={selectedPatientId} patientId={selectedPatientId} />}
          </div>
        </div>

        <ClinicalFields />

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

export default function NouvelleConsultationPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>}>
      <NouvelleConsultationForm />
    </Suspense>
  );
}
