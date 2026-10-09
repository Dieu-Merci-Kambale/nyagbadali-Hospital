'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, AlertCircle, FlaskConical, Syringe, Microscope, CheckCircle,
  Printer, Plus, Trash2, Save, XCircle, Edit, User, Stethoscope, Siren,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { roleLabels } from '@/lib/role-permissions';
import { buildLaboratoryDocumentPdf } from '@/lib/document-models';
import { findExamen } from '@/lib/lab-catalogue';
import { LAB_STATUTS, statusBadge, formatDateTime, getAge, explainDbError } from '@/lib/format';
import type { ParametreAnalyse } from '@/types';

const STEPS = [
  { key: 'demandé', label: 'Demandé', icon: <FlaskConical size={16} /> },
  { key: 'prélevé', label: 'Prélevé', icon: <Syringe size={16} /> },
  { key: 'en_cours', label: 'En analyse', icon: <Microscope size={16} /> },
  { key: 'terminé', label: 'Validé', icon: <CheckCircle size={16} /> },
];

const emptyParam = (): ParametreAnalyse => ({ nom: '', valeur: '', unite: '', reference: '', anormal: false });

export default function AnalyseDetailPage() {
  const router = useRouter();
  const { id } = useParams();
  const { profile } = useAuth();
  const { confirm } = useConfirm();

  const [analyse, setAnalyse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const [parametres, setParametres] = useState<ParametreAnalyse[]>([]);
  const [conclusion, setConclusion] = useState('');
  const [observations, setObservations] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('analyses_laboratoire')
      .select(`
        *,
        patients(*),
        personnel!analyses_laboratoire_medecin_prescripteur_id_fkey(nom, prenom, specialite),
        technicien:personnel!analyses_laboratoire_technicien_id_fkey(nom, prenom)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error(error);
      toast.error(explainDbError(error));
      setAnalyse(null);
    } else {
      setAnalyse(data);
      const saved: ParametreAnalyse[] = data.resultats?.parametres || [];
      const template = findExamen(data.type_analyse)?.parametres.map((p) => ({ ...p, valeur: '', anormal: false })) || [];
      setParametres(saved.length ? saved : template.length ? template : [emptyParam()]);
      setConclusion(data.resultats?.texte || '');
      setObservations(data.observations || '');
      setEditing(data.statut === 'en_cours');
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const update = async (patch: Record<string, unknown>, successMsg: string) => {
    setSaving(true);
    const { error } = await supabase.from('analyses_laboratoire').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    setSaving(false);
    if (error) {
      toast.error(explainDbError(error));
      return false;
    }
    toast.success(successMsg);
    await load();
    return true;
  };

  const handlePrelevement = async () => {
    const ok = await confirm({
      title: 'Confirmer le prélèvement',
      message: 'Le prélèvement a-t-il bien été effectué sur le patient ?',
      confirmText: 'Oui, prélevé',
      type: 'info',
    });
    if (!ok) return;
    await update({ statut: 'prélevé', date_prelevement: new Date().toISOString(), technicien_id: profile?.id || null }, 'Prélèvement enregistré.');
  };

  const handleDemarrer = async () => {
    await update({
      statut: 'en_cours',
      technicien_id: analyse.technicien_id || profile?.id || null,
      date_prelevement: analyse.date_prelevement || new Date().toISOString(),
    }, 'Analyse démarrée.');
  };

  const handleAnnuler = async () => {
    const ok = await confirm({
      title: 'Annuler la demande',
      message: "Cette demande d'analyse sera annulée. Continuer ?",
      confirmText: 'Oui, annuler la demande',
      type: 'danger',
    });
    if (!ok) return;
    await update({ statut: 'annulé' }, 'Demande annulée.');
  };

  const buildResultats = () => ({
    parametres: parametres.filter((p) => p.nom.trim() !== ''),
    texte: conclusion.trim(),
  });

  const handleSaveDraft = async () => {
    await update({ resultats: buildResultats(), observations: observations.trim() || null }, 'Résultats enregistrés (non validés).');
  };

  const handleValider = async () => {
    const res = buildResultats();
    if (!res.parametres.some((p) => p.valeur.trim() !== '') && !res.texte) {
      toast.error('Saisissez au moins une valeur ou une conclusion avant de valider.');
      return;
    }
    const ok = await confirm({
      title: 'Valider les résultats',
      message: 'Les résultats seront transmis au médecin prescripteur et ne seront plus modifiables sans action explicite. Valider ?',
      confirmText: 'Oui, valider',
      type: 'success',
    });
    if (!ok) return;
    const done = await update({
      statut: 'terminé',
      resultats: res,
      observations: observations.trim() || null,
      date_resultat: analyse.date_resultat || new Date().toISOString(),
      technicien_id: analyse.technicien_id || profile?.id || null,
    }, 'Résultats validés.');
    if (done) setEditing(false);
  };

  const handlePrint = async () => {
    try {
      const pdf = await buildLaboratoryDocumentPdf({
        analyse,
        printedBy: profile ? { prenom: profile.prenom, nom: profile.nom, role: roleLabels[profile.role] } : undefined,
        printedAt: new Date(),
      });
      pdf.save(`analyse-${analyse.patients?.code_patient || ''}-${analyse.type_analyse.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`);
    } catch (err) {
      console.error(err);
      toast.error("Impossible de générer le compte rendu.");
    }
  };

  const setParam = (index: number, patch: Partial<ParametreAnalyse>) => {
    setParametres((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
      </div>
    );
  }

  if (!analyse) {
    return (
      <div className="empty-state" style={{ marginTop: 40 }}>
        <AlertCircle className="empty-state-icon" style={{ color: 'var(--danger)' }} />
        <h3>Analyse introuvable</h3>
        <button className="btn btn-outline" onClick={() => router.push('/laboratoire')} style={{ marginTop: 16 }}>Retour au laboratoire</button>
      </div>
    );
  }

  const st = statusBadge(LAB_STATUTS, analyse.statut);
  const isAnnule = analyse.statut === 'annulé';
  const isTermine = analyse.statut === 'terminé';
  const stepIndex = STEPS.findIndex((s) => s.key === analyse.statut);
  const patient = analyse.patients || {};
  const age = getAge(patient.date_naissance);
  const showForm = editing && !isAnnule;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.push('/laboratoire')} className="btn btn-ghost" title="Retour">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {analyse.type_analyse}
              {analyse.urgent && <span className="badge badge-danger"><Siren size={12} /> Urgent</span>}
            </h1>
            <p className="page-subtitle">Demandé le {formatDateTime(analyse.date_demande)}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`badge ${st.badge}`} style={{ fontSize: 13, padding: '6px 12px' }}>{st.label}</span>
          {isTermine && (
            <button className="btn btn-primary" onClick={handlePrint}>
              <Printer size={16} /> Compte rendu PDF
            </button>
          )}
          {!isTermine && !isAnnule && (
            <button className="btn btn-outline" onClick={handleAnnuler} disabled={saving} style={{ color: 'var(--danger)' }}>
              <XCircle size={16} /> Annuler
            </button>
          )}
        </div>
      </div>

      {/* Progression */}
      {!isAnnule && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '18px 24px' }}>
            {STEPS.map((step, i) => {
              const done = i <= stepIndex;
              return (
                <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: i < STEPS.length - 1 ? 1 : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: done ? 'var(--primary-700)' : 'var(--neutral-400)', fontWeight: done ? 700 : 500, fontSize: 13, whiteSpace: 'nowrap' }}>
                    <span style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? 'var(--primary-500)' : 'var(--neutral-100)', color: done ? 'white' : 'var(--neutral-400)' }}>
                      {step.icon}
                    </span>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Actions du circuit */}
          {analyse.statut === 'demandé' && (
            <div className="alert alert-info" style={{ justifyContent: 'space-between' }}>
              <span>En attente de prélèvement sur le patient.</span>
              <button className="btn btn-primary btn-sm" onClick={handlePrelevement} disabled={saving}>
                <Syringe size={14} /> Confirmer le prélèvement
              </button>
            </div>
          )}
          {analyse.statut === 'prélevé' && (
            <div className="alert alert-info" style={{ justifyContent: 'space-between' }}>
              <span>Échantillon prélevé le {formatDateTime(analyse.date_prelevement)}.</span>
              <button className="btn btn-primary btn-sm" onClick={handleDemarrer} disabled={saving}>
                <Microscope size={14} /> Démarrer l&apos;analyse
              </button>
            </div>
          )}

          {/* Résultats */}
          <div className="card">
            <div className="card-header">
              <span className="card-title"><Microscope size={16} /> Résultats</span>
              {isTermine && !editing && (
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
                  <Edit size={14} /> Corriger
                </button>
              )}
            </div>
            <div className="card-body">
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
                          <td><input className="form-input" value={p.nom} onChange={(e) => setParam(i, { nom: e.target.value })} placeholder="Ex : Hémoglobine" /></td>
                          <td><input className="form-input" value={p.valeur} onChange={(e) => setParam(i, { valeur: e.target.value })} style={{ fontWeight: 700 }} /></td>
                          <td><input className="form-input" value={p.unite || ''} onChange={(e) => setParam(i, { unite: e.target.value })} /></td>
                          <td><input className="form-input" value={p.reference || ''} onChange={(e) => setParam(i, { reference: e.target.value })} /></td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="checkbox" checked={!!p.anormal} onChange={(e) => setParam(i, { anormal: e.target.checked })} />
                          </td>
                          <td>
                            <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', padding: 4 }} onClick={() => setParametres((prev) => prev.filter((_, j) => j !== i))} title="Supprimer la ligne">
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setParametres((prev) => [...prev, emptyParam()])} style={{ marginBottom: 20 }}>
                    <Plus size={14} /> Ajouter un paramètre
                  </button>

                  <div className="form-group">
                    <label className="form-label">Conclusion / Résultat global</label>
                    <textarea className="form-textarea" rows={3} value={conclusion} onChange={(e) => setConclusion(e.target.value)} placeholder="Ex : Goutte épaisse positive à P. falciparum." />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Observations du technicien / biologiste</label>
                    <textarea className="form-textarea" rows={2} value={observations} onChange={(e) => setObservations(e.target.value)} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    {isTermine && (
                      <button type="button" className="btn btn-outline" onClick={() => { setEditing(false); load(); }}>Annuler la correction</button>
                    )}
                    {!isTermine && (
                      <button type="button" className="btn btn-outline" onClick={handleSaveDraft} disabled={saving}>
                        <Save size={16} /> Enregistrer le brouillon
                      </button>
                    )}
                    <button type="button" className="btn btn-success" onClick={handleValider} disabled={saving}>
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />} Valider les résultats
                    </button>
                  </div>
                </>
              ) : analyse.resultats && ((analyse.resultats.parametres || []).length > 0 || analyse.resultats.texte) ? (
                <>
                  {(analyse.resultats.parametres || []).length > 0 && (
                    <table className="data-table" style={{ marginBottom: 16 }}>
                      <thead>
                        <tr><th>Paramètre</th><th>Résultat</th><th>Valeurs de référence</th></tr>
                      </thead>
                      <tbody>
                        {analyse.resultats.parametres.map((p: ParametreAnalyse, i: number) => (
                          <tr key={i} style={{ background: p.anormal ? 'var(--danger-50)' : undefined }}>
                            <td style={{ fontWeight: 600 }}>{p.nom}</td>
                            <td style={{ fontWeight: 700, color: p.anormal ? 'var(--danger-600)' : 'var(--neutral-900)' }}>
                              {p.valeur || '—'} {p.unite}{p.anormal ? ' ⚠' : ''}
                            </td>
                            <td style={{ color: 'var(--neutral-500)' }}>{p.reference || '—'} {p.reference ? p.unite : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {analyse.resultats.texte && (
                    <div style={{ padding: 14, background: 'var(--primary-50)', borderRadius: 8, borderLeft: '4px solid var(--primary-500)', fontWeight: 600 }}>
                      {analyse.resultats.texte}
                    </div>
                  )}
                  {analyse.observations && (
                    <p style={{ marginTop: 12, fontSize: 13, color: 'var(--neutral-600)', fontStyle: 'italic' }}>Observations : {analyse.observations}</p>
                  )}
                </>
              ) : (
                <p style={{ color: 'var(--neutral-500)', textAlign: 'center', padding: '20px 0' }}>
                  {isAnnule ? 'Demande annulée.' : 'Les résultats pourront être saisis une fois l\'analyse démarrée.'}
                </p>
              )}
            </div>
          </div>

          {analyse.description && (
            <div className="card">
              <div className="card-header"><span className="card-title">Renseignements cliniques</span></div>
              <div className="card-body" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{analyse.description}</div>
            </div>
          )}
        </div>

        {/* Colonne latérale */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header"><span className="card-title"><User size={16} /> Patient</span></div>
            <div className="card-body">
              <div style={{ fontWeight: 700, fontSize: 15 }}>{patient.prenom} {patient.nom}</div>
              <div style={{ fontSize: 12, color: 'var(--neutral-500)', marginTop: 2 }}>
                {patient.code_patient} • {patient.sexe === 'M' ? 'Homme' : 'Femme'}{age !== null ? `, ${age} ans` : ''}
              </div>
              {patient.groupe_sanguin && <span className="badge badge-danger" style={{ marginTop: 8 }}>{patient.groupe_sanguin}</span>}
              <div style={{ marginTop: 12 }}>
                <Link href={`/patients/${patient.id}`} style={{ fontSize: 12, color: 'var(--primary-600)', fontWeight: 500 }}>Voir le dossier &rarr;</Link>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title"><Stethoscope size={16} /> Traçabilité</span></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <div>
                <div style={{ color: 'var(--neutral-400)', fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Prescripteur</div>
                {analyse.personnel ? `Dr. ${analyse.personnel.prenom} ${analyse.personnel.nom}` : '—'}
              </div>
              <div>
                <div style={{ color: 'var(--neutral-400)', fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Technicien</div>
                {analyse.technicien ? `${analyse.technicien.prenom} ${analyse.technicien.nom}` : '—'}
              </div>
              <div>
                <div style={{ color: 'var(--neutral-400)', fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Prélèvement</div>
                {formatDateTime(analyse.date_prelevement)}
              </div>
              <div>
                <div style={{ color: 'var(--neutral-400)', fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Validation</div>
                {formatDateTime(analyse.date_resultat)}
              </div>
              {analyse.consultation_id && (
                <Link href={`/consultations/${analyse.consultation_id}`} style={{ fontSize: 12, color: 'var(--primary-600)', fontWeight: 500 }}>
                  Voir la consultation d&apos;origine &rarr;
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
