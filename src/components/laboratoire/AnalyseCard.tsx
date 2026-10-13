'use client';

import { useState } from 'react';
import { Microscope, CheckCircle, Plus, Trash2, Save, XCircle, Edit, Loader2, Siren, Ban } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';
import { findExamen } from '@/lib/lab-catalogue';
import { LAB_STATUTS, statusBadge, formatDateTime, explainDbError } from '@/lib/format';
import type { ParametreAnalyse } from '@/types';

const emptyParam = (): ParametreAnalyse => ({ nom: '', valeur: '', unite: '', reference: '', anormal: false });

function initialParams(analyse: any): ParametreAnalyse[] {
  const saved: ParametreAnalyse[] = analyse.resultats?.parametres || [];
  if (saved.length) return saved;
  const template = findExamen(analyse.type_analyse)?.parametres.map((p) => ({ ...p, valeur: '', anormal: false })) || [];
  return template.length ? template : [emptyParam()];
}

type Props = {
  analyse: any;
  /** Peut faire avancer l'examen et saisir les résultats (laboratoire, médecins) */
  canProcess: boolean;
  /** La facture portant l'examen est payée : condition pour le traiter */
  payee: boolean;
  profileId?: string;
  onChanged: () => void;
  /** Signale au parent qu'une saisie est en cours (pour suspendre le rafraîchissement automatique) */
  onEditingChange?: (editing: boolean) => void;
};

