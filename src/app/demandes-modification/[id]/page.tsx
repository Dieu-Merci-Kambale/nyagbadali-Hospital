'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, AlertCircle, Printer, FilePenLine, AlertTriangle, CheckCircle2, XCircle, PenLine, Wrench, Clock,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import { roleLabels } from '@/lib/role-permissions';
import { buildDemandeModificationPdf } from '@/lib/document-models';
import {
  DEMANDE_STATUTS, MODULES_DEMANDE, canMarkExecutee, canSignDirection, canSignMedecinChef,
} from '@/lib/demandes-modification';
import { explainDbError, formatDate, formatDateTime, statusBadge, titreSoignant } from '@/lib/format';
import SignaturePad from '@/components/ui/SignaturePad';
import type { DemandeModification, RolePersonnel } from '@/types';

type Signataire = { nom: string; prenom: string; role: RolePersonnel; code_personnel?: string } | null;

type DemandeDetail = DemandeModification & {
  demandeur?: Signataire;
  medecin_chef?: Signataire;
  direction?: Signataire;
  executant?: Signataire;
};

const SIGNATAIRE = 'nom, prenom, role, code_personnel';

const nomSignataire = (p?: Signataire) => (p ? `${titreSoignant(p.role)}${p.prenom} ${p.nom}` : '');

