'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, AlertCircle, BedDouble, User, Calendar, Stethoscope, Printer,
  Receipt, LogOut, ArrowRightLeft, Plus, Thermometer, HeartPulse, Activity, Wind, ClipboardList,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { roleLabels, hasAccess } from '@/lib/role-permissions';
import { buildAdmissionDocumentPdf } from '@/lib/document-models';
import Modal from '@/components/ui/Modal';
import MedicalAlerts from '@/components/patients/MedicalAlerts';
import { HOSP_STATUTS, SUIVI_TYPES, statusBadge, formatDate, formatTime, formatDateTime, getAge, daysBetween, explainDbError } from '@/lib/format';

const CONSTANTES_SUIVI = [
  { name: 'temperature', label: 'Temp. (°C)', icon: <Thermometer size={14} /> },
  { name: 'tension', label: 'TA (mmHg)', icon: <HeartPulse size={14} /> },
  { name: 'pouls', label: 'Pouls (bpm)', icon: <Activity size={14} /> },
  { name: 'saturation_o2', label: 'SpO₂ (%)', icon: <Wind size={14} /> },
];

export default function HospitalisationDetailPage() {
  const router = useRouter();
  const { id } = useParams();
  const { profile } = useAuth();
  const { confirm } = useConfirm();

  const [hosp, setHosp] = useState<any>(null);
  const [suivis, setSuivis] = useState<any[]>([]);
  const [suiviError, setSuiviError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState('tous');

  const [showTransfer, setShowTransfer] = useState(false);
  const [litsDispo, setLitsDispo] = useState<any[]>([]);
  const [newLitId, setNewLitId] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('hospitalisations')
      .select(`
        *,
        patients(*),
        lits(id, numero, type_lit, chambres(numero, etage, type)),
        medecin:personnel(id, nom, prenom, specialite)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error(error);
      setHosp(null);
      setLoading(false);
      return;
    }
    setHosp(data);

    const { data: sData, error: sError } = await supabase
      .from('suivis_hospitalisation')
      .select('*, auteur:personnel(nom, prenom, role)')
      .eq('hospitalisation_id', id)
      .order('date_suivi', { ascending: false });
    if (sError) {
      setSuiviError(explainDbError(sError));
    } else {
      setSuiviError('');
      setSuivis(sData || []);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAddSuivi = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const constantes: Record<string, string> = {};
    CONSTANTES_SUIVI.forEach((c) => {
      const v = ((formData.get(c.name) as string) || '').trim();
      if (v) constantes[c.name] = v.replace(',', '.');
    });
    const note = ((formData.get('note') as string) || '').trim();
    if (!note && Object.keys(constantes).length === 0) {
      toast.error('Saisissez une note ou au moins une constante.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('suivis_hospitalisation').insert([{
      hospitalisation_id: id,
      auteur_id: profile?.id || null,
      type: formData.get('type') as string,
      constantes: Object.keys(constantes).length ? constantes : null,
      note: note || null,
      date_suivi: new Date().toISOString(),
    }]);
    setSaving(false);
    if (error) {
      toast.error(explainDbError(error));
      return;
    }
    form.reset();
    toast.success('Suivi enregistré.');
    load();
  };

  const openTransfer = async () => {
    const { data } = await supabase
      .from('lits')
      .select('id, numero, type_lit, chambres(numero, etage, type)')
      .eq('statut', 'disponible')
      .order('numero');
    setLitsDispo(data || []);
    setNewLitId('');
    setShowTransfer(true);
  };

  const handleTransfer = async () => {
    const target = litsDispo.find((l) => l.id === newLitId);
    if (!target) return;
    setSaving(true);
    // Changement de lit, libération de l'ancien et note de suivi en une seule transaction
    const { error } = await supabase.rpc('transferer_lit', {
      p_hospitalisation_id: id,
      p_nouveau_lit_id: newLitId,
      p_note: `Transfert de lit : ${hosp.lits ? `Ch. ${hosp.lits.chambres?.numero} / ${hosp.lits.numero}` : 'aucun lit'} → Ch. ${target.chambres?.numero} / ${target.numero}`,
    });
    setSaving(false);
    if (error) {
      toast.error(explainDbError(error));
      return;
    }
    setShowTransfer(false);
    toast.success('Patient transféré vers le nouveau lit.');
    load();
  };

  const handlePrint = async () => {
    try {
      const pdf = await buildAdmissionDocumentPdf({
        hospitalisation: hosp,
        printedBy: profile ? { prenom: profile.prenom, nom: profile.nom, role: roleLabels[profile.role] } : undefined,
        printedAt: new Date(),
      });
      pdf.save(`admission-${hosp.patients?.code_patient || hosp.id}.pdf`);
    } catch (err) {
      console.error(err);
      toast.error("Impossible de générer le bulletin d'admission.");
    }
  };

  // Les journées déjà facturées sont déduites automatiquement par la base
  const handleFacturer = () => {
    router.push(`/facturation/nouvelle?hospitalisation_id=${id}`);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
      </div>
    );
  }

  if (!hosp) {
    return (
      <div className="empty-state" style={{ marginTop: 40 }}>
        <AlertCircle className="empty-state-icon" style={{ color: 'var(--danger)' }} />
        <h3>Dossier introuvable</h3>
        <button className="btn btn-outline" onClick={() => router.push('/hospitalisation')} style={{ marginTop: 16 }}>Retour</button>
      </div>
    );
  }

  const st = statusBadge(HOSP_STATUTS, hosp.statut);
  const isActif = hosp.statut === 'actif';
  const patient = hosp.patients || {};
  const age = getAge(patient.date_naissance);
  const jours = daysBetween(hosp.date_admission, hosp.date_sortie || new Date());
  const visibleSuivis = suivis.filter((s) => filterType === 'tous' || s.type === filterType);
  const canBill = profile ? hasAccess(profile.role, 'facturation') : false;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.push('/hospitalisation')} className="btn btn-ghost" title="Retour">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {patient.prenom} {patient.nom}
              <span className={`badge ${st.badge}`}>{st.label}</span>
              {hosp.type_admission === 'urgence' && <span className="badge badge-danger">Urgence</span>}
            </h1>
            <p className="page-subtitle">Séjour hospitalier • {patient.code_patient}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={handlePrint}><Printer size={16} /> Bulletin d&apos;admission</button>
          {canBill && <button className="btn btn-outline" onClick={handleFacturer}><Receipt size={16} /> Facturer le séjour</button>}
          {isActif && <button className="btn btn-outline" onClick={openTransfer}><ArrowRightLeft size={16} /> Changer de lit</button>}
          <Link href={`/hospitalisation/${hosp.id}/edit`} className="btn btn-primary">
            <LogOut size={16} /> {isActif ? 'Gérer / Sortie' : 'Dossier de sortie'}
          </Link>
        </div>
      </div>

      <MedicalAlerts allergies={patient.allergies} antecedents={patient.antecedents} />

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-card-icon blue"><User size={22} /></div>
          <div className="stat-card-info">
            <h3>Patient</h3>
            <div style={{ fontWeight: 700 }}>{patient.sexe === 'M' ? 'Homme' : 'Femme'}{age !== null ? `, ${age} ans` : ''}</div>
            <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>Groupe : {patient.groupe_sanguin || '?'}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon orange"><BedDouble size={22} /></div>
          <div className="stat-card-info">
            <h3>Lit</h3>
            {hosp.lits ? (
              <>
                <div style={{ fontWeight: 700 }}>Ch. {hosp.lits.chambres?.numero} — {hosp.lits.numero}</div>
                <div style={{ fontSize: 12, color: 'var(--neutral-500)', textTransform: 'capitalize' }}>{String(hosp.lits.type_lit || '').replace('_', ' ')}</div>
              </>
            ) : <div style={{ fontWeight: 700, color: 'var(--danger)' }}>Aucun lit</div>}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon green"><Calendar size={22} /></div>
          <div className="stat-card-info">
            <h3>Durée du séjour</h3>
            <div className="stat-value">{jours} j</div>
            <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>depuis le {formatDate(hosp.date_admission)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon purple"><Stethoscope size={22} /></div>
          <div className="stat-card-info">
            <h3>Médecin responsable</h3>
            <div style={{ fontWeight: 700 }}>{hosp.medecin ? `Dr. ${hosp.medecin.prenom} ${hosp.medecin.nom}` : 'Non assigné'}</div>
            {hosp.medecin?.specialite && <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{hosp.medecin.specialite}</div>}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        {/* Suivi journalier */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {isActif && (
            <div className="card">
              <div className="card-header"><span className="card-title"><Plus size={16} /> Nouvelle entrée de suivi</span></div>
              <div className="card-body">
                {suiviError ? (
                  <div className="alert alert-warning"><AlertCircle size={18} /> {suiviError}</div>
                ) : (
                  <form onSubmit={handleAddSuivi}>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Type</label>
                        <select name="type" className="form-select" defaultValue={profile?.role?.startsWith('infirmier') ? 'soin' : 'observation'}>
                          {Object.entries(SUIVI_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </div>
                      {CONSTANTES_SUIVI.map((c) => (
                        <div className="form-group" key={c.name}>
                          <label className="form-label">{c.label}</label>
                          <input name={c.name} className="form-input" inputMode={c.name === 'tension' ? 'text' : 'decimal'} />
                        </div>
                      ))}
                    </div>
                    <div className="form-group">
                      <label className="form-label">Note</label>
                      <textarea name="note" className="form-textarea" rows={3} placeholder="Évolution clinique, soins réalisés, traitement administré, consignes..."></textarea>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="submit" className="btn btn-primary" disabled={saving}>
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Ajouter au dossier
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <span className="card-title"><ClipboardList size={16} /> Suivi du séjour ({suivis.length})</span>
              <select className="form-select" style={{ width: 200, padding: '6px 10px', fontSize: 13 }} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="tous">Toutes les entrées</option>
                {Object.entries(SUIVI_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="card-body">
              {visibleSuivis.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--neutral-500)', padding: '16px 0' }}>Aucune entrée de suivi pour le moment.</p>
              ) : (
                <div className="timeline">
                  {visibleSuivis.map((s) => {
                    const t = statusBadge(SUIVI_TYPES, s.type);
                    return (
                      <div key={s.id} className="timeline-item">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                          <span className={`badge ${t.badge}`}>{t.label}</span>
                          <span style={{ fontSize: 12, color: 'var(--neutral-500)' }}>
                            {formatDate(s.date_suivi)} à {formatTime(s.date_suivi)}
                            {s.auteur ? ` • ${s.auteur.role?.startsWith('medecin') ? 'Dr. ' : ''}${s.auteur.prenom} ${s.auteur.nom}` : ''}
                          </span>
                        </div>
                        {s.constantes && (
                          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
                            {CONSTANTES_SUIVI.filter((c) => s.constantes[c.name]).map((c) => (
                              <span key={c.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, background: 'var(--neutral-50)', padding: '4px 10px', borderRadius: 6 }}>
                                {c.icon} {c.label.split(' ')[0]} {String(s.constantes[c.name]).replace('.', ',')}
                              </span>
                            ))}
                          </div>
                        )}
                        {s.note && <p style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--neutral-700)' }}>{s.note}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Informations médicales */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header"><span className="card-title">Admission</span></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--neutral-400)', fontWeight: 600, textTransform: 'uppercase' }}>Date d&apos;admission</div>
                {formatDateTime(hosp.date_admission)}
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--neutral-400)', fontWeight: 600, textTransform: 'uppercase' }}>Type</div>
                <span style={{ textTransform: 'capitalize' }}>{hosp.type_admission || '—'}</span>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--neutral-400)', fontWeight: 600, textTransform: 'uppercase' }}>Motif</div>
                {hosp.motif_admission}
              </div>
              {hosp.diagnostic_entree && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--neutral-400)', fontWeight: 600, textTransform: 'uppercase' }}>Diagnostic d&apos;entrée</div>
                  <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{hosp.diagnostic_entree}</span>
                </div>
              )}
            </div>
          </div>

          {!isActif && (
            <div className="card">
              <div className="card-header"><span className="card-title">Sortie</span></div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--neutral-400)', fontWeight: 600, textTransform: 'uppercase' }}>Date de sortie</div>
                  {formatDateTime(hosp.date_sortie)}
                </div>
                {hosp.diagnostic_sortie && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--neutral-400)', fontWeight: 600, textTransform: 'uppercase' }}>Diagnostic de sortie</div>
                    <span style={{ fontWeight: 600 }}>{hosp.diagnostic_sortie}</span>
                  </div>
                )}
                {hosp.resume_sortie && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--neutral-400)', fontWeight: 600, textTransform: 'uppercase' }}>Résumé</div>
                    <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{hosp.resume_sortie}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <Link href={`/patients/${patient.id}`} className="btn btn-outline" style={{ justifyContent: 'center' }}>
            Voir le dossier patient
          </Link>
        </div>
      </div>

      <Modal
        open={showTransfer}
        title="Changer de lit"
        onClose={() => setShowTransfer(false)}
        footer={(
          <>
            <button className="btn btn-outline" onClick={() => setShowTransfer(false)}>Annuler</button>
            <button className="btn btn-primary" onClick={handleTransfer} disabled={!newLitId || saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <ArrowRightLeft size={16} />} Transférer
            </button>
          </>
        )}
      >
        {litsDispo.length === 0 ? (
          <div className="alert alert-warning"><AlertCircle size={18} /> Aucun autre lit disponible actuellement.</div>
        ) : (
          <div className="form-group">
            <label className="form-label">Nouveau lit</label>
            <select className="form-select" value={newLitId} onChange={(e) => setNewLitId(e.target.value)}>
              <option value="">Sélectionnez un lit disponible...</option>
              {litsDispo.map((l) => (
                <option key={l.id} value={l.id}>
                  Chambre {l.chambres?.numero} ({l.chambres?.type}) — Lit {l.numero} ({String(l.type_lit || '').replace('_', ' ')})
                </option>
              ))}
            </select>
            <p className="form-help">L&apos;ancien lit sera libéré et le transfert sera noté dans le suivi du séjour.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
