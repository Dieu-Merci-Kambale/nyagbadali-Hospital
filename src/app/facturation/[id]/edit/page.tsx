'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function EditFacturePage() {
  const router = useRouter();
  const { id } = useParams();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [facture, setFacture] = useState<any>(null);

  useEffect(() => {
    async function fetchData() {
      if (!id) return;
      const { data, error } = await supabase
        .from('factures')
        .select(`
          *,
          patients(nom, prenom, code_patient),
          lignes_facture(id, description),
          paiements(montant)
        `)
        .eq('id', id)
        .single();
        
      if (error) {
        setErrorMsg('Facture introuvable.');
      } else {
        const montant_paye = data.paiements?.reduce((acc: number, p: any) => acc + p.montant, 0) || 0;
        const description = data.lignes_facture && data.lignes_facture.length > 0 ? data.lignes_facture[0].description : '';
        setFacture({ ...data, montant_paye, description, ligne_id: data.lignes_facture?.[0]?.id });
      }
      setLoading(false);
    }
    fetchData();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg('');
    
    const formData = new FormData(e.currentTarget);
    const montantTotal = parseFloat(formData.get('montant_total') as string);
    const montantAssurance = parseFloat(formData.get('montant_assurance') as string) || 0;
    const montantPatient = montantTotal - montantAssurance;
    
    const montantPaye = parseFloat(formData.get('montant_paye') as string) || 0;
    
    let statut = 'en_attente';
    if (montantPaye >= montantPatient) {
      statut = 'payée';
    } else if (montantPaye > 0) {
      statut = 'partielle';
    }
    
    // Allow manual override if needed, but normally it's calculated
    const manualStatut = formData.get('statut') as string;
    if (manualStatut === 'annulée') {
      statut = 'annulée';
    }

    const description = formData.get('description') as string;

    const data = {
      montant_total: montantTotal,
      montant_assurance: montantAssurance,
      montant_patient: montantPatient,
      statut,
    };

    // 1. Update Facture
    const { error } = await supabase.from('factures').update(data).eq('id', id);

    if (error) {
      console.error(error);
      setErrorMsg(error.message);
      setSaving(false);
      return;
    }

    // 2. Update Description in lignes_facture
    if (facture.ligne_id) {
      await supabase.from('lignes_facture').update({ description, montant: montantTotal, prix_unitaire: montantTotal }).eq('id', facture.ligne_id);
    } else {
      await supabase.from('lignes_facture').insert([{ facture_id: id, description, quantite: 1, prix_unitaire: montantTotal, montant: montantTotal, couvert_assurance: false }]);
    }

    // 3. Add new paiement if montant_paye increased
    const diff = montantPaye - facture.montant_paye;
    if (diff > 0) {
      await supabase.from('paiements').insert([{ facture_id: id, montant: diff, mode_paiement: 'cash', date_paiement: new Date().toISOString() }]);
    }

    router.push('/facturation');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Loader2 size={24} className="animate-spin text-primary-500" />
      </div>
    );
  }

  if (!facture) {
    return (
      <div className="empty-state">
        <AlertCircle style={{ color: 'var(--danger)' }} />
        <h3>Erreur</h3>
        <p>{errorMsg}</p>
        <button className="btn btn-outline" onClick={() => router.push('/facturation')}>Retour</button>
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
            <h1 className="page-title">Gérer la Facture</h1>
            <p className="page-subtitle">Patient: {facture.patients?.prenom} {facture.patients?.nom}</p>
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
              <label className="form-label">Détails des prestations *</label>
              <textarea name="description" className="form-textarea" rows={3} required defaultValue={facture.description || ''}></textarea>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Montant Total Brut (FC) *</label>
                <input type="number" name="montant_total" className="form-input" min="0" step="50" required defaultValue={facture.montant_total} />
              </div>
              <div className="form-group">
                <label className="form-label">Prise en charge Assurance (FC)</label>
                <input type="number" name="montant_assurance" className="form-input" min="0" step="50" defaultValue={facture.montant_assurance || 0} />
              </div>
              <div className="form-group">
                <label className="form-label">Montant Payé (FC)</label>
                <input type="number" name="montant_paye" className="form-input" min="0" step="50" defaultValue={facture.montant_paye || 0} />
              </div>
              <div className="form-group">
                <label className="form-label">Statut (Forcer l'annulation)</label>
                <select name="statut" className="form-select" defaultValue={facture.statut}>
                  <option value={facture.statut}>Calcul Automatique ({facture.statut})</option>
                  <option value="annulée">Annuler la facture</option>
                </select>
              </div>
            </div>
            
            <div style={{ padding: '16px', background: 'var(--neutral-50)', borderRadius: '8px', border: '1px solid var(--neutral-200)', marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'var(--neutral-600)' }}>Total Brut :</span>
                <span style={{ fontWeight: 600 }}>{facture.montant_total} FC</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'var(--neutral-600)' }}>Prise en charge :</span>
                <span style={{ fontWeight: 600 }}>- {facture.montant_assurance || 0} FC</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, marginTop: 8, borderTop: '1px solid var(--neutral-200)', paddingTop: 8 }}>
                <span style={{ color: 'var(--neutral-600)' }}>Net à payer (Patient) :</span>
                <span style={{ fontWeight: 600 }}>{facture.montant_patient} FC</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'var(--success)' }}>Déjà payé :</span>
                <span style={{ fontWeight: 600, color: 'var(--success)' }}>{facture.montant_paye || 0} FC</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--neutral-200)', paddingTop: 8, fontSize: 16, fontWeight: 700 }}>
                <span>Reste à payer :</span>
                <span style={{ color: facture.montant_patient - (facture.montant_paye || 0) > 0 ? 'var(--danger)' : 'var(--neutral-800)' }}>
                  {facture.montant_patient - (facture.montant_paye || 0)} FC
                </span>
              </div>
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
