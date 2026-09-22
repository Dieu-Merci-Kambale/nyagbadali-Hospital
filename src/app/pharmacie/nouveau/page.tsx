'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';

export default function NouveauMedicamentPage() {
  const router = useRouter();
  
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const { confirm } = useConfirm();
  
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Extract FormData before any async operations to preserve currentTarget
    const formData = new FormData(e.currentTarget);
    
    const isConfirmed = await confirm({
      title: 'Ajouter un médicament',
      message: 'Voulez-vous vraiment enregistrer ce nouveau médicament dans le stock ?',
      confirmText: 'Oui, ajouter',
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

    try {
      const { error } = await supabase.from('medicaments').insert([data]);

      if (error) {
        throw error;
      }
      
      router.push('/pharmacie');
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
            <h1 className="page-title">Nouveau Médicament</h1>
            <p className="page-subtitle">Ajout au stock de la pharmacie</p>
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
                <input type="text" name="code" className="form-input" required placeholder="Ex: MED-001" />
              </div>
              <div className="form-group">
                <label className="form-label">Nom commercial *</label>
                <input type="text" name="nom_commercial" className="form-input" required placeholder="Ex: Doliprane" />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Nom générique (Molécule)</label>
                <input type="text" name="nom_generique" className="form-input" placeholder="Ex: Paracétamol" />
              </div>
              <div className="form-group">
                <label className="form-label">Famille / Catégorie *</label>
                <select name="famille" className="form-select" required>
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
                <select name="forme" className="form-select" required>
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
                <input type="text" name="dosage" className="form-input" placeholder="Ex: 500mg, 10ml..." />
              </div>
            </div>

            <hr style={{ margin: '24px 0', borderColor: 'var(--neutral-100)' }} />

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Stock Initial *</label>
                <input type="number" name="stock_actuel" className="form-input" min="0" required defaultValue={0} />
              </div>
              <div className="form-group">
                <label className="form-label">Stock Minimum (Alerte) *</label>
                <input type="number" name="stock_minimum" className="form-input" min="0" required defaultValue={10} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Prix unitaire (FC) *</label>
                <input type="number" name="prix_unitaire" className="form-input" min="0" step="0.01" required defaultValue={0} />
              </div>
              <div className="form-group">
                <label className="form-label">Date de péremption</label>
                <input type="date" name="date_peremption" className="form-input" />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Fournisseur</label>
              <input type="text" name="fournisseur" className="form-input" placeholder="Ex: PharmaPlus RDC" />
            </div>
            
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" onClick={() => router.back()} className="btn btn-outline">Annuler</button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Ajouter au stock
          </button>
        </div>
      </form>
    </div>
  );
}