/** Cadre de signature de la fiche (signé, en attente ou sans objet). */
function SignatureBlock({ titre, signataire, image, date, attente }: {
  titre: string; signataire?: Signataire; image?: string | null; date?: string | null; attente: string;
}) {
  return (
    <div style={{ flex: '1 1 220px', minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--neutral-500)', textAlign: 'center', marginBottom: 6 }}>{titre}</div>
      <div style={{ border: '1.5px dashed var(--neutral-300)', borderRadius: 10, background: '#fff', aspectRatio: '3 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {image
          // Signature en data URL : rien à optimiser pour next/image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={image} alt={`Signature : ${titre}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <span style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={14} /> {attente}</span>}
      </div>
      <div style={{ textAlign: 'center', marginTop: 6, fontWeight: 600, fontSize: 13 }}>{nomSignataire(signataire) || '—'}</div>
      {date && <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--neutral-500)' }}>Signé le {formatDateTime(date)}</div>}
    </div>
  );
}

export default function DemandeModificationDetailPage() {
  const { id } = useParams();
  const { profile } = useAuth();

  const [demande, setDemande] = useState<DemandeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [avis, setAvis] = useState<'favorable' | 'défavorable' | 'approuvée' | 'rejetée' | ''>('');
  const [commentaire, setCommentaire] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [noteExecution, setNoteExecution] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('demandes_modification')
      .select(`
        *,
        demandeur:personnel!demandes_modification_demandeur_id_fkey(${SIGNATAIRE}),
        medecin_chef:personnel!demandes_modification_medecin_chef_id_fkey(${SIGNATAIRE}),
        direction:personnel!demandes_modification_direction_id_fkey(${SIGNATAIRE}),
        executant:personnel!demandes_modification_execute_par_fkey(${SIGNATAIRE})
      `)
      .eq('id', id)
      .maybeSingle();
    if (error) {
      setLoadError(explainDbError(error));
    } else {
      setLoadError('');
      setDemande(data as DemandeDetail | null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useLiveRefresh(load, ['demandes_modification'], { filter: `id=eq.${id}` });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, gap: 12 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
        <span style={{ fontWeight: 500, color: 'var(--neutral-500)' }}>Chargement de la demande...</span>
      </div>
    );
  }

  if (!demande) {
    return (
      <div className="card"><div className="card-body"><div className="empty-state">
        <AlertCircle className="empty-state-icon" />
        <h3>Demande introuvable</h3>
        <p>{loadError || "Cette demande n'existe pas ou vous n'avez pas le droit de la consulter."}</p>
        <Link href="/demandes-modification" className="btn btn-outline"><ArrowLeft size={16} /> Retour aux demandes</Link>
      </div></div></div>
    );
  }

  const st = statusBadge(DEMANDE_STATUTS, demande.statut);
  const etapeMedecinChef = canSignMedecinChef(profile?.role, profile?.id, demande);
  const etapeDirection = canSignDirection(profile?.role, profile?.id, demande);
  const etapeExecution = canMarkExecutee(profile?.role, demande);
  const demandeDuMedecinChef = demande.demandeur?.role === 'medecin_chef';
  const propreDemande = !!profile && demande.demandeur_id === profile.id;

  const handlePrint = async () => {
    try {
      const pdf = await buildDemandeModificationPdf({
        demande,
        moduleLabel: MODULES_DEMANDE[demande.module] || demande.module,
        statutLabel: st.label,
        roleLabels,
        printedBy: profile ? { prenom: profile.prenom, nom: profile.nom, role: roleLabels[profile.role] } : undefined,
        printedAt: new Date(),
      });
      pdf.save(`demande-modification-${demande.numero}.pdf`);
    } catch (err) {
      console.error(err);
      toast.error('Impossible de générer la fiche.');
    }
  };

  const handleSign = async () => {
    const negatif = avis === 'défavorable' || avis === 'rejetée';
    if (!avis) {
      toast.error(etapeMedecinChef ? 'Choisissez votre avis.' : 'Choisissez votre décision.');
      return;
    }
    if (negatif && !commentaire.trim()) {
      toast.error(etapeMedecinChef ? "Motivez l'avis défavorable." : 'Motivez le rejet de la demande.');
      return;
    }
    if (!signature) {
      toast.error('Signez dans le cadre prévu.');
      return;
    }
    setSaving(true);
    const { error } = etapeMedecinChef
      ? await supabase.rpc('signer_demande_modification_medecin_chef', { p_id: demande.id, p_avis: avis, p_commentaire: commentaire.trim() || null, p_signature: signature })
      : await supabase.rpc('signer_demande_modification_direction', { p_id: demande.id, p_decision: avis, p_commentaire: commentaire.trim() || null, p_signature: signature });
    setSaving(false);
    if (error) {
      toast.error(explainDbError(error));
      return;
    }
    toast.success(
      avis === 'favorable' ? 'Avis favorable signé : la demande est transmise à la direction.'
        : avis === 'approuvée' ? "Demande approuvée : l'administration peut effectuer la correction."
          : 'Demande rejetée.',
    );
    setAvis('');
    setCommentaire('');
    setSignature(null);
    load();
  };

  const handleExecution = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('executer_demande_modification', { p_id: demande.id, p_note: noteExecution.trim() || null });
    setSaving(false);
    if (error) {
      toast.error(explainDbError(error));
      return;
    }
    toast.success('Correction enregistrée comme effectuée.');
    setNoteExecution('');
    load();
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <Link href="/demandes-modification" className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}>
            <ArrowLeft size={14} /> Retour aux demandes
          </Link>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            Demande {demande.numero} <span className={`badge ${st.badge}`}>{st.label}</span>
          </h1>
          <p className="page-subtitle">Déposée le {formatDateTime(demande.date_signature_demandeur || demande.created_at)}</p>
        </div>
        <button className="btn btn-outline" onClick={handlePrint}>
          <Printer size={16} /> Imprimer la fiche
        </button>
      </div>

      <div className="card" style={{ marginBottom: 20, maxWidth: 1000 }}>
        <div className="card-header"><span className="card-title"><FilePenLine size={16} /> Fiche de demande de modification</span></div>
        <div className="card-body">
          <div className="form-row">
            <div className="form-group">
              <div className="form-label">Demandeur</div>
              <div style={{ fontWeight: 600 }}>{demande.demandeur ? `${demande.demandeur.prenom} ${demande.demandeur.nom}` : '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>
                {[demande.demandeur ? roleLabels[demande.demandeur.role] : '', demande.demandeur?.code_personnel].filter(Boolean).join(' • ')}
              </div>
            </div>
            <div className="form-group">
              <div className="form-label">Module concerné</div>
              <span className="badge badge-info">{MODULES_DEMANDE[demande.module] || demande.module}</span>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <div className="form-label">Enregistrement concerné</div>
              <div>{demande.reference_enregistrement || '—'}</div>
            </div>
            <div className="form-group">
              <div className="form-label">Date de l&apos;erreur</div>
              <div>{demande.date_erreur ? formatDate(demande.date_erreur) : '—'}</div>
            </div>
          </div>

          <div className="alert alert-danger" style={{ display: 'block', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', marginBottom: 4 }}>Ce qui a été enregistré par erreur</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{demande.description_erreur}</div>
          </div>
          <div className="alert alert-success" style={{ display: 'block', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', marginBottom: 4 }}>Correction demandée</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{demande.correction_demandee}</div>
          </div>

          <div className="form-group">
            <div className="form-label">Explication de l&apos;erreur</div>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{demande.explication}</div>
          </div>
          {demande.mesures_preventives && (
            <div className="form-group">
              <div className="form-label">Mesures pour éviter que cela se reproduise</div>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{demande.mesures_preventives}</div>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <div className="form-label">Avis du médecin chef</div>
              {demande.avis_medecin_chef ? (
                <>
                  <span className={`badge ${demande.avis_medecin_chef === 'favorable' ? 'badge-success' : 'badge-danger'}`}>
                    {demande.avis_medecin_chef === 'favorable' ? 'Favorable' : 'Défavorable'}
                  </span>
                  {demande.commentaire_medecin_chef && <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{demande.commentaire_medecin_chef}</div>}
                </>
              ) : (
                <div style={{ color: 'var(--neutral-500)' }}>{demandeDuMedecinChef ? 'Sans objet (demande du médecin chef)' : 'En attente'}</div>
              )}
            </div>
            <div className="form-group">
              <div className="form-label">Décision de la direction</div>
              {demande.decision_direction ? (
                <>
                  <span className={`badge ${demande.decision_direction === 'approuvée' ? 'badge-success' : 'badge-danger'}`}>
                    {demande.decision_direction === 'approuvée' ? 'Approuvée' : 'Rejetée'}
                  </span>
                  {demande.commentaire_direction && <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{demande.commentaire_direction}</div>}
                </>
              ) : (
                <div style={{ color: 'var(--neutral-500)' }}>{demande.statut === 'rejetée' ? 'Sans objet (avis défavorable)' : 'En attente'}</div>
              )}
            </div>
          </div>

          {demande.date_execution && (
            <div className="alert alert-info" style={{ marginBottom: 16 }}>
              <Wrench size={18} />
              <span>
                Correction effectuée le {formatDateTime(demande.date_execution)}
                {demande.executant ? ` par ${demande.executant.prenom} ${demande.executant.nom}` : ''}
                {demande.note_execution ? ` : ${demande.note_execution}` : '.'}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--neutral-200)' }}>
            <SignatureBlock titre="Le demandeur" signataire={demande.demandeur} image={demande.signature_demandeur} date={demande.date_signature_demandeur} attente="En attente" />
            <SignatureBlock titre="Le médecin chef" signataire={demande.medecin_chef} image={demande.signature_medecin_chef} date={demande.date_signature_medecin_chef} attente={demandeDuMedecinChef ? 'Sans objet' : demande.statut === 'en_attente_medecin_chef' ? 'En attente' : '—'} />
            <SignatureBlock titre="La direction" signataire={demande.direction} image={demande.signature_direction} date={demande.date_signature_direction} attente={demande.statut === 'en_attente_direction' || demande.statut === 'en_attente_medecin_chef' ? 'En attente' : '—'} />
          </div>
        </div>
      </div>

      {(etapeMedecinChef || etapeDirection) && (
        <div className="card" style={{ marginBottom: 20, maxWidth: 1000 }}>
          <div className="card-header">
            <span className="card-title"><PenLine size={16} /> {etapeMedecinChef ? 'Avis et signature du médecin chef' : 'Décision et signature de la direction'}</span>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              {(etapeMedecinChef
                ? [['favorable', 'Avis favorable'], ['défavorable', 'Avis défavorable']] as const
                : [['approuvée', 'Approuver la modification'], ['rejetée', 'Rejeter la demande']] as const
              ).map(([valeur, libelle]) => {
                const positif = valeur === 'favorable' || valeur === 'approuvée';
                const actif = avis === valeur;
                return (
                  <button
                    key={valeur}
                    type="button"
                    className={`btn ${actif ? (positif ? 'btn-success' : 'btn-danger') : 'btn-outline'}`}
                    onClick={() => setAvis(valeur)}
                  >
                    {positif ? <CheckCircle2 size={16} /> : <XCircle size={16} />} {libelle}
                  </button>
                );
              })}
            </div>
            <div className="form-group">
              <label className="form-label">Commentaire {avis === 'défavorable' || avis === 'rejetée' ? '*' : ''}</label>
              <textarea className="form-textarea" rows={3} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder={avis === 'défavorable' || avis === 'rejetée' ? 'Motif obligatoire...' : 'Observations éventuelles...'} />
            </div>
            <div className="form-group" style={{ maxWidth: 480 }}>
              <label className="form-label">Signature de {profile ? `${titreSoignant(profile.role)}${profile.prenom} ${profile.nom}` : '—'} *</label>
              <SignaturePad key={demande.statut} onChange={setSignature} disabled={saving} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={handleSign} disabled={saving}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <PenLine size={16} />} Signer
              </button>
            </div>
          </div>
        </div>
      )}

      {etapeExecution && (
        <div className="card" style={{ marginBottom: 20, maxWidth: 1000 }}>
          <div className="card-header"><span className="card-title"><Wrench size={16} /> Correction dans le système</span></div>
          <div className="card-body">
            <p style={{ marginTop: 0, fontSize: 14, color: 'var(--neutral-700)' }}>
              La demande est approuvée. Effectuez la correction dans le module concerné, puis enregistrez-la ici.
            </p>
            <div className="form-group">
              <label className="form-label">Note (ce qui a été corrigé)</label>
              <textarea className="form-textarea" rows={2} value={noteExecution} onChange={(e) => setNoteExecution(e.target.value)} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={handleExecution} disabled={saving}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Marquer la correction comme effectuée
              </button>
            </div>
          </div>
        </div>
      )}

      {propreDemande && (demande.statut === 'en_attente_medecin_chef' || demande.statut === 'en_attente_direction') && (
        <div className="alert alert-warning" style={{ maxWidth: 1000 }}>
          <AlertTriangle size={18} /> Votre demande est en cours de traitement. Vous ne pouvez pas la valider vous-même.
        </div>
      )}
    </div>
  );
}
