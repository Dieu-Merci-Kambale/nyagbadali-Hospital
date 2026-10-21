'use client';

import { useEffect, useMemo, useState } from 'react';
import { Banknote, Loader2, Save, AlertCircle, Wand2, ListChecks } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';
import Modal from '@/components/ui/Modal';
import { formatMoney, formatDate, MODES_PAIEMENT, explainDbError, isNetworkError, toDateKey } from '@/lib/format';
import { retrouverOperation } from '@/lib/supabase';
import {
  fetchAssureurs, ventilerReglement, MODES_REGLEMENT_ASSURANCE,
  type Assureur, type CreanceAssurance, type BordereauAssurance,
} from '@/lib/assurances';

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Assureur présélectionné (fiche assureur, bordereau) */
  assureurId?: string;
  /** Règlement d'un bordereau précis */
  bordereauId?: string;
};

/** Enregistrement d'un règlement reçu d'un assureur, ventilé automatiquement ou manuellement sur ses factures. */
export default function ReglementModal({ open, onClose, onSaved, assureurId, bordereauId }: Props) {
  const { confirm } = useConfirm();
  const [assureurs, setAssureurs] = useState<Assureur[]>([]);
  const [assureur, setAssureur] = useState(assureurId || '');
  const [bordereau, setBordereau] = useState(bordereauId || '');
  const [bordereaux, setBordereaux] = useState<BordereauAssurance[]>([]);
  const [creances, setCreances] = useState<CreanceAssurance[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [montant, setMontant] = useState('');
  const [mode, setMode] = useState('virement');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(toDateKey());
  const [notes, setNotes] = useState('');
  const [ventilation, setVentilation] = useState<'auto' | 'manuelle'>('auto');
  const [parts, setParts] = useState<Record<string, string>>({});

  // Réinitialisation à chaque ouverture
  useEffect(() => {
    if (!open) return;
    setAssureur(assureurId || '');
    setBordereau(bordereauId || '');
    setMontant('');
    setReference('');
    setNotes('');
    setDate(toDateKey());
    setVentilation('auto');
    setParts({});
    setError('');
    fetchAssureurs({ inclureInactifs: true }).then(({ assureurs: list, error: e }) => {
      if (e) setError(explainDbError(e));
      setAssureurs(list);
    });
  }, [open, assureurId, bordereauId]);

  // Factures restant dues et bordereaux de l'assureur choisi
  useEffect(() => {
    if (!open || !assureur) {
      setCreances([]);
      setBordereaux([]);
      return;
    }
    let ignore = false;
    setLoading(true);
    Promise.all([
      supabase.from('v_creances_assurance').select('*').eq('assureur_id', assureur).gt('reste', 0).order('date_facture'),
      supabase.from('v_bordereaux_assurance').select('*').eq('assureur_id', assureur).eq('statut', 'envoyé').gt('reste', 0).order('date_emission', { ascending: false }),
    ]).then(([c, b]) => {
      if (ignore) return;
      setLoading(false);
      if (c.error || b.error) {
        setError(explainDbError(c.error || b.error));
        return;
      }
      setCreances((c.data || []) as CreanceAssurance[]);
      setBordereaux((b.data || []) as BordereauAssurance[]);
    });
    return () => { ignore = true; };
  }, [open, assureur]);

  const concernees = useMemo(
    () => (bordereau ? creances.filter((c) => c.bordereau_id === bordereau) : creances),
    [creances, bordereau],
  );
  const totalDu = concernees.reduce((s, c) => s + Number(c.reste || 0), 0);
  const valeur = Number(montant) || 0;
  const apercu = useMemo(() => ventilerReglement(valeur, concernees), [valeur, concernees]);
  const totalManuel = Object.values(parts).reduce((s, v) => s + (Number(v) || 0), 0);

  const choisirBordereau = (id: string) => {
    setBordereau(id);
    setParts({});
    const b = bordereaux.find((x) => x.id === id);
    if (b) setMontant(String(Math.round(Number(b.reste))));
  };

  const handleSave = async () => {
    setError('');
    if (!assureur) return setError('Choisissez l’assureur qui a payé.');
    if (valeur <= 0) return setError('Saisissez le montant reçu.');
    if (ventilation === 'auto' && valeur > totalDu) {
      return setError(`Le montant dépasse le reste dû${bordereau ? ' sur ce bordereau' : ''} (${formatMoney(totalDu)}).`);
    }
    if (ventilation === 'manuelle') {
      if (Math.abs(totalManuel - valeur) > 0.005) return setError(`La ventilation (${formatMoney(totalManuel)}) doit égaler le montant reçu (${formatMoney(valeur)}).`);
      const trop = concernees.find((c) => (Number(parts[c.facture_id]) || 0) > Number(c.reste));
      if (trop) return setError(`Facture ${trop.numero_facture} : le montant affecté dépasse son reste dû (${formatMoney(trop.reste)}).`);
    }
    const nom = assureurs.find((a) => a.id === assureur)?.nom || 'l’assureur';
    const ok = await confirm({
      title: 'Enregistrer le règlement',
      message: `Règlement de ${formatMoney(valeur)} reçu de ${nom} (${MODES_PAIEMENT[mode] || mode}), réparti sur ${ventilation === 'auto' ? apercu.lignes.length : Object.values(parts).filter((v) => Number(v) > 0).length} facture(s). Il sera comptabilisé dans les encaissements.`,
      confirmText: 'Oui, enregistrer',
      type: 'info',
    });
    if (!ok) return;

    setSaving(true);
    const today = toDateKey();
    const debut = new Date(Date.now() - 60_000).toISOString();
    const { data, error: e } = await supabase.rpc('encaisser_paiement_assurance', {
      p_assureur_id: assureur,
      p_montant: valeur,
      p_mode: mode,
      p_reference: reference || null,
      p_date: date === today ? new Date().toISOString() : new Date(`${date}T12:00:00`).toISOString(),
      p_bordereau_id: bordereau || null,
      p_ventilation: ventilation === 'manuelle'
        ? Object.entries(parts).filter(([, v]) => Number(v) > 0).map(([facture_id, v]) => ({ facture_id, montant: Number(v) }))
        : null,
      p_notes: notes || null,
    });
    if (e && isNetworkError(e)) {
      // Réponse perdue en route : le règlement a pu être enregistré, on le vérifie avant de proposer de recommencer
      const { trouve, verifie } = await retrouverOperation<{ numero: string }>(() => supabase.from('paiements_assurance').select('numero')
        .eq('assureur_id', assureur).eq('montant', valeur).eq('statut', 'validé').gte('created_at', debut)
        .order('created_at', { ascending: false }).limit(1));
      setSaving(false);
      if (trouve) {
        toast.success(`Règlement ${trouve.numero} bien enregistré (la confirmation du serveur s’était perdue).`);
        onSaved();
        onClose();
      } else if (verifie) {
        setError('Connexion au serveur interrompue : le règlement n’a pas été enregistré. Vous pouvez recommencer.');
      } else {
        setError('Connexion au serveur toujours interrompue : impossible de vérifier si le règlement a été enregistré. Vérifiez votre connexion, actualisez la page (F5) et consultez Assurances › Règlements avant de recommencer.');
      }
      return;
    }
    setSaving(false);
    if (e) {
      setError(explainDbError(e));
      return;
    }
    toast.success(`Règlement ${data?.numero || ''} enregistré sur ${data?.factures ?? ''} facture(s).`);
    onSaved();
    onClose();
  };

  return (
    <Modal
      open={open}
      maxWidth={820}
      title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Banknote size={18} /> Règlement reçu d’un assureur</span>}
      onClose={onClose}
      footer={(
        <>
          <button className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || loading || !assureur}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Enregistrer le règlement
          </button>
        </>
      )}
    >
      {error && <div className="alert alert-danger" style={{ marginBottom: 14 }}><AlertCircle size={16} /> {error}</div>}

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Assureur *</label>
          <select className="form-select" value={assureur} disabled={!!assureurId} onChange={(e) => { setAssureur(e.target.value); setBordereau(''); setParts({}); }}>
            <option value="">Choisir l’assureur…</option>
            {assureurs.map((a) => <option key={a.id} value={a.id}>{a.nom}{a.actif ? '' : ' (désactivé)'}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Bordereau réglé</label>
          <select className="form-select" value={bordereau} disabled={!!bordereauId || !assureur} onChange={(e) => choisirBordereau(e.target.value)}>
            <option value="">Toutes les factures dues</option>
            {bordereaux.map((b) => <option key={b.id} value={b.id}>{b.numero} — reste {formatMoney(b.reste)}</option>)}
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Montant reçu (FC) *</label>
          <input type="number" min="0" step="50" className="form-input" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="0" />
          {assureur && !loading && <p className="form-help">Reste dû {bordereau ? 'sur ce bordereau' : 'par cet assureur'} : <strong>{formatMoney(totalDu)}</strong></p>}
        </div>
        <div className="form-group">
          <label className="form-label">Date de réception</label>
          <input type="date" className="form-input" value={date} max={toDateKey()} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Mode de règlement</label>
          <select className="form-select" value={mode} onChange={(e) => setMode(e.target.value)}>
            {MODES_REGLEMENT_ASSURANCE.map((m) => <option key={m} value={m}>{MODES_PAIEMENT[m] || m}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Référence (n° de virement, de chèque…)</label>
          <input className="form-input" value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Répartition sur les factures</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button type="button" className={`btn btn-sm ${ventilation === 'auto' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setVentilation('auto')}>
            <Wand2 size={14} /> Automatique (plus anciennes d’abord)
          </button>
          <button type="button" className={`btn btn-sm ${ventilation === 'manuelle' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setVentilation('manuelle')}>
            <ListChecks size={14} /> Manuelle (relevé de l’assureur)
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><Loader2 size={18} className="animate-spin" /></div>
        ) : !assureur ? (
          <p className="form-help">Choisissez l’assureur pour voir ses factures dues.</p>
        ) : concernees.length === 0 ? (
          <p className="form-help">Aucune facture restant due par cet assureur.</p>
        ) : (
          <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--neutral-200)', borderRadius: 8 }}>
            <table className="data-table" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Facture</th>
                  <th>Patient</th>
                  <th style={{ textAlign: 'right' }}>Reste dû</th>
                  <th style={{ textAlign: 'right' }}>{ventilation === 'auto' ? 'Affecté' : 'À affecter'}</th>
                </tr>
              </thead>
              <tbody>
                {concernees.map((c) => {
                  const auto = apercu.lignes.find((l) => l.facture_id === c.facture_id)?.montant || 0;
                  return (
                    <tr key={c.facture_id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{c.numero_facture}</div>
                        <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{formatDate(c.date_facture)}{c.litiges_ouverts > 0 ? ' • en litige' : ''}</div>
                      </td>
                      <td>{c.patient_prenom} {c.patient_nom}</td>
                      <td style={{ textAlign: 'right' }}>{formatMoney(c.reste)}</td>
                      <td style={{ textAlign: 'right', width: 150 }}>
                        {ventilation === 'auto' ? (
                          <span style={{ fontWeight: 600, color: auto > 0 ? 'var(--success)' : 'var(--neutral-400)' }}>{formatMoney(auto)}</span>
                        ) : (
                          <input
                            type="number" min="0" max={c.reste} className="form-input" style={{ padding: '6px 8px', textAlign: 'right' }}
                            value={parts[c.facture_id] || ''}
                            onChange={(e) => setParts({ ...parts, [c.facture_id]: e.target.value })}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {ventilation === 'auto' && apercu.nonAffecte > 0 && (
          <p className="form-help" style={{ color: 'var(--danger)' }}>{formatMoney(apercu.nonAffecte)} dépassent le reste dû et ne peuvent pas être affectés.</p>
        )}
        {ventilation === 'manuelle' && concernees.length > 0 && (
          <p className="form-help">Réparti : <strong style={{ color: Math.abs(totalManuel - valeur) < 0.005 ? 'var(--success)' : 'var(--danger)' }}>{formatMoney(totalManuel)}</strong> sur {formatMoney(valeur)}</p>
        )}
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label">Observations</label>
        <textarea className="form-textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex : règlement partiel du bordereau, retenue pour pièces manquantes…" />
      </div>
    </Modal>
  );
}
