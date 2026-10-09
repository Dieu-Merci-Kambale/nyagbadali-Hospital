'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';
import PatientSearch from '@/components/ui/PatientSearch';
import { findRdvConflict } from '@/lib/rdv';
import { RDV_TYPES, formatTime, toDateTimeLocal, explainDbError } from '@/lib/format';

function NouveauRdvForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientIdParam = searchParams.get('patient_id');
  const typeParam = searchParams.get('type');
  const motifParam = searchParams.get('motif');
  const { confirm } = useConfirm();

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [medecins, setMedecins] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [medecinId, setMedecinId] = useState('');
  const [dateHeure, setDateHeure] = useState('');
  const [duree, setDuree] = useState(30);
  const [conflict, setConflict] = useState<string>('');

  useEffect(() => {
    supabase
      .from('personnel')
      .select('id, nom, prenom, specialite')
      .in('role', ['medecin', 'medecin_chef'])
      .eq('statut', 'actif')
      .order('nom')
      .then(({ data }) => setMedecins(data || []));
  }, []);

  // Vérification du créneau en direct
  useEffect(() => {
    if (!medecinId || !dateHeure) {
      setConflict('');
      return;
    }
    let ignore = false;
    const timer = setTimeout(async () => {
      const c = await findRdvConflict(medecinId, new Date(dateHeure), duree);
      if (!ignore) {
        setConflict(c ? `Ce médecin a déjà un rendez-vous à ${formatTime(c.date_heure)} (${c.patients?.prenom || ''} ${c.patients?.nom || ''}, ${c.duree_minutes || 30} min).` : '');
      }
    }, 300);
    return () => { ignore = true; clearTimeout(timer); };
  }, [medecinId, dateHeure, duree]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    if (!selectedPatientId || !medecinId) {
      setErrorMsg('Veuillez sélectionner un patient et un médecin.');
      return;
    }
    if (new Date(dateHeure).getTime() < Date.now() - 5 * 60000) {
      setErrorMsg('La date du rendez-vous est déjà passée.');
      return;
    }

    const isConfirmed = await confirm({
      title: conflict ? 'Créneau déjà occupé' : 'Planifier le rendez-vous',
      message: conflict ? `${conflict} Voulez-vous quand même programmer ce rendez-vous ?` : 'Voulez-vous vraiment programmer ce rendez-vous ?',
      confirmText: 'Oui, programmer',
      type: conflict ? 'warning' : 'info',
    });
    if (!isConfirmed) return;

    setSaving(true);
    setErrorMsg('');

    const data = {
      patient_id: selectedPatientId,
      medecin_id: medecinId,
      date_heure: new Date(dateHeure).toISOString(),
      duree_minutes: duree,
      type: formData.get('type') as string,
      motif: formData.get('motif') as string,
      notes: (formData.get('notes') as string) || null,
      statut: 'planifié',
    };

    const { error } = await supabase.from('rendez_vous').insert([data]);
    if (error) {
      console.error(error);
      setErrorMsg(explainDbError(error));
      setSaving(false);
      return;
    }
    toast.success('Rendez-vous programmé.');
    router.push('/rendez-vous');
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.back()} className="btn btn-ghost" title="Retour">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">Nouveau rendez-vous</h1>
            <p className="page-subtitle">Planification d&apos;une consultation, d&apos;un suivi ou d&apos;un examen</p>
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
          <div className="card-header"><span className="card-title">Patient & praticien</span></div>
          <div className="card-body">
            <PatientSearch value={selectedPatientId} onChange={(id) => setSelectedPatientId(id)} initialPatientId={patientIdParam} />

            <div className="form-group">
              <label className="form-label">Médecin *</label>
              <select className="form-select" value={medecinId} onChange={(e) => setMedecinId(e.target.value)} required>
                <option value="">-- Choisir un médecin --</option>
                {medecins.map((m) => (
                  <option key={m.id} value={m.id}>Dr. {m.prenom} {m.nom}{m.specialite ? ` — ${m.specialite}` : ''}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">Créneau</span></div>
          <div className="card-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Date et heure *</label>
                <input
                  type="datetime-local"
                  className="form-input"
                  required
                  min={toDateTimeLocal(new Date())}
                  value={dateHeure}
                  onChange={(e) => setDateHeure(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Durée</label>
                <select className="form-select" value={duree} onChange={(e) => setDuree(Number(e.target.value))}>
                  {[15, 20, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} minutes</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Type *</label>
                <select name="type" className="form-select" defaultValue={typeParam && RDV_TYPES[typeParam] ? typeParam : 'consultation'} required>
                  {Object.entries(RDV_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>

            {conflict && (
              <div className="alert alert-warning" style={{ marginBottom: 16 }}>
                <AlertTriangle size={18} /> {conflict}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Motif du rendez-vous *</label>
              <input type="text" name="motif" className="form-input" required defaultValue={motifParam || ''} placeholder="Ex : Consultation générale, suivi de grossesse, contrôle post-opératoire..." />
            </div>
            <div className="form-group">
              <label className="form-label">Notes (optionnel)</label>
              <textarea name="notes" className="form-textarea" rows={2} placeholder="Ex : Apporter les résultats d'analyses, venir à jeun..."></textarea>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" onClick={() => router.back()} className="btn btn-outline">Annuler</button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Enregistrer le rendez-vous
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NouveauRdvPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>}>
      <NouveauRdvForm />
    </Suspense>
  );
}
