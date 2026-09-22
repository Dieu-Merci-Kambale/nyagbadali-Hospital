'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';

export default function EditRdvPage() {
  const router = useRouter();
  const { id } = useParams();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [rdv, setRdv] = useState<any>(null);
  const [medecins, setMedecins] = useState<any[]>([]);
  const { confirm } = useConfirm();

  useEffect(() => {
    async function fetchData() {
      if (!id) return;
      
      const { data: rdvData, error } = await supabase
        .from('rendez_vous')
        .select(`
          *,
          patients(nom, prenom)
        `)
        .eq('id', id)
        .single();
        
      if (error) {
        setErrorMsg('Rendez-vous introuvable.');
        setLoading(false);
        return;
      }
      
      // Format datetime-local requires YYYY-MM-DDThh:mm
      if (rdvData.date_heure) {
        const d = new Date(rdvData.date_heure);
        // adjust for local timezone to display in input correctly
        const offset = d.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(d.getTime() - offset)).toISOString().slice(0, 16);
        rdvData.date_heure_local = localISOTime;
      }
      
      setRdv(rdvData);

      const { data: mData } = await supabase
        .from('personnel')
        .select('id, nom, prenom, specialite')
        .like('role', '%medecin%')
        .order('nom');
      if (mData) setMedecins(mData);

      setLoading(false);
    }
    fetchData();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const isConfirmed = await confirm({
      title: 'Modifier le rendez-vous',
      message: 'Confirmez-vous la modification de ce rendez-vous ?',
      confirmText: 'Oui, modifier',
      type: 'info'
    });

    if (!isConfirmed) return;

    setSaving(true);
    setErrorMsg('');
    
    try {
    
    const data = {
      medecin_id: formData.get('medecin_id') as string,
      date_heure: new Date(formData.get('date_heure') as string).toISOString(),
      motif: formData.get('motif') as string,
      statut: formData.get('statut') as string,
    };

    const { error } = await supabase.from('rendez_vous').update(data).eq('id', id);

    if (error) {
      throw error;
    }
    
    router.push('/rendez-vous');
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

  if (!rdv) {
    return (
      <div className="empty-state">
        <AlertCircle style={{ color: 'var(--danger)' }} />
        <h3>Erreur</h3>
        <p>{errorMsg}</p>
        <button className="btn btn-outline" onClick={() => router.push('/rendez-vous')}>Retour</button>
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
            <h1 className="page-title">Modifier Rendez-vous</h1>
            <p className="page-subtitle">Patient : {rdv.patients?.prenom} {rdv.patients?.nom}</p>
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
              <label className="form-label">Médecin *</label>
              <select name="medecin_id" className="form-select" defaultValue={rdv.medecin_id} required>
                <option value="">-- Choisir un médecin --</option>
                {medecins.map(m => (
                  <option key={m.id} value={m.id}>Dr. {m.nom} {m.prenom} - {m.specialite}</option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Date et Heure *</label>
                <input type="datetime-local" name="date_heure" className="form-input" defaultValue={rdv.date_heure_local} required />
              </div>
              <div className="form-group">
                <label className="form-label">Statut *</label>
                <select name="statut" className="form-select" defaultValue={rdv.statut} required>
                  <option value="planifié">Planifié</option>
                  <option value="complété">Complété</option>
                  <option value="annulé">Annulé</option>
                  <option value="reporté">Reporté</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Motif du rendez-vous *</label>
              <input type="text" name="motif" className="form-input" defaultValue={rdv.motif} required />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" onClick={() => router.back()} className="btn btn-outline">Annuler</button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Mettre à jour
          </button>
        </div>
      </form>
    </div>
  );
}
