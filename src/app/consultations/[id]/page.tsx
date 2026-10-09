'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, FileText, Printer, Loader2, AlertCircle, Edit, FileSignature, FlaskConical,
  CalendarPlus, BedDouble, Receipt, XCircle, ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { roleLabels, hasAccess } from '@/lib/role-permissions';
import { buildConsultationDocumentPdf, buildPrescriptionDocumentPdf } from '@/lib/document-models';
import MedicalAlerts from '@/components/patients/MedicalAlerts';
import { LAB_STATUTS, statusBadge, toDateKey, formatDateTime } from '@/lib/format';

const sectionTitle: React.CSSProperties = { fontSize: 12, textTransform: 'uppercase', color: 'var(--neutral-400)', fontWeight: 600, marginBottom: 8 };

export default function ConsultationDetailsPage() {
  const { id } = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const { confirm } = useConfirm();

  const [consultation, setConsultation] = useState<any>(null);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordonnanceDate, setOrdonnanceDate] = useState('');
  const [printingOrdonnance, setPrintingOrdonnance] = useState(false);

  const fetchDetails = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('consultations')
      .select(`
        *,
        patients (id, nom, prenom, code_patient, date_naissance, sexe),
        personnel (nom, prenom, specialite)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error(error);
    } else {
      setConsultation(data);

      const [{ data: presData }, { data: labData }] = await Promise.all([
        supabase
          .from('prescriptions')
          .select('*, medicament:medicaments(nom_commercial, forme)')
          .eq('consultation_id', id)
          .order('created_at', { ascending: false }),
        // Silencieux si la table du laboratoire n'existe pas encore
        supabase
          .from('analyses_laboratoire')
          .select('id, type_analyse, statut, urgent, date_demande, resultats')
          .eq('consultation_id', id)
          .order('date_demande', { ascending: false }),
      ]);
      setPrescriptions(presData || []);
      setAnalyses(labData || []);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Loader2 size={24} className="animate-spin text-primary-500" />
      </div>
    );
  }

  if (!consultation) {
    return (
      <div className="empty-state" style={{ marginTop: 40 }}>
        <AlertCircle className="empty-state-icon" style={{ color: 'var(--danger)' }} />
        <h3>Consultation introuvable</h3>
        <p>Ce dossier n&apos;existe pas ou a été supprimé.</p>
        <button className="btn btn-outline" onClick={() => router.push('/consultations')} style={{ marginTop: 16 }}>
          Retour
        </button>
      </div>
    );
  }

  const printedBy = profile ? { prenom: profile.prenom, nom: profile.nom, role: roleLabels[profile.role] || profile.role } : undefined;
  const can = (module: Parameters<typeof hasAccess>[1]) => (profile ? hasAccess(profile.role, module) : false);

  const handleDownloadPdf = async () => {
    const pdf = await buildConsultationDocumentPdf({ consultation, prescriptions, printedBy, printedAt: new Date() });
    pdf.save(`consultation-${consultation.patients?.code_patient || consultation.id}.pdf`);
  };

  // Dates disponibles pour l'ordonnance (prescriptions non annulées), la plus récente en premier
  const prescriptionsActives = prescriptions.filter((p) => p.statut !== 'annulée');
  const ordonnanceDates = Array.from(
    new Set(prescriptionsActives.map((p) => toDateKey(p.created_at || consultation.date_consultation)))
  ).sort((a, b) => b.localeCompare(a));
  const selectedOrdonnanceDate = ordonnanceDates.includes(ordonnanceDate) ? ordonnanceDate : ordonnanceDates[0] || '';

  const formatDateKey = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const handlePrintOrdonnance = async () => {
    if (!selectedOrdonnanceDate) return;
    setPrintingOrdonnance(true);
    try {
      const items = prescriptionsActives
        .filter((p) => toDateKey(p.created_at || consultation.date_consultation) === selectedOrdonnanceDate)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const [y, m, d] = selectedOrdonnanceDate.split('-').map(Number);
      const pdf = await buildPrescriptionDocumentPdf({
        consultation,
        prescriptions: items,
        prescriptionDate: new Date(y, m - 1, d),
        printedBy,
        printedAt: new Date(),
      });
      pdf.save(`ordonnance-${consultation.patients?.code_patient || consultation.id}-${selectedOrdonnanceDate}.pdf`);
    } catch (err) {
      console.error(err);
      toast.error("Impossible de générer l'ordonnance.");
    } finally {
      setPrintingOrdonnance(false);
    }
  };

  const handleAnnulerPrescription = async (pres: any) => {
    const ok = await confirm({
      title: 'Annuler la prescription',
      message: `Retirer ${pres.medicament?.nom_commercial || pres.nom_medicament} de l'ordonnance ? La pharmacie ne pourra plus le délivrer.`,
      confirmText: 'Oui, annuler',
      type: 'danger',
    });
    if (!ok) return;
    const { error } = await supabase.from('prescriptions').update({ statut: 'annulée' }).eq('id', pres.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Prescription annulée.');
    setPrescriptions((prev) => prev.map((p) => (p.id === pres.id ? { ...p, statut: 'annulée' } : p)));
  };

  const k = consultation.constantes || {};
  const tension = k.tension || (k.tension_systolique ? `${k.tension_systolique}/${k.tension_diastolique}` : '');
  const poids = parseFloat(k.poids);
  const taille = parseFloat(k.taille) / 100;
  const imc = poids > 0 && taille > 0 ? (poids / (taille * taille)).toFixed(1).replace('.', ',') : null;
  const constantesRows = [
    { label: 'Poids', value: k.poids && `${k.poids} kg` },
    { label: 'Taille', value: k.taille && `${k.taille} cm` },
    { label: 'IMC', value: imc },
    { label: 'Température', value: k.temperature && `${String(k.temperature).replace('.', ',')} °C` },
    { label: 'Tension', value: tension && `${tension} mmHg` },
    { label: 'Pouls', value: k.pouls && `${k.pouls} bpm` },
    { label: 'Saturation O₂', value: k.saturation_o2 && `${k.saturation_o2} %` },
  ].filter((r) => r.value);

  const statutBadge = consultation.statut === 'terminée' ? 'badge-success' : consultation.statut === 'annulée' ? 'badge-danger' : 'badge-warning';
  const patientId = consultation.patients?.id;

  const quickActions = [
    can('laboratoire') && { href: `/laboratoire/nouveau?patient_id=${patientId}&consultation_id=${consultation.id}`, label: 'Demander une analyse', icon: <FlaskConical size={16} /> },
    can('rendez-vous') && { href: `/rendez-vous/nouveau?patient_id=${patientId}&type=suivi&motif=${encodeURIComponent(`Suivi : ${consultation.motif || ''}`)}`, label: 'Programmer un suivi', icon: <CalendarPlus size={16} /> },
    can('hospitalisation') && { href: `/hospitalisation/nouvelle?patient_id=${patientId}&motif=${encodeURIComponent(consultation.diagnostic_principal || consultation.motif || '')}`, label: 'Hospitaliser', icon: <BedDouble size={16} /> },
    can('facturation') && { href: `/facturation/nouvelle?consultation_id=${consultation.id}`, label: 'Facturer', icon: <Receipt size={16} /> },
  ].filter(Boolean) as { href: string; label: string; icon: React.ReactNode }[];

  return (
    <div id="consultation-pdf-export" className="animate-fade-in print-document">
      <div className="print-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, overflow: 'hidden', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(15, 23, 42, 0.08)' }}>
            <Image src="/logo.png" alt="Logo Nyagbadali" width={52} height={52} unoptimized style={{ objectFit: 'cover' }} />
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a' }}>Nyagbadali</div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#64748b' }}>Système de gestion hospitalière</div>
          </div>
        </div>
        <div style={{ textAlign: 'right', color: '#475569' }}>
          <div style={{ fontWeight: 700 }}>Fiche de consultation</div>
          <div style={{ fontSize: 12 }}>{new Date(consultation.date_consultation).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
        </div>
      </div>

      {/* En-tête */}
      <div className="page-header hide-on-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <button className="btn btn-ghost" onClick={() => router.back()} style={{ padding: 8, borderRadius: '50%' }}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">Détails de la consultation</h1>
            <p className="page-subtitle">
              {new Date(consultation.date_consultation).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/consultations/${consultation.id}/edit`} className="btn btn-primary">
            <Edit size={16} /> {consultation.statut === 'en_cours' ? 'Terminer / Modifier' : 'Modifier'}
          </Link>
          <button className="btn btn-outline" onClick={handleDownloadPdf}>
            <Printer size={16} /> Télécharger PDF
          </button>
        </div>
      </div>

      {/* Actions rapides */}
      {quickActions.length > 0 && consultation.statut !== 'annulée' && (
        <div className="hide-on-print" style={{ display: 'grid', gridTemplateColumns: `repeat(${quickActions.length}, 1fr)`, gap: 12, marginBottom: 20 }}>
          {quickActions.map((a) => (
            <Link key={a.href} href={a.href} className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'var(--neutral-800)', fontWeight: 600, fontSize: 14 }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--primary-50)', color: 'var(--primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{a.icon}</span>
              {a.label}
              <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--neutral-400)' }} />
            </Link>
          ))}
        </div>
      )}

      {patientId && <MedicalAlerts patientId={patientId} />}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title"><FileText size={16} /> Rapport clinique</span>
              <span className={`badge ${statutBadge}`}>{consultation.statut}</span>
            </div>
            <div className="card-body">
              <div style={{ marginBottom: 20 }}>
                <h4 style={sectionTitle}>Motif de consultation</h4>
                <p style={{ fontSize: 16, fontWeight: 500 }}>{consultation.motif}</p>
              </div>

              {consultation.anamnese && (
                <div style={{ marginBottom: 20 }}>
                  <h4 style={sectionTitle}>Anamnèse</h4>
                  <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{consultation.anamnese}</p>
                </div>
              )}

              {consultation.examen_physique?.texte && (
                <div style={{ marginBottom: 20 }}>
                  <h4 style={sectionTitle}>Examen physique</h4>
                  <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{consultation.examen_physique.texte}</p>
                </div>
              )}

              {consultation.diagnostic_principal && (
                <div style={{ marginBottom: 20 }}>
                  <h4 style={sectionTitle}>Diagnostic</h4>
                  <p style={{ fontSize: 15, color: 'var(--danger)', fontWeight: 600 }}>{consultation.diagnostic_principal}</p>
                </div>
              )}

              {consultation.plan_traitement && (
                <div style={{ marginBottom: 20 }}>
                  <h4 style={sectionTitle}>Conduite à tenir</h4>
                  <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{consultation.plan_traitement}</p>
                </div>
              )}

              {consultation.notes_privees && (
                <div>
                  <h4 style={sectionTitle}>Notes du médecin</h4>
                  <div style={{ padding: 16, background: 'var(--neutral-50)', borderRadius: 8, border: '1px solid var(--neutral-100)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                    {consultation.notes_privees}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ORDONNANCE */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="card-title">Ordonnance & prescriptions</span>
              <Link href={`/consultations/${consultation.id}/prescriptions/nouvelle`} className="btn btn-primary btn-sm">
                + Prescrire un médicament
              </Link>
            </div>
            {ordonnanceDates.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '12px 20px', borderBottom: '1px solid var(--neutral-100)', background: 'var(--neutral-50)' }}>
                <FileSignature size={16} style={{ color: 'var(--primary-600)' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--neutral-700)' }}>Ordonnance du</span>
                <select
                  className="form-select"
                  style={{ width: 'auto', minWidth: 220, padding: '6px 10px', fontSize: 13 }}
                  value={selectedOrdonnanceDate}
                  onChange={(e) => setOrdonnanceDate(e.target.value)}
                >
                  {ordonnanceDates.map((key) => {
                    const count = prescriptionsActives.filter((p) => toDateKey(p.created_at || consultation.date_consultation) === key).length;
                    return (
                      <option key={key} value={key}>
                        {formatDateKey(key)} ({count} médicament{count > 1 ? 's' : ''})
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ marginLeft: 'auto' }}
                  onClick={handlePrintOrdonnance}
                  disabled={printingOrdonnance}
                >
                  {printingOrdonnance ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} Imprimer l&apos;ordonnance
                </button>
              </div>
            )}
            <div className="card-body">
              {prescriptions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--neutral-500)' }}>
                  <p>Aucune prescription pour cette consultation.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {prescriptions.map((pres) => (
                    <div key={pres.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: 16, border: '1px solid var(--neutral-200)', borderRadius: 8, opacity: pres.statut === 'annulée' ? 0.55 : 1 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--neutral-900)', textDecoration: pres.statut === 'annulée' ? 'line-through' : 'none' }}>
                          {pres.medicament?.nom_commercial || pres.nom_medicament}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--neutral-600)', marginTop: 4 }}>
                          {pres.dosage && <span>{pres.dosage} - </span>}
                          {pres.voie_administration && <span style={{ textTransform: 'capitalize' }}>Voie {pres.voie_administration} - </span>}
                          {pres.frequence} pendant {pres.duree}
                        </div>
                        {pres.instructions && (
                          <div style={{ fontSize: 12, color: 'var(--neutral-500)', marginTop: 8, fontStyle: 'italic' }}>
                            Instructions : {pres.instructions}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className={`badge ${pres.statut === 'active' ? 'badge-info' : pres.statut === 'dispensée' ? 'badge-success' : 'badge-neutral'}`}>
                          {pres.statut === 'active' ? 'En attente' : pres.statut === 'dispensée' ? 'Dispensée' : 'Annulée'}
                        </span>
                        {pres.statut === 'active' && (
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', padding: 4 }} title="Annuler la prescription" onClick={() => handleAnnulerPrescription(pres)}>
                            <XCircle size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ANALYSES */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="card-title"><FlaskConical size={16} /> Examens de laboratoire</span>
              {can('laboratoire') && (
                <Link href={`/laboratoire/nouveau?patient_id=${patientId}&consultation_id=${consultation.id}`} className="btn btn-outline btn-sm">
                  + Demander une analyse
                </Link>
              )}
            </div>
            <div className="card-body">
              {analyses.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '12px 0', color: 'var(--neutral-500)' }}>Aucun examen demandé lors de cette consultation.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {analyses.map((a) => {
                    const st = statusBadge(LAB_STATUTS, a.statut);
                    const anomalies = (a.resultats?.parametres || []).filter((p: any) => p.anormal).length;
                    const content = (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', border: '1px solid var(--neutral-200)', borderRadius: 8 }}>
                        <div>
                          <div style={{ fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center' }}>
                            {a.type_analyse}
                            {a.urgent && <span className="badge badge-danger">Urgent</span>}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--neutral-500)', marginTop: 2 }}>
                            Demandé le {formatDateTime(a.date_demande)}
                            {a.resultats?.texte ? ` • ${a.resultats.texte}` : ''}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {anomalies > 0 && <span className="badge badge-danger">{anomalies} anomalie{anomalies > 1 ? 's' : ''}</span>}
                          <span className={`badge ${st.badge}`}>{st.label}</span>
                        </div>
                      </div>
                    );
                    return can('laboratoire')
                      ? <Link key={a.id} href={`/laboratoire/${a.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>{content}</Link>
                      : <div key={a.id}>{content}</div>;
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Colonne latérale */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header"><span className="card-title">Patient</span></div>
            <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="avatar avatar-blue">
                {consultation.patients?.prenom?.[0]}{consultation.patients?.nom?.[0]}
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>{consultation.patients?.prenom} {consultation.patients?.nom}</div>
                <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{consultation.patients?.code_patient}</div>
                <Link href={`/patients/${patientId}`} style={{ fontSize: 12, color: 'var(--primary-600)', textDecoration: 'none', fontWeight: 500, marginTop: 4, display: 'inline-block' }}>
                  Voir le dossier complet &rarr;
                </Link>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">Médecin traitant</span></div>
            <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="avatar avatar-purple">Dr</div>
              <div>
                <div style={{ fontWeight: 600 }}>Dr. {consultation.personnel?.nom} {consultation.personnel?.prenom}</div>
                <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{consultation.personnel?.specialite}</div>
              </div>
            </div>
          </div>

          {constantesRows.length > 0 && (
            <div className="card">
              <div className="card-header"><span className="card-title">Constantes vitales</span></div>
              <div className="card-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                  {constantesRows.map((row, i) => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: i < constantesRows.length - 1 ? '1px solid var(--neutral-100)' : 'none', paddingBottom: 8 }}>
                      <span style={{ color: 'var(--neutral-500)' }}>{row.label}</span>
                      <span style={{ fontWeight: 600 }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
