'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';
import { useAuth } from '@/contexts/AuthContext';

export default function EditAnalysePage() {
  const router = useRouter();
  const { id } = useParams();
  const { profile } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [analyse, setAnalyse] = useState<any>(null);
  const [resultat, setResultat] = useState<any>(null);
  const { confirm } = useConfirm();

  useEffect(() => {
    async function fetchData() {
      if (!id) return;
      const { data, error } = await supabase
        .from('analyses_laboratoire')
        .select(`
          *,
          patients(nom, prenom, code_patient)
        `)
        .eq('id', id)
        .single();
        
      if (error) {
        setErrorMsg('Analyse introuvable.');
      } else {
        setAnalyse(data);
      }
      setLoading(false);
    }
    fetchData();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const formData = new FormData(e.currentTarget);
    const dataForm = Object.fromEntries(formData.entries());

    const isConfirmed = await confirm({
      title: 'Modifier le résultat',
      message: 'Confirmez-vous la mise à jour de ce résultat de laboratoire ?',
      confirmText: 'Oui, modifier',
      type: 'info'
    });

    if (!isConfirmed) return;

    setSaving(true);
    setErrorMsg('');
    
    if (!profile) {
      setErrorMsg("Erreur: Utilisateur non identifié.");
      setSaving(false);
      return;
    }

    // formData is already declared at the top of the function
    const statut = formData.get('statut') as string;
    
    const data: any = {
      statut,
      observations: formData.get('observations') as string || null,
    };

    if (statut === 'en_cours' && !analyse.date_prelevement) {
      data.date_prelevement = new Date().toISOString();
      data.technicien_id = profile.id;
    }

    if (statut === 'terminé') {
      data.date_resultat = analyse.date_resultat || new Date().toISOString();
      
      // Parse des résultats JSON si nécessaire, ici on les stocke en texte libre dans resultats pour simplicité,
      // ou on peut utiliser un champ texte si on a changé d'avis. Le modèle de BDD a resultats JSONB.
      // On va encapsuler le texte dans un JSON simple.
      const resultText = formData.get('resultats') as string;
      if (resultText) {
        data.resultats = { texte: resultText };
      }
    }

    try {
      const { error } = await supabase.from('analyses_laboratoire').update(data).eq('id', id);

      if (error) {
        throw error;
      }
      router.push('/laboratoire');
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

  if (!analyse) {
    return (
      <div className="empty-state">
        <AlertCircle style={{ color: 'var(--danger)' }} />
        <h3>Erreur</h3>
        <p>{errorMsg}</p>
        <button className="btn btn-outline" onClick={() => router.push('/laboratoire')}>Retour</button>
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
            <h1 className="page-title">Résultats d'Analyse</h1>
            <p className="page-subtitle">Patient : {analyse.patients?.prenom} {analyse.patients?.nom}</p>
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
          <div className="card-header"><span className="card-title">{analyse.type_analyse}</span></div>
          <div className="card-body">
            <div style={{ marginBottom: 16 }}>
              <strong>Description / Instructions : </strong>
              <p>{analyse.description || 'Aucune'}</p>
            </div>

            <div className="form-group">
              <label className="form-label">Statut *</label>
              <select name="statut" className="form-select" defaultValue={analyse.statut} required>
                <option value="demandé">Demandé</option>
                <option value="en_cours">Prélèvement fait / En cours</option>
                <option value="terminé">Terminé / Résultats disponibles</option>
                <option value="annulé">Annulé</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Résultats de l'analyse</label>
              <textarea 
                name="resultats" 
                className="form-textarea" 
                rows={6} 
                defaultValue={analyse.resultats?.texte || ''} 
                placeholder="Valeurs, conclusions, etc."
              ></textarea>
            </div>

            <div className="form-group">
              <label className="form-label">Observations / Notes du technicien</label>
              <textarea 
                name="observations" 
                className="form-textarea" 
                rows={2} 
                defaultValue={analyse.observations || ''}
              ></textarea>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" onClick={() => router.back()} className="btn btn-outline">Annuler</button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Mettre à jour le dossier
          </button>
        </div>
      </form>
    </div>
  );
}
