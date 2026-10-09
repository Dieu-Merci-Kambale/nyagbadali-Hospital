'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';
import { findRdvConflict } from '@/lib/rdv';
import { RDV_STATUTS, RDV_TYPES, formatTime, toDateTimeLocal, explainDbError } from '@/lib/format';

export default function EditRdvPage() {
  const router = useRouter();
  const { id } = useParams();
  const { confirm } = useConfirm();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [rdv, setRdv] = useState<any>(null);
  const [medecins, setMedecins] = useState<any[]>([]);

  const [medecinId, setMedecinId] = useState('');
  const [dateHeure, setDateHeure] = useState('');
  const [duree, setDuree] = useState(30);
  const [conflict, setConflict] = useState('');

  useEffect(() => {
    async function fetchData() {
      if (!id) return;
      const { data: rdvData, error } = await supabase
        .from('rendez_vous')
        .select('*, patients(nom, prenom, code_patient)')
        .eq('id', id)
        .single();

      if (error || !rdvData) {
        setErrorMsg('Rendez-vous introuvable.');
        setLoading(false);
        return;
      }
      setRdv(rdvData);
      setMedecinId(rdvData.medecin_id);
      setDateHeure(toDateTimeLocal(rdvData.date_heure));
      setDuree(rdvData.duree_minutes || 30);

      const { data: mData } = await supabase
        .from('personnel')
        .select('id, nom, prenom, specialite')
        .in('role', ['medecin', 'medecin_chef'])
        .order('nom');
      setMedecins(mData || []);
      setLoading(false);
    }
    fetchData();
  }, [id]);

  useEffect(() => {
    if (!medecinId || !dateHeure || !id) return;
    let ignore = false;
    const timer = setTimeout(async () => {
      const c = await findRdvConflict(medecinId, new Date(dateHeure), duree, id as string);
      if (!ignore) {
        setConflict(c ? `Ce médecin a déjà un rendez-vous à ${formatTime(c.date_heure)} (${c.patients?.prenom || ''} ${c.patients?.nom || ''}).` : '');
      }
    }, 300);
    return () => { ignore = true; clearTimeout(timer); };
  }, [medecinId, dateHeure, duree, id]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const isConfirmed = await confirm({
      title: 'Modifier le rendez-vous',
      message: conflict ? `${conflict} Enregistrer malgré tout ?` : 'Confirmez-vous la modification de ce rendez-vous ?',
      confirmText: 'Oui, modifier',
      type: conflict ? 'warning' : 'info',
    });
    if (!isConfirmed) return;

    setSaving(true);
    setErrorMsg('');

    const data = {
      medecin_id: medecinId,
      date_heure: new Date(dateHeure).toISOString(),
      duree_minutes: duree,
      type: formData.get('type') as string,
      motif: formData.get('motif') as string,
      notes: (formData.get('notes') as string) || null,
      statut: formData.get('statut') as string,
    };

    const { error } = await supabase.from('rendez_vous').update(data).eq('id', id);
    if (error) {
      console.error(error);
      setErrorMsg(explainDbError(error));
      setSaving(false);
      return;
    }
    toast.success('Rendez-vous mis à jour.');
    router.push('/rendez-vous');
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
            <h1 className="page-title">Modifier le rendez-vous</h1>
            <p className="page-subtitle">Patient : {rdv.patients?.prenom} {rdv.patients?.nom} ({rdv.patients?.code_patient})</p>
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
              <select className="form-select" value={medecinId} onChange={(e) => setMedecinId(e.target.value)} required>
                <option value="">-- Choisir un médecin --</option>
                {medecins.map((m) => (
                  <option key={m.id} value={m.id}>Dr. {m.prenom} {m.nom}{m.specialite ? ` — ${m.specialite}` : ''}</option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Date et heure *</label>
                <input type="datetime-local" className="form-input" value={dateHeure} onChange={(e) => setDateHeure(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Durée</label>
                <select className="form-select" value={duree} onChange={(e) => setDuree(Number(e.target.value))}>
                  {[15, 20, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} minutes</option>)}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Type *</label>
                <select name="type" className="form-select" defaultValue={rdv.type || 'consultation'} required>
                  {Object.entries(RDV_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Statut *</label>
                <select name="statut" className="form-select" defaultValue={rdv.statut} required>
                  {Object.entries(RDV_STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
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
              <input type="text" name="motif" className="form-input" defaultValue={rdv.motif} required />
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea name="notes" className="form-textarea" rows={2} defaultValue={rdv.notes || ''}></textarea>
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
