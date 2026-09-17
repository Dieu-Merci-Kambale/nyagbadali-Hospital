'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';

export default function EditPersonnelPage() {
  const router = useRouter();
  const { id } = useParams();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [personnel, setPersonnel] = useState<any>(null);
  const [departements, setDepartements] = useState<any[]>([]);
  const { confirm } = useConfirm();

  useEffect(() => {
    async function fetchData() {
      if (!id) return;
      
      const { data: pData, error } = await supabase
        .from('personnel')
        .select('*')
        .eq('id', id)
        .single();
        
      if (error) {
        setErrorMsg('Membre du personnel introuvable.');
        setLoading(false);
        return;
      }
      
      setPersonnel(pData);

      const { data: dData } = await supabase
        .from('departements')
        .select('id, nom')
        .order('nom');
        
      if (dData) setDepartements(dData);

      setLoading(false);
    }
    fetchData();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const isConfirmed = await confirm({
      title: 'Modifier le profil',
      message: 'Confirmez-vous la mise à jour des informations de ce membre du personnel ?',
      confirmText: 'Oui, modifier',
      type: 'info'
    });

    if (!isConfirmed) return;

    setSaving(true);
    setErrorMsg('');
    
    const formData = new FormData(e.currentTarget);
    
    const data = {
      nom: formData.get('nom') as string,
      prenom: formData.get('prenom') as string,
      email: formData.get('email') as string,
      telephone: formData.get('telephone') as string,
      role: formData.get('role') as string,
      specialite: formData.get('specialite') as string || null,
      departement_id: formData.get('departement_id') as string || null,
    };

    const { error } = await supabase.from('personnel').update(data).eq('id', id);

    if (error) {
      console.error(error);
      setErrorMsg(error.message);
      setSaving(false);
    } else {
      router.push('/personnel');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Loader2 size={24} className="animate-spin text-primary-500" />
      </div>
    );
  }

  if (!personnel) {
    return (
      <div className="empty-state">
        <AlertCircle style={{ color: 'var(--danger)' }} />
        <h3>Erreur</h3>
        <p>{errorMsg}</p>
        <button className="btn btn-outline" onClick={() => router.push('/personnel')}>Retour</button>
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
            <h1 className="page-title">Modifier Personnel</h1>
            <p className="page-subtitle">{personnel.prenom} {personnel.nom}</p>
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
            
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Nom *</label>
                <input type="text" name="nom" className="form-input" required defaultValue={personnel.nom} />
              </div>
              <div className="form-group">
                <label className="form-label">Prénom *</label>
                <input type="text" name="prenom" className="form-input" required defaultValue={personnel.prenom} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Email (Connexion) *</label>
                <input type="email" name="email" className="form-input" required defaultValue={personnel.email} />
              </div>
              <div className="form-group">
                <label className="form-label">Téléphone</label>
                <input type="tel" name="telephone" className="form-input" defaultValue={personnel.telephone || ''} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Rôle d'accès *</label>
                <select name="role" className="form-select" required defaultValue={personnel.role}>
                  <option value="medecin">Médecin</option>
                  <option value="infirmier">Infirmier(e)</option>
                  <option value="receptionniste">Réceptionniste</option>
                  <option value="pharmacien">Pharmacien(ne)</option>
                  <option value="laborantin">Laborantin</option>
                  <option value="admin">Administrateur</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Spécialité (si médical)</label>
                <select name="specialite" className="form-select" defaultValue={personnel.specialite || ''}>
                  <option value="">-- Aucune / Non applicable --</option>
                  <option value="Généraliste">Généraliste</option>
                  <option value="Pédiatre">Pédiatre</option>
                  <option value="Gynécologue">Gynécologue</option>
                  <option value="Chirurgien">Chirurgien</option>
                  <option value="Cardiologue">Cardiologue</option>
                  <option value="Ophtalmologue">Ophtalmologue</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Département</label>
              <select name="departement_id" className="form-select" defaultValue={personnel.departement_id || ''}>
                <option value="">-- Aucun département --</option>
                {departements.map(d => (
                  <option key={d.id} value={d.id}>{d.nom}</option>
                ))}
              </select>
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
