'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';
import type { Medicament } from '@/types';

export default function EditMedicamentPage() {
  const router = useRouter();
  const { id } = useParams();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [medicament, setMedicament] = useState<Medicament | null>(null);
  const { confirm } = useConfirm();

  useEffect(() => {
    async function fetchData() {
      if (!id) return;
      const { data, error } = await supabase
        .from('medicaments')
        .select('*')
        .eq('id', id)
        .single();
        
      if (error) {
        setErrorMsg('Médicament introuvable.');
      } else {
        setMedicament(data as Medicament);
      }
      setLoading(false);
    }
    fetchData();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Preserve formData before async
    const formData = new FormData(e.currentTarget);

    const isConfirmed = await confirm({
      title: 'Modifier le médicament',
      message: 'Confirmez-vous la mise à jour des informations de ce médicament ?',
      confirmText: 'Oui, modifier',
      type: 'info'
    });

    if (!isConfirmed) return;

    setSaving(true);
    setErrorMsg('');
    
    const stock_actuel = parseInt(formData.get('stock_actuel') as string, 10);
    const stock_minimum = parseInt(formData.get('stock_minimum') as string, 10);
    const date_peremption = formData.get('date_peremption') as string;
    
    // Auto statut
    let statut = 'disponible';
    if (stock_actuel <= 0) statut = 'rupture';
    if (date_peremption && new Date(date_peremption) < new Date()) statut = 'expiré';
    
    const data = {
      code: formData.get('code') as string,
      nom_commercial: formData.get('nom_commercial') as string,
      nom_generique: formData.get('nom_generique') as string || '',
      forme: formData.get('forme') as string,
      dosage: formData.get('dosage') as string || '',
      famille: formData.get('famille') as string,
      fournisseur: formData.get('fournisseur') as string || null,
      stock_actuel,
      stock_minimum,
      prix_unitaire: parseFloat(formData.get('prix_unitaire') as string),
      date_peremption: date_peremption || null,
      statut
    };

    const { error } = await supabase.from('medicaments').update(data).eq('id', id);

    if (error) {
      console.error(error);
      setErrorMsg(error.message);
      setSaving(false);
    } else {
      router.push('/pharmacie');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Loader2 size={24} className="animate-spin text-primary-500" />
      </div>
    );
  }

  if (!medicament) {
    return (
      <div className="empty-state">
        <AlertCircle style={{ color: 'var(--danger)' }} />
        <h3>Erreur</h3>
        <p>{errorMsg}</p>
        <button className="btn btn-outline" onClick={() => router.push('/pharmacie')}>Retour</button>
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
            <h1 className="page-title">Modifier Médicament</h1>
            <p className="page-subtitle">{medicament.nom_commercial}</p>
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
                <label className="form-label">Code Produit (SKU) *</label>
                <input type="text" name="code" className="form-input" required defaultValue={medicament.code} />
              </div>
              <div className="form-group">
                <label className="form-label">Nom commercial *</label>
                <input type="text" name="nom_commercial" className="form-input" required defaultValue={medicament.nom_commercial} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Nom générique (Molécule)</label>
                <input type="text" name="nom_generique" className="form-input" defaultValue={medicament.nom_generique || ''} />
              </div>
              <div className="form-group">
                <label className="form-label">Famille / Catégorie *</label>
                <select name="famille" className="form-select" required defaultValue={medicament.famille}>
                  <option value="">-- Choisir --</option>
                  <option value="Antalgique">Antalgique</option>
                  <option value="Antibiotique">Antibiotique</option>
                  <option value="Anti-inflammatoire">Anti-inflammatoire</option>
                  <option value="Antipaludique">Antipaludique</option>
                  <option value="Vitamines">Vitamines</option>
                  <option value="Consommable">Consommable Médical</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Forme *</label>
                <select name="forme" className="form-select" required defaultValue={medicament.forme}>
                  <option value="">-- Choisir --</option>
                  <option value="Comprimé">Comprimé</option>
                  <option value="Gélule">Gélule</option>
                  <option value="Sirop">Sirop</option>
                  <option value="Injectable">Injectable (Ampoule)</option>
                  <option value="Pommade/Crème">Pommade/Crème</option>
                  <option value="Suppositoire">Suppositoire</option>
                  <option value="Gouttes">Gouttes</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Dosage</label>
                <input type="text" name="dosage" className="form-input" defaultValue={medicament.dosage || ''} />
              </div>
            </div>

            <hr style={{ margin: '24px 0', borderColor: 'var(--neutral-100)' }} />

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Stock Actuel *</label>
                <input type="number" name="stock_actuel" className="form-input" min="0" required defaultValue={medicament.stock_actuel} />
              </div>
              <div className="form-group">
                <label className="form-label">Stock Minimum (Alerte) *</label>
                <input type="number" name="stock_minimum" className="form-input" min="0" required defaultValue={medicament.stock_minimum} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Prix unitaire (FC) *</label>
                <input type="number" name="prix_unitaire" className="form-input" min="0" step="0.01" required defaultValue={medicament.prix_unitaire} />
              </div>
              <div className="form-group">
                <label className="form-label">Date de péremption</label>
                <input type="date" name="date_peremption" className="form-input" defaultValue={medicament.date_peremption ? new Date(medicament.date_peremption).toISOString().split('T')[0] : ''} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Fournisseur</label>
              <input type="text" name="fournisseur" className="form-input" defaultValue={medicament.fournisseur || ''} />
            </div>
            
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" onClick={() => router.back()} className="btn btn-outline">Annuler</button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Mettre à jour le stock
          </button>
        </div>
      </form>
    </div>
  );
}
