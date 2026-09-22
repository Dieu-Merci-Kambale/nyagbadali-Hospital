'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';

export default function NouvelleChambrePage() {
  const router = useRouter();
  const { confirm } = useConfirm();
  
  const [departements, setDepartements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function fetchData() {
      const { data } = await supabase.from('departements').select('id, nom').eq('statut', 'actif').order('nom');
      setDepartements(data || []);
      setLoading(false);
    }
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;

    const isConfirmed = await confirm({
      title: 'Créer la chambre',
      message: 'Voulez-vous vraiment enregistrer cette nouvelle chambre ?',
      confirmText: 'Oui, créer',
      type: 'info'
    });

    if (!isConfirmed) return;

    setSaving(true);
    setErrorMsg('');
    const formData = new FormData(form);

    const data = {
      numero: formData.get('numero') as string,
      etage: formData.get('etage') as string,
      type: formData.get('type') as string,
      capacite: parseInt(formData.get('capacite') as string, 10),
      departement_id: formData.get('departement_id') as string,
    };

    try {
      const { data: result, error } = await supabase.from('chambres').insert([data]).select().single();

      if (error) {
        throw error;
      }
      
      router.push(`/chambres/${result.id}/edit`);
    } catch (err: any) {
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

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.back()} className="btn btn-ghost" title="Retour">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">Nouvelle Chambre</h1>
            <p className="page-subtitle">Ajouter une chambre à l'hébergement hospitalier</p>
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
                <label className="form-label">Numéro de la chambre *</label>
                <input type="text" name="numero" className="form-input" required placeholder="Ex: 101, A204..." />
              </div>
              <div className="form-group">
                <label className="form-label">Département *</label>
                <select name="departement_id" className="form-select" required>
                  <option value="">-- Choisir un département --</option>
                  {departements.map(d => (
                    <option key={d.id} value={d.id}>{d.nom}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Étage *</label>
                <input type="text" name="etage" className="form-input" required placeholder="Ex: Rez-de-chaussée, 1er..." />
              </div>
              <div className="form-group">
                <label className="form-label">Type de chambre *</label>
                <select name="type" className="form-select" required>
                  <option value="individuelle">Individuelle</option>
                  <option value="double">Double</option>
                  <option value="commune">Commune</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Capacité (Nombre maximal de lits) *</label>
                <input type="number" name="capacite" className="form-input" min="1" required defaultValue={1} />
              </div>
            </div>

          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" onClick={() => router.back()} className="btn btn-outline" disabled={saving}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Enregistrer la chambre
          </button>
        </div>
      </form>
    </div>
  );
}
