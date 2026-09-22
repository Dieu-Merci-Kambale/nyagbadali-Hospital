'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';

export default function EditChambrePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { id } = resolvedParams;
  const router = useRouter();
  const { confirm } = useConfirm();
  
  const [departements, setDepartements] = useState<any[]>([]);
  const [chambre, setChambre] = useState<any>(null);
  const [lits, setLits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Pour l'ajout d'un nouveau lit
  const [nouveauLitNumero, setNouveauLitNumero] = useState('');
  const [nouveauLitType, setNouveauLitType] = useState('standard');
  const [ajoutantLit, setAjoutantLit] = useState(false);

  useEffect(() => {
    async function fetchData() {
      // Départements
      const { data: deps } = await supabase.from('departements').select('id, nom').eq('statut', 'actif').order('nom');
      setDepartements(deps || []);

      // Chambre & Lits
      const { data: chambreData, error: chambreError } = await supabase
        .from('chambres')
        .select('*')
        .eq('id', id)
        .single();
        
      if (chambreError) {
        setErrorMsg('Chambre introuvable.');
      } else {
        setChambre(chambreData);
        fetchLits();
      }
      setLoading(false);
    }
    fetchData();
  }, [id]);

  async function fetchLits() {
    const { data: litsData } = await supabase
      .from('lits')
      .select('*')
      .eq('chambre_id', id)
      .order('numero', { ascending: true });
    setLits(litsData || []);
  }

  const handleUpdateChambre = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;

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
      const { error } = await supabase.from('chambres').update(data).eq('id', id);

      if (error) {
        throw error;
      }
      router.push('/chambres');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Une erreur inattendue est survenue.');
      setSaving(false);
    }
  };

  const handleAjouterLit = async () => {
    if (!nouveauLitNumero) {
      setErrorMsg('Veuillez entrer un numéro/nom pour le lit.');
      return;
    }
    if (lits.length >= chambre.capacite) {
      setErrorMsg(`Capacité maximale (${chambre.capacite} lits) atteinte pour cette chambre.`);
      return;
    }
    
    setAjoutantLit(true);
    setErrorMsg('');
    
    const data = {
      numero: nouveauLitNumero,
      chambre_id: id,
      type_lit: nouveauLitType,
      statut: 'disponible'
    };
    
    const { error } = await supabase.from('lits').insert([data]);
    
    if (error) {
      setErrorMsg(error.message);
    } else {
      setNouveauLitNumero('');
      fetchLits();
    }
    setAjoutantLit(false);
  };

  const handleChangeStatutLit = async (litId: string, nouveauStatut: string) => {
    const { error } = await supabase.from('lits').update({ statut: nouveauStatut }).eq('id', litId);
    if (!error) {
      fetchLits();
    }
  };

  const handleSupprimerLit = async (litId: string, statut: string) => {
    if (statut === 'occupé') {
      setErrorMsg('Impossible de supprimer un lit occupé.');
      return;
    }

    const isConfirmed = await confirm({
      title: 'Supprimer le lit',
      message: 'Voulez-vous vraiment supprimer ce lit de la chambre ?',
      confirmText: 'Supprimer',
      type: 'danger'
    });

    if (!isConfirmed) return;

    const { error } = await supabase.from('lits').delete().eq('id', litId);
    if (error) {
      setErrorMsg(error.message);
    } else {
      fetchLits();
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Loader2 size={24} className="animate-spin text-primary-500" />
      </div>
    );
  }

  if (!chambre) return null;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.back()} className="btn btn-ghost" title="Retour">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">Modifier Chambre {chambre.numero}</h1>
            <p className="page-subtitle">Gérez la chambre et ses lits associés</p>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <AlertCircle size={18} /> {errorMsg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
        
        {/* Colonne gauche: Infos de la chambre */}
        <div className="card">
          <div className="card-header">
            <h3>Informations de la Chambre</h3>
          </div>
          <div className="card-body">
            <form onSubmit={handleUpdateChambre}>
              <div className="form-group">
                <label className="form-label">Numéro de la chambre *</label>
                <input type="text" name="numero" className="form-input" required defaultValue={chambre.numero} />
              </div>
              
              <div className="form-group">
                <label className="form-label">Département *</label>
                <select name="departement_id" className="form-select" required defaultValue={chambre.departement_id}>
                  {departements.map(d => (
                    <option key={d.id} value={d.id}>{d.nom}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Étage *</label>
                <input type="text" name="etage" className="form-input" required defaultValue={chambre.etage} />
              </div>

              <div className="form-group">
                <label className="form-label">Type de chambre *</label>
                <select name="type" className="form-select" required defaultValue={chambre.type}>
                  <option value="individuelle">Individuelle</option>
                  <option value="double">Double</option>
                  <option value="commune">Commune</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Capacité (Nombre max de lits) *</label>
                <input type="number" name="capacite" className="form-input" min="1" required defaultValue={chambre.capacite} />
              </div>

              <div style={{ marginTop: 24, textAlign: 'right' }}>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Mettre à jour la chambre
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Colonne droite: Gestion des lits */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Lits de la chambre</h3>
            <span style={{ fontSize: 13, fontWeight: 600, color: lits.length >= chambre.capacite ? 'var(--danger-600)' : 'var(--neutral-600)' }}>
              {lits.length} / {chambre.capacite} lits
            </span>
          </div>
          <div className="card-body">
            
            {/* Ajout de lit */}
            {lits.length < chambre.capacite && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'flex-end', padding: 16, backgroundColor: 'var(--neutral-50)', borderRadius: 8, border: '1px dashed var(--neutral-300)' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label" style={{ fontSize: 12 }}>Identifiant du lit (ex: 1, A, B)</label>
                  <input type="text" className="form-input" value={nouveauLitNumero} onChange={(e) => setNouveauLitNumero(e.target.value)} placeholder="Identifiant" />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label" style={{ fontSize: 12 }}>Type de lit</label>
                  <select className="form-select" value={nouveauLitType} onChange={(e) => setNouveauLitType(e.target.value)}>
                    <option value="standard">Standard</option>
                    <option value="soins_intensifs">Soins intensifs</option>
                    <option value="pédiatrique">Pédiatrique</option>
                    <option value="maternité">Maternité</option>
                  </select>
                </div>
                <button onClick={handleAjouterLit} className="btn btn-primary" disabled={ajoutantLit || !nouveauLitNumero}>
                  {ajoutantLit ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Ajouter
                </button>
              </div>
            )}

            {/* Liste des lits existants */}
            {lits.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--neutral-500)', fontSize: 14, margin: '20px 0' }}>Aucun lit enregistré pour cette chambre.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {lits.map(lit => (
                  <div key={lit.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', border: '1px solid var(--neutral-200)', borderRadius: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>Lit {lit.numero}</div>
                      <div style={{ fontSize: 12, color: 'var(--neutral-500)', textTransform: 'capitalize' }}>{lit.type_lit.replace('_', ' ')}</div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <select 
                        className="form-select" 
                        style={{ padding: '4px 28px 4px 8px', fontSize: 13, height: 'auto', backgroundColor: lit.statut === 'disponible' ? 'var(--success-50)' : lit.statut === 'occupé' ? 'var(--danger-50)' : 'var(--warning-50)' }}
                        value={lit.statut}
                        onChange={(e) => handleChangeStatutLit(lit.id, e.target.value)}
                        disabled={lit.statut === 'occupé'} // On ne change pas un occupé ici, c'est l'hospitalisation qui gère
                        title={lit.statut === 'occupé' ? "Modifié via Hospitalisation" : ""}
                      >
                        <option value="disponible">Disponible</option>
                        <option value="occupé" disabled>Occupé</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="réservé">Réservé</option>
                      </select>
                      
                      <button 
                        className="btn btn-ghost" 
                        style={{ padding: 6, color: lit.statut === 'occupé' ? 'var(--neutral-300)' : 'var(--danger-600)' }}
                        onClick={() => handleSupprimerLit(lit.id, lit.statut)}
                        disabled={lit.statut === 'occupé'}
                        title={lit.statut === 'occupé' ? "Impossible de supprimer un lit occupé" : "Supprimer ce lit"}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
          </div>
        </div>
      </div>
    </div>
  );
}
