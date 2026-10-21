'use client';

import { useEffect, useState } from 'react';
import { Scale, Loader2, Save, AlertCircle, Gavel } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';
import Modal from '@/components/ui/Modal';
import { formatMoney, explainDbError } from '@/lib/format';
import { MOTIFS_LITIGE, decisionValide, type CreanceAssurance, type LitigeAssurance, type MotifLitige } from '@/lib/assurances';

/** Ouverture d'un litige sur la part assurance d'une facture. */
export function OuvrirLitigeModal({ creance, onClose, onSaved }: {
  creance: CreanceAssurance | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const disponible = creance ? Math.max(0, Number(creance.reste) - Number(creance.montant_conteste)) : 0;
  const [motif, setMotif] = useState<MotifLitige>('acte_non_couvert');
  const [montant, setMontant] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!creance) return;
    setMotif('acte_non_couvert');
    setMontant(String(Math.round(disponible)));
    setDescription('');
    setError('');
  }, [creance, disponible]);

  const handleSave = async () => {
    if (!creance) return;
    const valeur = Number(montant) || 0;
    if (valeur <= 0) return setError('Saisissez le montant contesté par l’assureur.');
    if (valeur > disponible) return setError(`Le montant contesté ne peut pas dépasser ${formatMoney(disponible)}.`);
    setSaving(true);
    const { error: e } = await supabase.rpc('ouvrir_litige_assurance', {
      p_facture_id: creance.facture_id,
      p_motif: motif,
      p_montant: valeur,
      p_description: description || null,
    });
    setSaving(false);
    if (e) return setError(explainDbError(e));
    toast.success('Litige ouvert : la facture est signalée en litige.');
    onSaved();
    onClose();
  };

  return (
    <Modal
      open={!!creance}
      title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Scale size={18} /> Ouvrir un litige — {creance?.numero_facture}</span>}
      onClose={onClose}
      footer={(
        <>
          <button className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn btn-danger" onClick={handleSave} disabled={saving || disponible <= 0}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Ouvrir le litige
          </button>
        </>
      )}
    >
      {creance && (
        <>
          {error && <div className="alert alert-danger" style={{ marginBottom: 14 }}><AlertCircle size={16} /> {error}</div>}
          <div className="alert alert-info" style={{ marginBottom: 16, fontSize: 13 }}>
            {creance.assureur_nom} • Patient {creance.patient_prenom} {creance.patient_nom} • Part assurance {formatMoney(creance.montant_assurance)}, reste dû {formatMoney(creance.reste)}
            {Number(creance.montant_conteste) > 0 && <> (dont {formatMoney(creance.montant_conteste)} déjà en litige)</>}
          </div>
          {disponible <= 0 ? (
            <p className="form-help">Tout le reste dû de cette facture est déjà en litige.</p>
          ) : (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Motif *</label>
                  <select className="form-select" value={motif} onChange={(e) => setMotif(e.target.value as MotifLitige)}>
                    {Object.entries(MOTIFS_LITIGE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Montant contesté (FC) *</label>
                  <input type="number" min="0" max={disponible} className="form-input" value={montant} onChange={(e) => setMontant(e.target.value)} />
                  <p className="form-help">Au plus {formatMoney(disponible)}</p>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Détail de la contestation</label>
                <textarea className="form-textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex : l’assureur refuse l’échographie, non prévue au contrat ; ordonnance manquante…" />
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

/** Décision sur un litige : répartition du montant contesté. */
export function ResoudreLitigeModal({ litige, onClose, onSaved }: {
  litige: (LitigeAssurance & { numero_facture?: string; assureur_nom?: string }) | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { confirm } = useConfirm();
  const [accepte, setAccepte] = useState('0');
  const [transfere, setTransfere] = useState('0');
  const [abandonne, setAbandonne] = useState('0');
  const [resolution, setResolution] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!litige) return;
    setAccepte('0');
    setTransfere(String(litige.montant_conteste));
    setAbandonne('0');
    setResolution('');
    setError('');
  }, [litige]);

  const conteste = Number(litige?.montant_conteste || 0);
  const a = Number(accepte) || 0;
  const t = Number(transfere) || 0;
  const ab = Number(abandonne) || 0;
  const valide = decisionValide(conteste, a, t, ab);

  // Raccourcis : toute la somme dans une seule issue
  const tout = (issue: 'a' | 't' | 'ab') => {
    setAccepte(issue === 'a' ? String(conteste) : '0');
    setTransfere(issue === 't' ? String(conteste) : '0');
    setAbandonne(issue === 'ab' ? String(conteste) : '0');
  };

  const handleSave = async () => {
    if (!litige) return;
    if (!valide) return setError(`La répartition (${formatMoney(a + t + ab)}) doit égaler le montant contesté (${formatMoney(conteste)}).`);
    const effets = [
      a > 0 && `${formatMoney(a)} restent dus par l’assureur`,
      t > 0 && `${formatMoney(t)} sont ajoutés au reste à payer du patient`,
      ab > 0 && `${formatMoney(ab)} sont abandonnés (perte)`,
    ].filter(Boolean).join(' ; ');
    const ok = await confirm({
      title: 'Clôturer le litige',
      message: `${effets}. Cette décision est définitive.`,
      confirmText: 'Oui, clôturer',
      type: t > 0 || ab > 0 ? 'warning' : 'info',
    });
    if (!ok) return;
    setSaving(true);
    const { error: e } = await supabase.rpc('resoudre_litige_assurance', {
      p_litige_id: litige.id,
      p_accepte: a,
      p_transfere: t,
      p_abandonne: ab,
      p_resolution: resolution || null,
    });
    setSaving(false);
    if (e) return setError(explainDbError(e));
    toast.success('Litige clôturé.');
    onSaved();
    onClose();
  };

  return (
    <Modal
      open={!!litige}
      title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Gavel size={18} /> Décision — litige {litige?.numero}</span>}
      onClose={onClose}
      footer={(
        <>
          <button className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !valide}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Clôturer le litige
          </button>
        </>
      )}
    >
      {litige && (
        <>
          {error && <div className="alert alert-danger" style={{ marginBottom: 14 }}><AlertCircle size={16} /> {error}</div>}
          <div className="alert alert-info" style={{ marginBottom: 16, fontSize: 13 }}>
            {litige.assureur_nom} • Facture {litige.numero_facture} • {MOTIFS_LITIGE[litige.motif] || litige.motif} • Montant contesté <strong>{formatMoney(conteste)}</strong>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => tout('a')}>L’assureur accepte de payer</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => tout('t')}>Refus : à la charge du patient</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => tout('ab')}>Refus : abandonné</button>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Payé par l’assureur</label>
              <input type="number" min="0" className="form-input" value={accepte} onChange={(e) => setAccepte(e.target.value)} />
              <p className="form-help">Reste à recouvrer auprès de l’assureur</p>
            </div>
            <div className="form-group">
              <label className="form-label">Reporté au patient</label>
              <input type="number" min="0" className="form-input" value={transfere} onChange={(e) => setTransfere(e.target.value)} />
              <p className="form-help">Ajouté au net à payer du patient</p>
            </div>
            <div className="form-group">
              <label className="form-label">Abandonné (perte)</label>
              <input type="number" min="0" className="form-input" value={abandonne} onChange={(e) => setAbandonne(e.target.value)} />
              <p className="form-help">Passé en perte, plus réclamé</p>
            </div>
          </div>
          <p style={{ fontSize: 13, marginTop: -4, marginBottom: 14 }}>
            Réparti : <strong style={{ color: valide ? 'var(--success)' : 'var(--danger)' }}>{formatMoney(a + t + ab)}</strong> sur {formatMoney(conteste)}
          </p>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Décision et justification</label>
            <textarea className="form-textarea" rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Ex : accord de l’assureur après envoi de l’ordonnance (courrier du 12/11)…" />
          </div>
        </>
      )}
    </Modal>
  );
}
