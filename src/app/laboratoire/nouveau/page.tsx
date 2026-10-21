'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2, Check, Siren, Inbox } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';
import { useAuth } from '@/contexts/AuthContext';
import PatientSearch from '@/components/ui/PatientSearch';
import { fetchExamensLabo, grouperParFamille } from '@/lib/lab-catalogue';
import { explainDbError, formatMoney } from '@/lib/format';
import type { ActeTarif } from '@/types';

function NouvelleAnalyseForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientIdParam = searchParams.get('patient_id');
  const consultationIdParam = searchParams.get('consultation_id');
  const { profile } = useAuth();
  const { confirm } = useConfirm();

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [urgent, setUrgent] = useState(false);
  // Examens enregistrés au catalogue par l'administration (seuls examens demandables)
  const [catalogue, setCatalogue] = useState<ActeTarif[]>([]);
  const [loadingCatalogue, setLoadingCatalogue] = useState(true);

  const isMedecin = profile?.role === 'medecin' || profile?.role === 'medecin_chef';

  useEffect(() => {
    fetchExamensLabo().then(({ examens, error }) => {
      if (error) setErrorMsg(explainDbError(error));
      setCatalogue(examens);
      setLoadingCatalogue(false);
    });
  }, []);

  const totalSelection = catalogue.filter((e) => selected.includes(e.libelle)).reduce((s, e) => s + Number(e.prix || 0), 0);

  const toggle = (nom: string) => {
    setSelected((prev) => (prev.includes(nom) ? prev.filter((n) => n !== nom) : [...prev, nom]));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setErrorMsg('');

    if (!profile) {
      setErrorMsg('Utilisateur non identifié. Veuillez vous reconnecter.');
      return;
    }
    if (!selectedPatientId) {
      setErrorMsg('Veuillez sélectionner un patient.');
      return;
    }

    const examens = selected;
    if (examens.length === 0) {
      setErrorMsg('Veuillez choisir au moins un examen.');
      return;
    }

    const isConfirmed = await confirm({
      title: 'Envoyer la demande au laboratoire',
      message: `${examens.length} examen${examens.length > 1 ? 's' : ''} ${examens.length > 1 ? 'seront demandés' : 'sera demandé'}${urgent ? ' en URGENCE' : ''} : ${examens.join(', ')}.`,
      confirmText: 'Oui, envoyer',
      type: urgent ? 'warning' : 'info',
    });
    if (!isConfirmed) return;

    setSaving(true);
    const prescripteurSelf = formData.get('prescripteur') === 'self';
    const description = (formData.get('description') as string) || null;

    // Une seule demande (bon) regroupant tous les examens, créée en une transaction
    const { data: demandeId, error } = await supabase.rpc('creer_demande_laboratoire', {
      p_patient_id: selectedPatientId,
      p_examens: examens,
      p_consultation_id: consultationIdParam || null,
      p_renseignements: description,
      p_urgent: urgent,
      p_prescripteur_moi: prescripteurSelf,
    });
    if (error) {
      console.error(error);
      setErrorMsg(explainDbError(error));
      setSaving(false);
      return;
    }

    toast.success(`Demande de ${examens.length} examen${examens.length > 1 ? 's' : ''} transmise au laboratoire.`);
    router.push(`/laboratoire/demande/${demandeId}`);
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.back()} className="btn btn-ghost" title="Retour">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">Nouvelle demande d&apos;analyses</h1>
            <p className="page-subtitle">Prescription d&apos;examens de laboratoire</p>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <AlertCircle size={18} /> {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ maxWidth: 900 }}>
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">Patient</span></div>
          <div className="card-body">
            <PatientSearch
              value={selectedPatientId}
              onChange={(id) => setSelectedPatientId(id)}
              initialPatientId={patientIdParam}
            />
            {consultationIdParam && (
              <p className="form-help">La demande sera rattachée à la consultation en cours.</p>
            )}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">Examens demandés</span>
            {selected.length > 0 && (
              <span className="badge badge-info">
                {selected.length} sélectionné{selected.length > 1 ? 's' : ''} — {formatMoney(totalSelection)}
              </span>
            )}
          </div>
          <div className="card-body">
            {loadingCatalogue ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Loader2 size={20} className="animate-spin" /></div>
            ) : catalogue.length === 0 ? (
              <div className="empty-state">
                <Inbox className="empty-state-icon" />
                <h3>Aucun examen au catalogue</h3>
                <p>Les examens et leurs prix sont enregistrés par l&apos;administration dans Laboratoire › Catalogue des examens.</p>
              </div>
            ) : grouperParFamille(catalogue).map(({ famille, examens }) => (
              <div key={famille} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--neutral-400)', marginBottom: 8 }}>{famille}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
                  {examens.map((ex) => {
                    const active = selected.includes(ex.libelle);
                    return (
                      <button
                        key={ex.id}
                        type="button"
                        onClick={() => toggle(ex.libelle)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                          padding: '10px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                          border: `1.5px solid ${active ? 'var(--primary-500)' : 'var(--neutral-200)'}`,
                          background: active ? 'var(--primary-50)' : 'white',
                          color: 'var(--neutral-800)', fontWeight: active ? 600 : 500,
                        }}
                      >
                        <span style={{
                          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                          border: `1.5px solid ${active ? 'var(--primary-500)' : 'var(--neutral-300)'}`,
                          background: active ? 'var(--primary-500)' : 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {active && <Check size={12} color="white" />}
                        </span>
                        <span style={{ flex: 1 }}>{ex.libelle}</span>
                        <span style={{ fontSize: 12, color: 'var(--neutral-500)', fontWeight: 500, whiteSpace: 'nowrap' }}>{formatMoney(ex.prix)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">Renseignements cliniques</span></div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Contexte et instructions pour le laboratoire</label>
              <textarea name="description" className="form-textarea" rows={3} placeholder="Ex : Fièvre depuis 4 jours, suspicion de paludisme. Prélèvement à jeun."></textarea>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${urgent ? 'var(--danger)' : 'var(--neutral-200)'}`, background: urgent ? 'var(--danger-50)' : 'white', cursor: 'pointer', marginBottom: 12 }}>
              <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
              <Siren size={16} style={{ color: 'var(--danger)' }} />
              <span style={{ fontWeight: 600, color: urgent ? 'var(--danger-600)' : 'var(--neutral-700)' }}>Demande urgente</span>
              <span style={{ fontSize: 12, color: 'var(--neutral-500)' }}>— traitée en priorité par le laboratoire</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input type="checkbox" name="prescripteur" value="self" defaultChecked={isMedecin} />
              Je suis le médecin prescripteur
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" onClick={() => router.back()} className="btn btn-outline">Annuler</button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Envoyer au laboratoire
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NouvelleAnalysePage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>}>
      <NouvelleAnalyseForm />
    </Suspense>
  );
}
