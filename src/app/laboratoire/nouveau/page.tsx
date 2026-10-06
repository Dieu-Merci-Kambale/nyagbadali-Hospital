'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';
import { useAuth } from '@/contexts/AuthContext';

export default function NouvelleAnalysePage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { confirm } = useConfirm();

  const [saving, setSaving] = useState(false);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [patients, setPatients] = useState<any[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState('');

  useEffect(() => {
    let ignore = false;

    async function fetchPatients() {
      if (patientSearch.trim().length < 2) {
        if (!ignore) setPatients([]);
        return;
      }

      if (!ignore) setSearchingPatients(true);
      const { data } = await supabase
        .from('patients')
        .select('id, nom, prenom, code_patient')
        .or(`nom.ilike.%${patientSearch.trim()}%,prenom.ilike.%${patientSearch.trim()}%,code_patient.ilike.%${patientSearch.trim()}%`)
        .limit(8)
        .order('nom');

      if (!ignore) {
        setPatients(data || []);
        setSearchingPatients(false);
      }
    }

    fetchPatients();
    return () => { ignore = true; };
  }, [patientSearch]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setErrorMsg('');

    if (!profile) {
      setErrorMsg('Erreur: Utilisateur non identifié.');
      return;
    }

    if (!selectedPatientId) {
      setErrorMsg('Veuillez sélectionner un patient.');
      return;
    }

    const isConfirmed = await confirm({
      title: 'Enregistrer le résultat',
      message: 'Voulez-vous vraiment enregistrer ce résultat de laboratoire ?',
      confirmText: 'Oui, enregistrer',
      type: 'info',
    });

    if (!isConfirmed) return;

    setSaving(true);

    const data = {
      patient_id: selectedPatientId,
      medecin_prescripteur_id: formData.get('prescripteur') === 'self' ? profile.id : null,
      type_analyse: formData.get('type_analyse') as string,
      description: (formData.get('description') as string) || null,
      statut: 'demandé',
    };

    try {
      const { error } = await supabase.from('analyses_laboratoire').insert([data]);

      if (error) throw error;

      router.push('/laboratoire');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Une erreur inattendue est survenue.');
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.back()} className="btn btn-ghost" title="Retour">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">Nouvelle Demande d'Analyse</h1>
            <p className="page-subtitle">Prescription d'examen de laboratoire</p>
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
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Patient *</label>
              <input
                type="text"
                className="form-input"
                placeholder="Tapez au moins 2 lettres pour rechercher..."
                value={patientSearch}
                onChange={(e) => {
                  setPatientSearch(e.target.value);
                  setSelectedPatientId('');
                }}
              />

              {patientSearch.trim().length >= 2 && (
                <div style={{ marginTop: 10, border: '1px solid var(--neutral-200)', borderRadius: 8, overflow: 'hidden' }}>
                  {searchingPatients ? (
                    <div style={{ padding: 12, textAlign: 'center', color: 'var(--neutral-500)' }}>Recherche en cours...</div>
                  ) : patients.length > 0 ? (
                    patients.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedPatientId(p.id);
                          setPatientSearch(`${p.prenom} ${p.nom} (${p.code_patient})`);
                        }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid var(--neutral-100)', background: selectedPatientId === p.id ? 'var(--primary-50)' : 'white', cursor: 'pointer' }}
                      >
                        {p.prenom} {p.nom} ({p.code_patient})
                      </button>
                    ))
                  ) : (
                    <div style={{ padding: 12, textAlign: 'center', color: 'var(--neutral-500)' }}>Aucun patient trouvé</div>
                  )}
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Type d'analyse *</label>
              <select name="type_analyse" className="form-select" required>
                <option value="">-- Choisir le type --</option>
                <option value="Hémogramme complet (NFS)">Hémogramme complet (NFS)</option>
                <option value="Glycémie">Glycémie à jeun</option>
                <option value="Bilan lipidique">Bilan lipidique</option>
                <option value="Bilan hépatique">Bilan hépatique</option>
                <option value="Bilan rénal">Bilan rénal</option>
                <option value="Test de Grossesse">Test de Grossesse</option>
                <option value="Test Paludisme (Goutte épaisse)">Test Paludisme (Goutte épaisse)</option>
                <option value="Autre">Autre</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Détails et instructions</label>
              <textarea name="description" className="form-textarea" rows={3} placeholder="Précisions pour le laboratoire..."></textarea>
            </div>

            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" name="prescripteur" value="self" id="prescripteur" defaultChecked />
              <label htmlFor="prescripteur">Je suis le médecin prescripteur</label>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" onClick={() => router.back()} className="btn btn-outline">Annuler</button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Soumettre la demande
          </button>
        </div>
      </form>
    </div>
  );
}
