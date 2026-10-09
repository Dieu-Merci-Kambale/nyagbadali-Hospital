'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2, BedDouble } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';
import { useAuth } from '@/contexts/AuthContext';
import PatientSearch from '@/components/ui/PatientSearch';
import MedicalAlerts from '@/components/patients/MedicalAlerts';
import { explainDbError } from '@/lib/format';

function NouvelleAdmissionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientIdParam = searchParams.get('patient_id');
  const motifParam = searchParams.get('motif');
  const { confirm } = useConfirm();
  const { profile } = useAuth();

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [medecins, setMedecins] = useState<any[]>([]);
  const [litsDisponibles, setLitsDisponibles] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [hospitalisationActive, setHospitalisationActive] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      const [{ data: mData }, { data: lData }] = await Promise.all([
        supabase.from('personnel').select('id, nom, prenom').in('role', ['medecin', 'medecin_chef']).eq('statut', 'actif').order('nom'),
        supabase.from('lits').select('*, chambres(numero, etage, type)').eq('statut', 'disponible').order('numero'),
      ]);
      setMedecins(mData || []);
      setLitsDisponibles(lData || []);
    }
    fetchData();
  }, []);

  // Un patient ne peut avoir qu'une hospitalisation active
  useEffect(() => {
    if (!selectedPatientId) {
      setHospitalisationActive(null);
      return;
    }
    supabase
      .from('hospitalisations')
      .select('id')
      .eq('patient_id', selectedPatientId)
      .eq('statut', 'actif')
      .limit(1)
      .then(({ data }) => setHospitalisationActive(data?.[0]?.id || null));
  }, [selectedPatientId]);

  const isMedecin = profile?.role === 'medecin' || profile?.role === 'medecin_chef';
  const [medecinId, setMedecinId] = useState(isMedecin ? profile?.id || '' : '');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    if (!selectedPatientId) {
      setErrorMsg('Veuillez sélectionner un patient.');
      return;
    }
    if (hospitalisationActive) {
      setErrorMsg('Ce patient est déjà hospitalisé. Clôturez son séjour actuel avant une nouvelle admission.');
      return;
    }
    const litId = formData.get('lit_id') as string;
    if (!litId) {
      setErrorMsg('Veuillez assigner un lit disponible.');
      return;
    }

    const isConfirmed = await confirm({
      title: 'Admettre le patient',
      message: "Confirmez-vous l'admission de ce patient et l'assignation de ce lit ?",
      confirmText: 'Oui, admettre',
      type: 'info',
    });
    if (!isConfirmed) return;

    setSaving(true);
    setErrorMsg('');

    // Le lit a pu être pris entre-temps par un autre poste
    const { data: lit } = await supabase.from('lits').select('statut').eq('id', litId).single();
    if (lit?.statut !== 'disponible') {
      setErrorMsg("Ce lit vient d'être attribué à un autre patient. Veuillez en choisir un autre.");
      setLitsDisponibles((prev) => prev.filter((l) => l.id !== litId));
      setSaving(false);
      return;
    }

    const data = {
      patient_id: selectedPatientId,
      medecin_responsable_id: (formData.get('medecin_responsable_id') as string) || null,
      lit_id: litId,
      motif_admission: formData.get('motif_admission') as string,
      type_admission: formData.get('type_admission') as string,
      diagnostic_entree: (formData.get('diagnostic_entree') as string) || null,
      date_admission: new Date().toISOString(),
      statut: 'actif',
    };

    const { data: inserted, error: hospError } = await supabase.from('hospitalisations').insert([data]).select('id').single();
    if (hospError) {
      console.error(hospError);
      setErrorMsg(explainDbError(hospError));
      setSaving(false);
      return;
    }

    const { error: litError } = await supabase.from('lits').update({ statut: 'occupé' }).eq('id', litId);
    if (litError) {
      toast.error("Admission enregistrée, mais le statut du lit n'a pas pu être mis à jour.");
    } else {
      toast.success('Patient admis.');
    }
    router.push(`/hospitalisation/${inserted.id}`);
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.back()} className="btn btn-ghost" title="Retour">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">Nouvelle admission</h1>
            <p className="page-subtitle">Enregistrer l&apos;hospitalisation d&apos;un patient</p>
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
          <div className="card-header"><span className="card-title">1. Patient à admettre</span></div>
          <div className="card-body">
            <PatientSearch value={selectedPatientId} onChange={(id) => setSelectedPatientId(id)} initialPatientId={patientIdParam} />
            {hospitalisationActive && (
              <div className="alert alert-warning" style={{ marginBottom: 12 }}>
                <AlertCircle size={18} /> Ce patient est déjà hospitalisé.
                <Link href={`/hospitalisation/${hospitalisationActive}`} style={{ marginLeft: 'auto', fontWeight: 600 }}>Voir le séjour →</Link>
              </div>
            )}
            {selectedPatientId && <MedicalAlerts key={selectedPatientId} patientId={selectedPatientId} />}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">2. Détails médicaux</span></div>
          <div className="card-body">
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Type d&apos;admission *</label>
                <select name="type_admission" className="form-select" required>
                  <option value="programmée">Programmée (prévue)</option>
                  <option value="urgence">Urgence</option>
                  <option value="transfert">Transfert d&apos;un autre hôpital</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Médecin responsable</label>
                <select name="medecin_responsable_id" className="form-select" value={medecinId} onChange={(e) => setMedecinId(e.target.value)}>
                  <option value="">Sélectionner un médecin</option>
                  {medecins.map((m) => (
                    <option key={m.id} value={m.id}>Dr. {m.prenom} {m.nom}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Motif de l&apos;admission *</label>
              <textarea name="motif_admission" className="form-textarea" rows={3} required defaultValue={motifParam || ''} placeholder="Raison principale de l'hospitalisation..."></textarea>
            </div>

            <div className="form-group">
              <label className="form-label">Diagnostic d&apos;entrée (optionnel)</label>
              <input type="text" name="diagnostic_entree" className="form-input" placeholder="Ex : Pneumonie sévère, paludisme grave..." />
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title">3. Assignation du lit</span>
            <span className="badge badge-success">{litsDisponibles.length} lit(s) disponible(s)</span>
          </div>
          <div className="card-body">
            {litsDisponibles.length === 0 ? (
              <div className="alert alert-warning">
                <AlertCircle size={18} /> Aucun lit n&apos;est actuellement disponible. Libérez un lit avant d&apos;admettre un nouveau patient.
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Choisir un lit disponible *</label>
                <select name="lit_id" className="form-select" required style={{ padding: 12, height: 'auto' }}>
                  <option value="">Sélectionnez un lit...</option>
                  {litsDisponibles.map((lit) => (
                    <option key={lit.id} value={lit.id}>
                      Chambre {lit.chambres?.numero} ({lit.chambres?.type}) - Lit {lit.numero} ({String(lit.type_lit || '').replace('_', ' ')})
                    </option>
                  ))}
                </select>
                <p className="form-help" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  <BedDouble size={14} /> Le statut du lit passera automatiquement à « Occupé ».
                </p>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" onClick={() => router.back()} className="btn btn-outline">Annuler</button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving || litsDisponibles.length === 0 || !!hospitalisationActive}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Admettre le patient
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NouvelleAdmissionPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>}>
      <NouvelleAdmissionForm />
    </Suspense>
  );
}
