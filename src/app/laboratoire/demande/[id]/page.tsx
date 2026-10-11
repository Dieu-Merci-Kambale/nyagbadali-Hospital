'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, AlertCircle, Syringe, Microscope, Printer, FileText, Plus, XCircle, User, Stethoscope, Siren, CheckCircle, FlaskConical,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { roleLabels, hasAccess } from '@/lib/role-permissions';
import { buildLabRequestOrderPdf, buildLabRequestReportPdf } from '@/lib/document-models';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import { LAB_CATALOGUE, statutDemande } from '@/lib/lab-catalogue';
import { LAB_STATUTS, statusBadge, formatDateTime, getAge, explainDbError } from '@/lib/format';
import Modal from '@/components/ui/Modal';
import AnalyseCard from '@/components/laboratoire/AnalyseCard';

const STEPS = [
  { key: 'demandé', label: 'Demandé', icon: <FlaskConical size={16} /> },
  { key: 'prélevé', label: 'Prélevé', icon: <Syringe size={16} /> },
  { key: 'en_cours', label: 'En analyse', icon: <Microscope size={16} /> },
  { key: 'terminé', label: 'Validé', icon: <CheckCircle size={16} /> },
];

export default function DemandeLaboratoirePage() {
  const { id } = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const { confirm } = useConfirm();

  const [demande, setDemande] = useState<any>(null);
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingCount, setEditingCount] = useState(0);
  const [showAjout, setShowAjout] = useState(false);
  const [ajout, setAjout] = useState<string[]>([]);
  const [ajoutAutre, setAjoutAutre] = useState('');

  const canProcess = profile ? ['super_admin', 'medecin_chef', 'medecin', 'technicien_labo'].includes(profile.role) : false;
  const canRequest = profile ? hasAccess(profile.role, 'laboratoire') : false;

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: d, error }, { data: a }] = await Promise.all([
      supabase
        .from('demandes_laboratoire')
        .select('*, patients(*), personnel!demandes_laboratoire_medecin_prescripteur_id_fkey(nom, prenom, specialite)')
        .eq('id', id)
        .single(),
      supabase
        .from('analyses_laboratoire')
        .select('*, technicien:personnel!analyses_laboratoire_technicien_id_fkey(nom, prenom)')
        .eq('demande_id', id)
        .order('created_at'),
    ]);
    if (error) {
      console.error(error);
      toast.error(explainDbError(error));
      setDemande(null);
    } else {
      setDemande(d);
      setAnalyses(a || []);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Résultats saisis par d'autres postes (suspendu pendant une saisie)
  useLiveRefresh(() => { if (editingCount === 0 && !saving) load(); }, ['analyses_laboratoire'], { filter: id ? `demande_id=eq.${id}` : undefined });

  // Défilement vers l'examen demandé (lien depuis une consultation : #analyse-<id>)
  useEffect(() => {
    if (!loading && typeof window !== 'undefined' && window.location.hash) {
      document.querySelector(window.location.hash)?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [loading]);

  const printedBy = profile ? { prenom: profile.prenom, nom: profile.nom, role: roleLabels[profile.role] } : undefined;

  const bulk = async (from: string, patch: Record<string, unknown>, message: string) => {
    setSaving(true);
    const { data, error } = await supabase
      .from('analyses_laboratoire')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('demande_id', id)
      .eq('statut', from)
      .select('id');
    setSaving(false);
    if (error) {
      toast.error(explainDbError(error));
      return;
    }
    toast.success(`${message} (${data?.length || 0} examen(s))`);
    load();
  };

  const handlePrelevement = async () => {
    const ok = await confirm({
      title: 'Confirmer le prélèvement',
      message: 'Le prélèvement a-t-il été effectué pour tous les examens en attente de cette demande ?',
      confirmText: 'Oui, prélevé',
      type: 'info',
    });
    if (ok) bulk('demandé', { statut: 'prélevé', date_prelevement: new Date().toISOString(), technicien_id: profile?.id || null }, 'Prélèvement enregistré');
  };

  const handleDemarrerTout = () => bulk('prélevé', { statut: 'en_cours', technicien_id: profile?.id || null }, 'Analyses démarrées');

  const handleAnnulerDemande = async () => {
    const ok = await confirm({
      title: 'Annuler la demande',
      message: 'Tous les examens non encore validés de cette demande seront annulés. Continuer ?',
      confirmText: 'Oui, annuler',
      type: 'danger',
    });
    if (!ok) return;
    setSaving(true);
    const { error } = await supabase
      .from('analyses_laboratoire')
      .update({ statut: 'annulé', updated_at: new Date().toISOString() })
      .eq('demande_id', id)
      .in('statut', ['demandé', 'prélevé', 'en_cours']);
    setSaving(false);
    if (error) toast.error(explainDbError(error));
    else toast.success('Demande annulée.');
    load();
  };

  const handleAjouter = async () => {
    const examens = [...ajout, ...(ajoutAutre.trim() ? [ajoutAutre.trim()] : [])];
    if (!examens.length) {
      toast.error('Choisissez au moins un examen.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('analyses_laboratoire').insert(examens.map((type_analyse) => ({
      demande_id: id,
      patient_id: demande.patient_id,
      medecin_prescripteur_id: demande.medecin_prescripteur_id,
      consultation_id: demande.consultation_id,
      type_analyse,
      description: demande.renseignements,
      urgent: demande.urgent,
      statut: 'demandé',
    })));
    setSaving(false);
    if (error) {
      toast.error(explainDbError(error));
      return;
    }
    toast.success(`${examens.length} examen(s) ajouté(s) à la demande.`);
    setShowAjout(false);
    setAjout([]);
    setAjoutAutre('');
    load();
  };

  const print = async (kind: 'bon' | 'compte-rendu') => {
    try {
      const builder = kind === 'bon' ? buildLabRequestOrderPdf : buildLabRequestReportPdf;
      const pdf = await builder({ demande, analyses, printedBy, printedAt: new Date() });
      pdf.save(`${kind === 'bon' ? 'bon-examens' : 'compte-rendu'}-${demande.numero || demande.id}.pdf`);
    } catch (err) {
      console.error(err);
      toast.error('Impossible de générer le document.');
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}><Loader2 size={24} className="animate-spin" /></div>;
  }

  if (!demande) {
    return (
      <div className="empty-state" style={{ marginTop: 40 }}>
        <AlertCircle className="empty-state-icon" style={{ color: 'var(--danger)' }} />
        <h3>Demande introuvable</h3>
        <button className="btn btn-outline" onClick={() => router.push('/laboratoire')} style={{ marginTop: 16 }}>Retour au laboratoire</button>
      </div>
    );
  }

  const patient = demande.patients || {};
  const age = getAge(patient.date_naissance);
  const actifs = analyses.filter((a) => a.statut !== 'annulé');
  const valides = actifs.filter((a) => a.statut === 'terminé').length;
  const aPrelever = analyses.filter((a) => a.statut === 'demandé').length;
  const aDemarrer = analyses.filter((a) => a.statut === 'prélevé').length;
  const global = statutDemande(analyses);
  const st = statusBadge(LAB_STATUTS, global);
  const stepIndex = STEPS.findIndex((s) => s.key === global);
  const enCours = actifs.some((a) => a.statut !== 'terminé');
  const dejaDemandes = new Set(analyses.filter((a) => a.statut !== 'annulé').map((a) => a.type_analyse));

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.push('/laboratoire')} className="btn btn-ghost" title="Retour"><ArrowLeft size={18} /></button>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              Demande {demande.numero}
              {demande.urgent && <span className="badge badge-danger"><Siren size={12} /> Urgent</span>}
            </h1>
            <p className="page-subtitle">{actifs.length} examen(s) • demandé le {formatDateTime(demande.date_demande)}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className={`badge ${st.badge}`} style={{ fontSize: 13, padding: '6px 12px' }}>{st.label} • {valides}/{actifs.length}</span>
          <button className="btn btn-outline" onClick={() => print('bon')}><FileText size={16} /> Bon de demande</button>
          <button className="btn btn-primary" onClick={() => print('compte-rendu')} disabled={valides === 0} title={valides === 0 ? 'Aucun résultat validé' : undefined}>
            <Printer size={16} /> Compte rendu{valides > 0 && enCours ? ' (partiel)' : ''}
          </button>
        </div>
      </div>

      {/* Progression */}
      {global !== 'annulé' && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '18px 24px' }}>
            {STEPS.map((step, i) => {
              const done = i <= stepIndex;
              return (
                <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: i < STEPS.length - 1 ? 1 : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: done ? 'var(--primary-700)' : 'var(--neutral-400)', fontWeight: done ? 700 : 500, fontSize: 13, whiteSpace: 'nowrap' }}>
                    <span style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? 'var(--primary-500)' : 'var(--neutral-100)', color: done ? 'white' : 'var(--neutral-400)' }}>{step.icon}</span>
                    {step.label}
                  </div>
                  {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: i < stepIndex ? 'var(--primary-500)' : 'var(--neutral-200)' }} />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {canProcess && aPrelever > 0 && (
            <div className="alert alert-info" style={{ justifyContent: 'space-between' }}>
              <span>{aPrelever} examen(s) en attente de prélèvement.</span>
              <button className="btn btn-primary btn-sm" onClick={handlePrelevement} disabled={saving}><Syringe size={14} /> Confirmer le prélèvement</button>
            </div>
          )}
          {canProcess && aDemarrer > 0 && (
            <div className="alert alert-info" style={{ justifyContent: 'space-between' }}>
              <span>{aDemarrer} examen(s) prélevé(s), prêt(s) à analyser.</span>
              <button className="btn btn-primary btn-sm" onClick={handleDemarrerTout} disabled={saving}><Microscope size={14} /> Démarrer toutes les analyses</button>
            </div>
          )}

          {analyses.map((a) => (
            <AnalyseCard
              key={`${a.id}-${a.updated_at || ''}`}
              analyse={a}
              canProcess={canProcess}
              profileId={profile?.id}
              onChanged={load}
              onEditingChange={(e) => setEditingCount((c) => Math.max(0, c + (e ? 1 : -1)))}
            />
          ))}

          {canRequest && global !== 'annulé' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <button className="btn btn-outline" onClick={() => setShowAjout(true)}><Plus size={16} /> Ajouter un examen</button>
              {canProcess && enCours && (
                <button className="btn btn-ghost" onClick={handleAnnulerDemande} disabled={saving} style={{ color: 'var(--danger)' }}>
                  <XCircle size={16} /> Annuler la demande
                </button>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header"><span className="card-title"><User size={16} /> Patient</span></div>
            <div className="card-body">
              <div style={{ fontWeight: 700, fontSize: 15 }}>{patient.prenom} {patient.nom}</div>
              <div style={{ fontSize: 12, color: 'var(--neutral-500)', marginTop: 2 }}>
                {patient.code_patient} • {patient.sexe === 'M' ? 'Homme' : 'Femme'}{age !== null ? `, ${age} ans` : ''}
              </div>
              {patient.groupe_sanguin && <span className="badge badge-danger" style={{ marginTop: 8 }}>{patient.groupe_sanguin}</span>}
              {patient.allergies && <div className="alert alert-danger" style={{ marginTop: 10, fontSize: 12, padding: '8px 10px' }}>Allergies : {patient.allergies}</div>}
              {hasAccess(profile?.role || 'caissier', 'patients') && (
                <div style={{ marginTop: 12 }}><Link href={`/patients/${patient.id}`} style={{ fontSize: 12, color: 'var(--primary-600)', fontWeight: 500 }}>Voir le dossier &rarr;</Link></div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title"><Stethoscope size={16} /> Demande</span></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <div>
                <div style={{ color: 'var(--neutral-400)', fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Prescripteur</div>
                {demande.personnel ? `Dr. ${demande.personnel.prenom} ${demande.personnel.nom}` : '—'}
              </div>
              <div>
                <div style={{ color: 'var(--neutral-400)', fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Renseignements cliniques</div>
                <span style={{ whiteSpace: 'pre-wrap' }}>{demande.renseignements || '—'}</span>
              </div>
              {demande.consultation_id && hasAccess(profile?.role || 'caissier', 'consultations') && (
                <Link href={`/consultations/${demande.consultation_id}`} style={{ fontSize: 12, color: 'var(--primary-600)', fontWeight: 500 }}>Voir la consultation d&apos;origine &rarr;</Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={showAjout}
        title="Ajouter des examens à la demande"
        onClose={() => setShowAjout(false)}
        footer={(
          <>
            <button className="btn btn-outline" onClick={() => setShowAjout(false)}>Annuler</button>
            <button className="btn btn-primary" onClick={handleAjouter} disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Ajouter
            </button>
          </>
        )}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {LAB_CATALOGUE.filter((e) => !dejaDemandes.has(e.nom)).map((e) => (
            <label key={e.code} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--neutral-200)', cursor: 'pointer', background: ajout.includes(e.nom) ? 'var(--primary-50)' : 'white' }}>
              <input type="checkbox" checked={ajout.includes(e.nom)} onChange={() => setAjout((prev) => (prev.includes(e.nom) ? prev.filter((n) => n !== e.nom) : [...prev, e.nom]))} />
              {e.nom}
            </label>
          ))}
        </div>
        <div className="form-group">
          <label className="form-label">Autre examen (hors catalogue)</label>
          <input className="form-input" value={ajoutAutre} onChange={(e) => setAjoutAutre(e.target.value)} placeholder="Ex : Ionogramme sanguin" />
        </div>
      </Modal>
    </div>
  );
}
