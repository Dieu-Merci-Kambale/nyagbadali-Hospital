'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, AlertCircle, Loader2, Lock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';
import InvoiceLinesEditor, { InvoiceTotals } from '@/components/facturation/InvoiceLinesEditor';
import { fetchActes, newLine, type InvoiceLine } from '@/lib/invoice';
import { formatMoney, explainDbError } from '@/lib/format';
import type { ActeTarif } from '@/types';

export default function EditFacturePage() {
  const router = useRouter();
  const { id } = useParams();
  const { confirm } = useConfirm();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [facture, setFacture] = useState<any>(null);
  const [actes, setActes] = useState<ActeTarif[]>([]);
  const [lignes, setLignes] = useState<InvoiceLine[]>([newLine()]);
  const [tauxAssurance, setTauxAssurance] = useState(0);

  useEffect(() => {
    async function fetchData() {
      if (!id) return;
      const [{ data, error }, catalogue] = await Promise.all([
        supabase
          .from('factures')
          .select('*, patients(nom, prenom, code_patient), lignes_facture(*), paiements(id)')
          .eq('id', id)
          .single(),
        fetchActes(),
      ]);

      if (error || !data) {
        setErrorMsg('Facture introuvable.');
      } else {
        setFacture(data);
        setActes(catalogue);
        const existing = (data.lignes_facture || []).map((l: any) => newLine({
          description: l.description,
          code_acte: l.code_acte || '',
          quantite: Number(l.quantite) || 1,
          prix_unitaire: Number(l.prix_unitaire) || 0,
          source_type: l.source_type || null,
          source_id: l.source_id || null,
        }));
        setLignes(existing.length ? existing : [newLine()]);
        const total = Number(data.montant_total) || 0;
        setTauxAssurance(total > 0 ? Math.round((Number(data.montant_assurance || 0) / total) * 100) : 0);
      }
      setLoading(false);
    }
    fetchData();
  }, [id]);

  const lignesValides = lignes.filter((l) => l.description.trim() !== '');
  const total = lignesValides.reduce((acc, l) => acc + l.quantite * l.prix_unitaire, 0);
  const montantAssurance = Math.round((total * tauxAssurance) / 100);
  const montantPatient = total - montantAssurance;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (total <= 0) {
      setErrorMsg('Le montant total ne peut pas être nul.');
      return;
    }
    const ok = await confirm({
      title: 'Modifier la facture',
      message: `Le nouveau montant sera de ${formatMoney(total)} (net patient : ${formatMoney(montantPatient)}). Confirmer ?`,
      confirmText: 'Oui, enregistrer',
      type: 'info',
    });
    if (!ok) return;

    setSaving(true);
    setErrorMsg('');

    const { error } = await supabase.from('factures').update({
      montant_total: total,
      montant_assurance: montantAssurance,
      montant_patient: montantPatient,
      statut: montantPatient === 0 ? 'payée' : 'en_attente',
    }).eq('id', id);
    if (error) {
      setErrorMsg(explainDbError(error));
      setSaving(false);
      return;
    }

    // Remplacement complet des lignes
    const { error: delError } = await supabase.from('lignes_facture').delete().eq('facture_id', id);
    if (delError) {
      setErrorMsg(`Impossible de mettre à jour les lignes : ${delError.message}`);
      setSaving(false);
      return;
    }
    const { error: insError } = await supabase.from('lignes_facture').insert(
      lignesValides.map((l) => ({
        facture_id: id,
        description: l.description.trim(),
        code_acte: l.code_acte || null,
        quantite: l.quantite,
        prix_unitaire: l.prix_unitaire,
        montant: l.quantite * l.prix_unitaire,
        couvert_assurance: tauxAssurance > 0,
        ...(l.source_id ? { source_type: l.source_type, source_id: l.source_id } : {}),
      }))
    );
    if (insError) {
      setErrorMsg(`Lignes non enregistrées : ${insError.message}`);
      setSaving(false);
      return;
    }

    toast.success('Facture mise à jour.');
    router.push(`/facturation/${id}`);
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

  const locked = (facture.paiements || []).length > 0 || facture.statut === 'annulée';

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.push(`/facturation/${id}`)} className="btn btn-ghost" title="Retour">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">Modifier la facture {facture.numero_facture}</h1>
            <p className="page-subtitle">Patient : {facture.patients?.prenom} {facture.patients?.nom} ({facture.patients?.code_patient})</p>
          </div>
        </div>
      </div>

      {locked && (
        <div className="alert alert-warning" style={{ marginBottom: 20 }}>
          <Lock size={18} />
          {facture.statut === 'annulée'
            ? 'Cette facture est annulée et ne peut plus être modifiée.'
            : 'Des paiements ont déjà été encaissés sur cette facture : elle ne peut plus être modifiée. Établissez une facture complémentaire si nécessaire.'}
          <Link href={`/facturation/${id}`} style={{ marginLeft: 'auto', fontWeight: 600 }}>Retour à la facture →</Link>
        </div>
      )}

      {errorMsg && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <AlertCircle size={18} /> {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body">
            <div className="form-group" style={{ maxWidth: 320, marginBottom: 0 }}>
              <label className="form-label">Taux de couverture assurance (%)</label>
              <input
                type="number"
                className="form-input"
                min="0"
                max="100"
                value={tauxAssurance}
                disabled={locked}
                onChange={(e) => setTauxAssurance(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
              />
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">Détail des actes & prestations</span></div>
          <div className="card-body" style={{ padding: 0 }}>
            <InvoiceLinesEditor lines={lignes} onChange={setLignes} actes={actes} disabled={locked} />
            <InvoiceTotals total={total} tauxAssurance={tauxAssurance} montantAssurance={montantAssurance} />
          </div>
        </div>

        {!locked && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button type="button" onClick={() => router.push(`/facturation/${id}`)} className="btn btn-outline">Annuler</button>
            <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Enregistrer les modifications
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
