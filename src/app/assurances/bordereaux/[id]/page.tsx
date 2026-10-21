'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Loader2, AlertTriangle, Send, Printer, Banknote, Ban, Trash2, Scale, Clock, Save } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import { roleLabels, canCancelOperationAssurance } from '@/lib/role-permissions';
import { buildBordereauAssurancePdf } from '@/lib/document-models';
import { formatMoney, formatDate, statusBadge, MODES_PAIEMENT, explainDbError, toDateKey } from '@/lib/format';
import Modal from '@/components/ui/Modal';
import AssuranceHeader from '@/components/assurances/AssuranceHeader';
import ReglementModal from '@/components/assurances/ReglementModal';
import { OuvrirLitigeModal } from '@/components/assurances/LitigeModals';
import {
  BORDEREAU_STATUTS, CREANCE_STATUTS,
  type Assureur, type BordereauAssurance, type CreanceAssurance, type PaiementAssurance,
} from '@/lib/assurances';

type Ligne = CreanceAssurance & { montant_reclame: number };

export default function BordereauDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const { confirm } = useConfirm();
  const [bordereau, setBordereau] = useState<BordereauAssurance | null>(null);
  const [assureur, setAssureur] = useState<Assureur | null>(null);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [reglements, setReglements] = useState<PaiementAssurance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dbError, setDbError] = useState('');
  const [showReglement, setShowReglement] = useState(false);
  const [litigeSur, setLitigeSur] = useState<CreanceAssurance | null>(null);
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [motif, setMotif] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: b, error }, { data: bf }, { data: r }] = await Promise.all([
      supabase.from('v_bordereaux_assurance').select('*').eq('id', id).single(),
      supabase.from('bordereau_factures').select('facture_id, montant').eq('bordereau_id', id),
      supabase.from('paiements_assurance').select('*').eq('bordereau_id', id).order('date_paiement', { ascending: false }),
    ]);
    if (error || !b) {
      setDbError(explainDbError(error) || 'Bordereau introuvable.');
      setLoading(false);
      return;
    }
    const ids = (bf || []).map((x: { facture_id: string }) => x.facture_id);
    const [{ data: a }, { data: c }] = await Promise.all([
      supabase.from('assureurs').select('*').eq('id', b.assureur_id).single(),
      ids.length ? supabase.from('v_creances_assurance').select('*').in('facture_id', ids).order('date_facture') : Promise.resolve({ data: [] }),
    ]);
    const reclame = new Map((bf || []).map((x: { facture_id: string; montant: number }) => [x.facture_id, Number(x.montant)]));
    setBordereau(b as BordereauAssurance);
    setAssureur((a || null) as Assureur | null);
    setLignes(((c || []) as CreanceAssurance[]).map((x) => ({ ...x, montant_reclame: reclame.get(x.facture_id) ?? Number(x.reste) })));
    setReglements((r || []) as PaiementAssurance[]);
    setDbError('');
    setLoading(false);
  }, [id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load, ['bordereaux_assurance', 'paiements_assurance', 'litiges_assurance']);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>;
  if (!bordereau) {
    return (
      <div className="animate-fade-in">
        <AssuranceHeader title="Bordereau introuvable" backHref="/assurances/bordereaux" />
        {dbError && <div className="alert alert-danger"><AlertTriangle size={18} /> {dbError}</div>}
      </div>
    );
  }

  const st = statusBadge(BORDEREAU_STATUTS, bordereau.statut_calcule);
  const brouillon = bordereau.statut === 'brouillon';
  const envoye = bordereau.statut === 'envoyé';
  const annulable = brouillon || (envoye && canCancelOperationAssurance(profile?.role) && !reglements.some((r) => r.statut === 'validé'));

  const rpc = async (fn: string, args: Record<string, unknown>, succes: string) => {
    setSaving(true);
    const { error } = await supabase.rpc(fn, args);
    setSaving(false);
    if (error) {
      toast.error(explainDbError(error));
      return false;
    }
    toast.success(succes);
    load();
    return true;
  };

  const retirer = async (l: Ligne) => {
    const ok = await confirm({
      title: 'Retirer la facture',
      message: `La facture ${l.numero_facture} sera retirée du bordereau et redeviendra « à réclamer ».`,
      confirmText: 'Retirer',
      type: 'warning',
    });
    if (ok) rpc('retirer_facture_bordereau', { p_bordereau_id: bordereau.id, p_facture_id: l.facture_id }, 'Facture retirée du bordereau.');
  };

  const imprimer = async () => {
    try {
      const pdf = await buildBordereauAssurancePdf({
        bordereau,
        assureur,
        lignes,
        printedBy: profile ? { prenom: profile.prenom, nom: profile.nom, role: roleLabels[profile.role] } : undefined,
        printedAt: new Date(),
      });
      pdf.save(`bordereau-${bordereau.numero}.pdf`);
    } catch (e) {
      console.error(e);
      toast.error('Le bordereau n’a pas pu être généré.');
    }
  };

  return (
    <div className="animate-fade-in">
      <AssuranceHeader
        title={`Bordereau ${bordereau.numero}`}
        subtitle={`${bordereau.assureur_nom} • émis le ${formatDate(bordereau.date_emission)}`}
        backHref="/assurances/bordereaux"
        actions={(
          <>
            <button className="btn btn-outline" onClick={imprimer} disabled={!lignes.length}><Printer size={16} /> Bordereau PDF</button>
            {brouillon && (
              <button className="btn btn-primary" onClick={() => setEnvoi(toDateKey())} disabled={saving || !lignes.length}><Send size={16} /> Marquer comme envoyé</button>
            )}
            {envoye && Number(bordereau.reste) > 0 && (
              <button className="btn btn-primary" onClick={() => setShowReglement(true)}><Banknote size={16} /> Enregistrer le règlement</button>
            )}
            {annulable && (
              <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => setMotif('')} disabled={saving}><Ban size={16} /> Annuler</button>
            )}
          </>
        )}
      />

      {dbError && <div className="alert alert-danger" style={{ marginBottom: 20 }}><AlertTriangle size={18} /> {dbError}</div>}
      {bordereau.statut === 'annulé' && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}><Ban size={18} /> Bordereau annulé{bordereau.motif_annulation ? ` : ${bordereau.motif_annulation}` : ''}. Ses factures peuvent être réclamées sur un nouveau bordereau.</div>
      )}
      {bordereau.en_retard && (
        <div className="alert alert-warning" style={{ marginBottom: 20 }}><Clock size={18} /> Échéance dépassée depuis le {formatDate(bordereau.date_echeance)} : relancez {bordereau.assureur_nom} ({formatMoney(bordereau.reste)} restent dus).</div>
      )}
      {brouillon && (
        <div className="alert alert-info" style={{ marginBottom: 20 }}>Bordereau en préparation : vérifiez les factures, imprimez-le puis marquez-le comme envoyé pour fixer l’échéance de paiement ({assureur?.delai_paiement_jours ?? '—'} jours).</div>
      )}

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card"><div className="stat-card-info"><h3>Statut</h3><div style={{ marginTop: 6 }}><span className={`badge ${st.badge}`} style={{ fontSize: 13 }}>{st.label}</span></div><div className="stat-change">{bordereau.date_envoi ? `Envoyé le ${formatDate(bordereau.date_envoi)}` : 'Non envoyé'}</div></div></div>
        <div className="stat-card"><div className="stat-card-info"><h3>Montant réclamé</h3><div className="stat-value">{formatMoney(bordereau.montant)}</div><div className="stat-change">{bordereau.nb_factures} facture(s)</div></div></div>
        <div className="stat-card"><div className="stat-card-info"><h3>Réglé</h3><div className="stat-value" style={{ color: 'var(--success)' }}>{formatMoney(bordereau.paye)}</div>{Number(bordereau.abandonne) > 0 && <div className="stat-change negative">{formatMoney(bordereau.abandonne)} abandonnés</div>}</div></div>
        <div className="stat-card"><div className="stat-card-info"><h3>Reste dû</h3><div className="stat-value">{bordereau.statut === 'annulé' ? '—' : formatMoney(bordereau.reste)}</div><div className="stat-change">{bordereau.date_echeance ? `Échéance ${formatDate(bordereau.date_echeance)}` : 'Échéance fixée à l’envoi'}</div></div></div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><span className="card-title">Factures du bordereau</span></div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Facture</th>
              <th>Patient</th>
              <th>Statut</th>
              <th style={{ textAlign: 'right' }}>Réclamé</th>
              <th style={{ textAlign: 'right' }}>Réglé</th>
              <th style={{ textAlign: 'right' }}>Reste dû</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--neutral-400)', padding: 24 }}>Aucune facture.</td></tr>}
            {lignes.map((l) => {
              const s = statusBadge(CREANCE_STATUTS, l.statut_assurance);
              return (
                <tr key={l.facture_id}>
                  <td><Link href={`/facturation/${l.facture_id}`} style={{ fontWeight: 600 }}>{l.numero_facture}</Link><div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{formatDate(l.date_facture)}</div></td>
                  <td>{l.patient_prenom} {l.patient_nom}<div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{l.numero_assurance ? `N° ${l.numero_assurance}` : l.code_patient}</div></td>
                  <td><span className={`badge ${s.badge}`}>{s.label}</span>{Number(l.montant_conteste) > 0 && <div style={{ fontSize: 11, color: 'var(--danger)' }}>{formatMoney(l.montant_conteste)} contestés</div>}</td>
                  <td style={{ textAlign: 'right' }}>{formatMoney(l.montant_reclame)}</td>
                  <td style={{ textAlign: 'right', color: Number(l.paye) > 0 ? 'var(--success)' : undefined }}>{formatMoney(l.paye)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(l.reste)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {envoye && Number(l.reste) - Number(l.montant_conteste) > 0 && (
                      <button className="btn btn-ghost btn-sm" title="Ouvrir un litige" onClick={() => setLitigeSur(l)}><Scale size={14} /></button>
                    )}
                    {brouillon && (
                      <button className="btn btn-ghost btn-sm" title="Retirer du bordereau" style={{ color: 'var(--danger)' }} onClick={() => retirer(l)} disabled={saving}><Trash2 size={14} /></button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Règlements reçus sur ce bordereau</span></div>
        <table className="data-table">
          <thead><tr><th>Date</th><th>N° règlement</th><th>Mode</th><th>Référence</th><th>Statut</th><th style={{ textAlign: 'right' }}>Montant</th></tr></thead>
          <tbody>
            {reglements.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--neutral-400)', padding: 24 }}>Aucun règlement enregistré sur ce bordereau.</td></tr>}
            {reglements.map((r) => (
              <tr key={r.id} style={{ opacity: r.statut === 'annulé' ? 0.5 : 1 }}>
                <td>{formatDate(r.date_paiement)}</td>
                <td style={{ fontWeight: 600 }}>{r.numero}</td>
                <td>{MODES_PAIEMENT[r.mode_paiement] || r.mode_paiement}</td>
                <td>{r.reference || '—'}</td>
                <td><span className={`badge ${r.statut === 'annulé' ? 'badge-danger' : 'badge-success'}`}>{r.statut === 'annulé' ? 'Annulé' : 'Validé'}</span></td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(r.montant)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={envoi !== null}
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Send size={18} /> Envoi du bordereau</span>}
        onClose={() => setEnvoi(null)}
        footer={(
          <>
            <button className="btn btn-outline" onClick={() => setEnvoi(null)}>Annuler</button>
            <button className="btn btn-primary" disabled={saving || !envoi} onClick={async () => {
              if (await rpc('envoyer_bordereau_assurance', { p_bordereau_id: bordereau.id, p_date_envoi: envoi }, 'Bordereau marqué comme envoyé.')) setEnvoi(null);
            }}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Confirmer l’envoi
            </button>
          </>
        )}
      >
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Date de dépôt / d’envoi à l’assureur</label>
          <input type="date" className="form-input" value={envoi || ''} max={toDateKey()} onChange={(e) => setEnvoi(e.target.value)} />
          <p className="form-help">L’échéance de paiement sera fixée à {assureur?.delai_paiement_jours ?? '—'} jours après cette date. Le bordereau ne sera plus modifiable.</p>
        </div>
      </Modal>

      <Modal
        open={motif !== null}
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Ban size={18} /> Annuler le bordereau</span>}
        onClose={() => setMotif(null)}
        footer={(
          <>
            <button className="btn btn-outline" onClick={() => setMotif(null)}>Retour</button>
            <button className="btn btn-danger" disabled={saving || !motif?.trim()} onClick={async () => {
              if (await rpc('annuler_bordereau_assurance', { p_bordereau_id: bordereau.id, p_motif: motif }, 'Bordereau annulé : ses factures sont de nouveau à réclamer.')) setMotif(null);
            }}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />} Annuler le bordereau
            </button>
          </>
        )}
      >
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Motif de l’annulation *</label>
          <textarea className="form-textarea" rows={3} value={motif || ''} onChange={(e) => setMotif(e.target.value)} placeholder="Ex : bordereau refusé par l’assureur, erreur de période…" />
        </div>
      </Modal>

      <ReglementModal open={showReglement} onClose={() => setShowReglement(false)} onSaved={load} assureurId={bordereau.assureur_id} bordereauId={bordereau.id} />
      <OuvrirLitigeModal creance={litigeSur} onClose={() => setLitigeSur(null)} onSaved={load} />
    </div>
  );
}