/** Un examen d'une demande : statut, démarrage, saisie et validation des résultats. */
export default function AnalyseCard({ analyse, canProcess, payee, profileId, onChanged, onEditingChange }: Props) {
  const { confirm } = useConfirm();
  const [saving, setSaving] = useState(false);
  const [editing, setEditingState] = useState(false);
  const [parametres, setParametres] = useState<ParametreAnalyse[]>(() => initialParams(analyse));
  const [conclusion, setConclusion] = useState(analyse.resultats?.texte || '');
  const [observations, setObservations] = useState(analyse.observations || '');

  const setEditing = (v: boolean) => {
    setEditingState(v);
    onEditingChange?.(v);
  };

  const st = statusBadge(LAB_STATUTS, analyse.statut);
  const isTermine = analyse.statut === 'terminé';
  const isAnnule = analyse.statut === 'annulé';
  // Pas de traitement (prélèvement, analyse, résultats) tant que l'examen n'est pas payé
  const canWork = canProcess && payee;
  const nonPaye = canProcess && !payee && !isAnnule && !isTermine;
  // Le formulaire est ouvert d'office pour un examen en cours d'analyse
  const showForm = canWork && !isAnnule && (editing || analyse.statut === 'en_cours');

  const update = async (patch: Record<string, unknown>, message: string) => {
    setSaving(true);
    const { error } = await supabase
      .from('analyses_laboratoire')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', analyse.id);
    setSaving(false);
    if (error) {
      toast.error(explainDbError(error));
      return false;
    }
    toast.success(message);
    onChanged();
    return true;
  };

  const resultats = () => ({ parametres: parametres.filter((p) => p.nom.trim() !== ''), texte: conclusion.trim() });

  const handleDemarrer = () => update({
    statut: 'en_cours',
    technicien_id: analyse.technicien_id || profileId || null,
    date_prelevement: analyse.date_prelevement || new Date().toISOString(),
  }, `${analyse.type_analyse} : analyse démarrée.`);

  const handleBrouillon = async () => {
    const ok = await update({ resultats: resultats(), observations: observations.trim() || null }, 'Résultats enregistrés (non validés).');
    if (ok) setEditing(false);
  };

  const handleValider = async () => {
    const res = resultats();
    if (!res.parametres.some((p) => p.valeur.trim() !== '') && !res.texte) {
      toast.error('Saisissez au moins une valeur ou une conclusion avant de valider.');
      return;
    }
    const ok = await confirm({
      title: `Valider : ${analyse.type_analyse}`,
      message: 'Les résultats seront transmis au médecin prescripteur. Valider ?',
      confirmText: 'Oui, valider',
      type: 'success',
    });
    if (!ok) return;
    const done = await update({
      statut: 'terminé',
      resultats: res,
      observations: observations.trim() || null,
      date_resultat: analyse.date_resultat || new Date().toISOString(),
      technicien_id: analyse.technicien_id || profileId || null,
    }, `${analyse.type_analyse} : résultats validés.`);
    if (done) setEditing(false);
  };

  const handleAnnuler = async () => {
    const ok = await confirm({
      title: "Annuler l'examen",
      message: `L'examen « ${analyse.type_analyse} » sera retiré de la demande (il ne sera pas facturé). Continuer ?`,
      confirmText: "Oui, annuler l'examen",
      type: 'danger',
    });
    if (ok) update({ statut: 'annulé' }, 'Examen annulé.');
  };

  const setParam = (i: number, patch: Partial<ParametreAnalyse>) => {
    setParametres((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  };

  const anomalies = (analyse.resultats?.parametres || []).filter((p: ParametreAnalyse) => p.anormal).length;

  return (
    <div id={`analyse-${analyse.id}`} className="card" style={{ opacity: isAnnule ? 0.6 : 1, scrollMarginTop: 90 }}>
      <div className="card-header">
        <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Microscope size={16} /> {analyse.type_analyse}
          {analyse.urgent && <span className="badge badge-danger"><Siren size={11} /> Urgent</span>}
          {anomalies > 0 && <span className="badge badge-danger">{anomalies} anomalie{anomalies > 1 ? 's' : ''}</span>}
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className={`badge ${st.badge}`}>{st.label}</span>
          {nonPaye && <span className="badge badge-danger"><Ban size={11} /> Non payé</span>}
          {canWork && analyse.statut === 'prélevé' && (
            <button className="btn btn-primary btn-sm" onClick={handleDemarrer} disabled={saving}>
              <Microscope size={14} /> Démarrer
            </button>
          )}
          {canWork && isTermine && !editing && (
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}><Edit size={14} /> Corriger</button>
          )}
          {canProcess && !isTermine && !isAnnule && (
            <button className="btn btn-ghost btn-sm" onClick={handleAnnuler} disabled={saving} title="Annuler cet examen" style={{ color: 'var(--danger)' }}>
              <XCircle size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="card-body">
        {nonPaye && (
          <div className="alert alert-danger" style={{ marginBottom: 12 }}>
            <Ban size={16} /> Facture non payée : demandez au patient de régler sa demande à la caisse avant toute analyse.
          </div>
        )}
        {showForm ? (
          <>
            <table className="data-table" style={{ marginBottom: 12 }}>
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>Paramètre</th>
                  <th style={{ width: '20%' }}>Valeur</th>
                  <th style={{ width: '14%' }}>Unité</th>
                  <th style={{ width: '22%' }}>Référence</th>
                  <th style={{ width: '10%', textAlign: 'center' }}>Anormal</th>
                  <th style={{ width: '6%' }}></th>
                </tr>
              </thead>
              <tbody>
                {parametres.map((p, i) => (
                  <tr key={i} style={{ background: p.anormal ? 'var(--danger-50)' : undefined }}>
                    <td><input className="form-input" value={p.nom} onFocus={() => !editing && setEditing(true)} onChange={(e) => setParam(i, { nom: e.target.value })} placeholder="Ex : Hémoglobine" /></td>
                    <td><input className="form-input" value={p.valeur} onFocus={() => !editing && setEditing(true)} onChange={(e) => setParam(i, { valeur: e.target.value })} style={{ fontWeight: 700 }} /></td>
                    <td><input className="form-input" value={p.unite || ''} onChange={(e) => setParam(i, { unite: e.target.value })} /></td>
                    <td><input className="form-input" value={p.reference || ''} onChange={(e) => setParam(i, { reference: e.target.value })} /></td>
                    <td style={{ textAlign: 'center' }}><input type="checkbox" checked={!!p.anormal} onChange={(e) => setParam(i, { anormal: e.target.checked })} /></td>
                    <td>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', padding: 4 }} onClick={() => setParametres((prev) => prev.filter((_, j) => j !== i))} title="Supprimer la ligne">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setParametres((prev) => [...prev, emptyParam()])} style={{ marginBottom: 16 }}>
              <Plus size={14} /> Ajouter un paramètre
            </button>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Conclusion / résultat global</label>
                <textarea className="form-textarea" rows={2} value={conclusion} onFocus={() => !editing && setEditing(true)} onChange={(e) => setConclusion(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Observations du technicien</label>
                <textarea className="form-textarea" rows={2} value={observations} onFocus={() => !editing && setEditing(true)} onChange={(e) => setObservations(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              {isTermine ? (
                <button type="button" className="btn btn-outline" onClick={() => {
                  setParametres(initialParams(analyse));
                  setConclusion(analyse.resultats?.texte || '');
                  setObservations(analyse.observations || '');
                  setEditing(false);
                }}>Annuler la correction</button>
              ) : (
                <button type="button" className="btn btn-outline" onClick={handleBrouillon} disabled={saving}>
                  <Save size={16} /> Enregistrer le brouillon
                </button>
              )}
              <button type="button" className="btn btn-success" onClick={handleValider} disabled={saving}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />} Valider
              </button>
            </div>
          </>
        ) : analyse.resultats && ((analyse.resultats.parametres || []).length > 0 || analyse.resultats.texte) ? (
          <>
            {(analyse.resultats.parametres || []).length > 0 && (
              <table className="data-table" style={{ marginBottom: 12 }}>
                <thead><tr><th>Paramètre</th><th>Résultat</th><th>Valeurs de référence</th></tr></thead>
                <tbody>
                  {analyse.resultats.parametres.map((p: ParametreAnalyse, i: number) => (
                    <tr key={i} style={{ background: p.anormal ? 'var(--danger-50)' : undefined }}>
                      <td style={{ fontWeight: 600 }}>{p.nom}</td>
                      <td style={{ fontWeight: 700, color: p.anormal ? 'var(--danger-600)' : 'var(--neutral-900)' }}>{p.valeur || '—'} {p.unite}{p.anormal ? ' ⚠' : ''}</td>
                      <td style={{ color: 'var(--neutral-500)' }}>{p.reference || '—'} {p.reference ? p.unite : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {analyse.resultats.texte && (
              <div style={{ padding: 12, background: 'var(--primary-50)', borderRadius: 8, borderLeft: '4px solid var(--primary-500)', fontWeight: 600 }}>
                {analyse.resultats.texte}
              </div>
            )}
            {analyse.observations && <p style={{ marginTop: 10, fontSize: 13, color: 'var(--neutral-600)', fontStyle: 'italic' }}>Observations : {analyse.observations}</p>}
            {isTermine && (
              <p style={{ marginTop: 10, fontSize: 12, color: 'var(--neutral-500)' }}>
                Validé le {formatDateTime(analyse.date_resultat)}{analyse.technicien ? ` par ${analyse.technicien.prenom} ${analyse.technicien.nom}` : ''}
              </p>
            )}
          </>
        ) : (
          <p style={{ color: 'var(--neutral-500)', fontSize: 14 }}>
            {isAnnule ? 'Examen annulé.' : analyse.statut === 'demandé' ? 'En attente de prélèvement.' : analyse.statut === 'prélevé' ? `Prélevé le ${formatDateTime(analyse.date_prelevement)} — en attente d'analyse.` : 'Résultats en attente.'}
          </p>
        )}
      </div>
    </div>
  );
}
