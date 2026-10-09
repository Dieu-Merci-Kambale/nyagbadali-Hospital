'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Activity,
  FileText,
  Stethoscope,
  Pill,
  CreditCard,
  Edit,
  Loader2,
  AlertCircle,
  Printer,
  CalendarPlus,
  BedDouble,
  FlaskConical,
} from 'lucide-react';
import MedicalAlerts from '@/components/patients/MedicalAlerts';
import { hasAccess } from '@/lib/role-permissions';
import {
  formatMoney, formatDate, formatTime, statusBadge, RDV_STATUTS, RDV_TYPES, HOSP_STATUTS, LAB_STATUTS, FACTURE_STATUTS, daysBetween,
} from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { buildPatientDocumentPdf } from '@/lib/document-models';
import { useAuth } from '@/contexts/AuthContext';
import { roleLabels } from '@/lib/role-permissions';
import type { Patient } from '@/types';

function getAge(dateNaissance: string): number {
  if (!dateNaissance) return 0;
  const today = new Date();
  const birth = new Date(dateNaissance);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export default function PatientDossierPage() {
  const { id } = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  
  const [patient, setPatient] = useState<Patient | null>(null);
  const [consultations, setConsultations] = useState<any[]>([]);
  const [factures, setFactures] = useState<any[]>([]);
  const [rendezVous, setRendezVous] = useState<any[]>([]);
  const [hospitalisations, setHospitalisations] = useState<any[]>([]);
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'apercu' | 'consultations' | 'rdv' | 'hospitalisations' | 'laboratoire' | 'factures'>('apercu');

  useEffect(() => {
    async function fetchDossier() {
      if (!id) return;
      
      // Fetch Patient
      const { data: patientData, error: patientError } = await supabase
        .from('patients')
        .select('*')
        .eq('id', id)
        .single();
        
      if (patientError) {
        console.error(patientError);
        setLoading(false);
        return;
      }
      
      setPatient(patientData);

      // Fetch Consultations
      const { data: consultData } = await supabase
        .from('consultations')
        .select('*, personnel(nom, prenom, specialite)')
        .eq('patient_id', id)
        .order('date_consultation', { ascending: false });
        
      if (consultData) setConsultations(consultData);

      // Factures (avec paiements pour calculer le reste à payer), RDV, séjours et analyses
      const [{ data: factureData }, { data: rdvData }, { data: hospData }, { data: labData }] = await Promise.all([
        supabase.from('factures').select('*, paiements(montant)').eq('patient_id', id).order('date_facture', { ascending: false }),
        supabase.from('rendez_vous').select('*, personnel(nom, prenom, specialite)').eq('patient_id', id).order('date_heure', { ascending: false }),
        supabase.from('hospitalisations').select('*, lits(numero, chambres(numero)), medecin:personnel(nom, prenom)').eq('patient_id', id).order('date_admission', { ascending: false }),
        supabase.from('analyses_laboratoire').select('id, type_analyse, statut, urgent, date_demande, date_resultat, resultats').eq('patient_id', id).order('date_demande', { ascending: false }),
      ]);

      setFactures((factureData || []).map((f: any) => ({
        ...f,
        montant_paye: (f.paiements || []).reduce((s: number, p: any) => s + Number(p.montant || 0), 0),
      })));
      setRendezVous(rdvData || []);
      setHospitalisations(hospData || []);
      setAnalyses(labData || []);

      setLoading(false);
    }
    
    fetchDossier();
  }, [id]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', gap: 12 }}>
        <Loader2 size={24} className="animate-spin text-primary-500" />
        <span style={{ fontWeight: 500, color: 'var(--neutral-500)' }}>Chargement du dossier médical...</span>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="empty-state" style={{ marginTop: 40 }}>
        <AlertCircle className="empty-state-icon" style={{ color: 'var(--danger)' }} />
        <h3>Patient introuvable</h3>
        <p>Le dossier demandé n&apos;existe pas ou a été supprimé.</p>
        <button className="btn btn-outline" onClick={() => router.push('/patients')} style={{ marginTop: 16 }}>
          Retour à la liste
        </button>
      </div>
    );
  }

  const handleDownloadPdf = async () => {
    const pdf = await buildPatientDocumentPdf({
      patient,
      consultations,
      factures,
      printedBy: profile ? { prenom: profile.prenom, nom: profile.nom, role: roleLabels[profile.role] || profile.role } : undefined,
      printedAt: new Date(),
    });
    pdf.save(`dossier-patient-${patient.code_patient || patient.id}.pdf`);
  };

  const can = (module: Parameters<typeof hasAccess>[1]) => (profile ? hasAccess(profile.role, module) : false);
  const sejourActif = hospitalisations.find((h) => h.statut === 'actif');
  const prochainRdv = rendezVous
    .filter((r) => new Date(r.date_heure).getTime() >= Date.now() && !['annulé', 'absent', 'terminé'].includes(r.statut))
    .sort((a, b) => new Date(a.date_heure).getTime() - new Date(b.date_heure).getTime())[0];
  const resteGlobal = factures
    .filter((f) => f.statut !== 'annulée')
    .reduce((s, f) => s + Math.max(0, Number(f.montant_patient || 0) - Number(f.montant_paye || 0)), 0);

  return (
    <div id="patient-pdf-export" className="animate-fade-in print-document">
      <div className="print-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, overflow: 'hidden', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(15, 23, 42, 0.08)' }}>
            <Image src="/logo.png" alt="Logo Nyagbadali" width={52} height={52} unoptimized style={{ objectFit: 'cover' }} />
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a' }}>Nyagbadali</div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#64748b' }}>Dossier patient</div>
          </div>
        </div>
        <div style={{ textAlign: 'right', color: '#475569' }}>
          <div style={{ fontWeight: 700 }}>{patient.code_patient}</div>
          <div style={{ fontSize: 12 }}>{new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
        </div>
      </div>

      {/* Header */}
      <div className="patient-hero hide-on-print">
        <div className="patient-hero-main">
          <button className="btn btn-outline btn-icon" onClick={() => router.push('/patients')} title="Retour à la liste">
            <ArrowLeft size={18} />
          </button>

          <div className="avatar avatar-xl avatar-blue patient-avatar">
            {patient.prenom[0]}{patient.nom[0]}
          </div>

          <div className="patient-hero-copy">
            <div className="patient-name-row">
              <h1 className="page-title" style={{ marginBottom: 0 }}>{patient.prenom} {patient.nom}</h1>
              <span className={`badge patient-status ${patient.statut === 'actif' ? 'badge-success' : 'badge-neutral'}`}>
                {patient.statut}
              </span>
            </div>
            <div className="patient-meta-row">
              <span className="patient-code">{patient.code_patient}</span>
              <span className="patient-dot">•</span>
              <span>{patient.sexe === 'M' ? 'Homme' : 'Femme'}, {getAge(patient.date_naissance)} ans</span>
            </div>
          </div>
        </div>

        <div className="patient-actions">
          <Link href={`/consultations/nouvelle?patient_id=${patient.id}`} className="btn btn-primary">
            <Stethoscope size={16} /> Nouvelle Consultation
          </Link>
          {can('rendez-vous') && (
            <Link href={`/rendez-vous/nouveau?patient_id=${patient.id}`} className="btn btn-outline">
              <CalendarPlus size={16} /> Rendez-vous
            </Link>
          )}
          {can('hospitalisation') && !sejourActif && (
            <Link href={`/hospitalisation/nouvelle?patient_id=${patient.id}`} className="btn btn-outline">
              <BedDouble size={16} /> Hospitaliser
            </Link>
          )}
          {can('laboratoire') && (
            <Link href={`/laboratoire/nouveau?patient_id=${patient.id}`} className="btn btn-outline">
              <FlaskConical size={16} /> Analyse
            </Link>
          )}
          {can('facturation') && (
            <Link href={`/facturation/nouvelle?patient_id=${patient.id}`} className="btn btn-outline">
              <CreditCard size={16} /> Facturer
            </Link>
          )}
          <button type="button" className="btn btn-outline" onClick={handleDownloadPdf}>
            <Printer size={16} /> Télécharger PDF
          </button>
          <Link href={`/patients/${patient.id}/edit`} className="btn btn-ghost" title="Modifier le dossier">
            <Edit size={18} />
          </Link>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="tabs" style={{ marginBottom: 24 }}>
        <button className={`tab ${activeTab === 'apercu' ? 'active' : ''}`} onClick={() => setActiveTab('apercu')}>
          <User size={16} style={{ display: 'inline', marginRight: 6 }} /> Aperçu
        </button>
        <button className={`tab ${activeTab === 'consultations' ? 'active' : ''}`} onClick={() => setActiveTab('consultations')}>
          <Stethoscope size={16} style={{ display: 'inline', marginRight: 6 }} /> Consultations ({consultations.length})
        </button>
        <button className={`tab ${activeTab === 'rdv' ? 'active' : ''}`} onClick={() => setActiveTab('rdv')}>
          <Calendar size={16} style={{ display: 'inline', marginRight: 6 }} /> Rendez-vous ({rendezVous.length})
        </button>
        <button className={`tab ${activeTab === 'hospitalisations' ? 'active' : ''}`} onClick={() => setActiveTab('hospitalisations')}>
          <BedDouble size={16} style={{ display: 'inline', marginRight: 6 }} /> Hospitalisations ({hospitalisations.length})
        </button>
        <button className={`tab ${activeTab === 'laboratoire' ? 'active' : ''}`} onClick={() => setActiveTab('laboratoire')}>
          <FlaskConical size={16} style={{ display: 'inline', marginRight: 6 }} /> Laboratoire ({analyses.length})
        </button>
        <button className={`tab ${activeTab === 'factures' ? 'active' : ''}`} onClick={() => setActiveTab('factures')}>
          <CreditCard size={16} style={{ display: 'inline', marginRight: 6 }} /> Factures ({factures.length})
        </button>
      </div>

      <MedicalAlerts allergies={patient.allergies ?? null} antecedents={patient.antecedents ?? null} />

      {sejourActif && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          <BedDouble size={18} /> Patient actuellement hospitalisé
          {sejourActif.lits ? ` — Ch. ${sejourActif.lits.chambres?.numero} / ${sejourActif.lits.numero}` : ''} depuis le {formatDate(sejourActif.date_admission)}.
          <Link href={`/hospitalisation/${sejourActif.id}`} style={{ marginLeft: 'auto', fontWeight: 600 }}>Voir le séjour →</Link>
        </div>
      )}

      {/* TAB: Aperçu */}
      {activeTab === 'apercu' && (
        <div className="patient-layout-grid">
          {/* Sidebar Profil */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card patient-summary-card">
              <div className="card-header"><span className="card-title">Informations de contact</span></div>
              <div className="card-body info-list">
                <div className="info-row">
                  <div className="info-icon"><Phone size={16} /></div>
                  <div className="info-copy">
                    <div className="info-label">Téléphone</div>
                    <div className="info-value">{patient.telephone || 'Non renseigné'}</div>
                  </div>
                </div>
                <div className="info-row">
                  <div className="info-icon"><Mail size={16} /></div>
                  <div className="info-copy">
                    <div className="info-label">Email</div>
                    <div className="info-value">{patient.email || 'Non renseigné'}</div>
                  </div>
                </div>
                <div className="info-row">
                  <div className="info-icon"><MapPin size={16} /></div>
                  <div className="info-copy">
                    <div className="info-label">Adresse</div>
                    <div className="info-value">{patient.adresse || 'Non renseignée'}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card patient-summary-card">
              <div className="card-header"><span className="card-title">Détails médicaux</span></div>
              <div className="card-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--neutral-400)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Groupe Sanguin</div>
                    <span className="badge badge-danger" style={{ fontSize: 14, padding: '4px 8px' }}>
                      {patient.groupe_sanguin || 'Inconnu'}
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--neutral-400)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Assurance</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{patient.assureur || 'Aucune'}</div>
                    {patient.numero_assurance && <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{patient.numero_assurance}</div>}
                  </div>
                </div>
              </div>
            </div>
            
            {(patient.contact_urgence_nom || patient.contact_urgence_tel) && (
              <div className="card">
                <div className="card-header"><span className="card-title">Contact d&apos;urgence</span></div>
                <div className="card-body">
                  <div style={{ fontWeight: 600 }}>{patient.contact_urgence_nom}</div>
                  <div style={{ color: 'var(--neutral-500)', fontSize: 13, marginTop: 4 }}>{patient.contact_urgence_tel}</div>
                </div>
              </div>
            )}
          </div>

          {/* Main Content (Dernières activités) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--neutral-400)', fontWeight: 600, textTransform: 'uppercase' }}>Prochain rendez-vous</div>
                <div style={{ fontWeight: 700, marginTop: 6 }}>{prochainRdv ? `${formatDate(prochainRdv.date_heure)} à ${formatTime(prochainRdv.date_heure)}` : 'Aucun'}</div>
                {prochainRdv && <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>Dr. {prochainRdv.personnel?.nom}</div>}
              </div>
              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--neutral-400)', fontWeight: 600, textTransform: 'uppercase' }}>Analyses en attente</div>
                <div style={{ fontWeight: 700, marginTop: 6 }}>{analyses.filter((a) => ['demandé', 'prélevé', 'en_cours'].includes(a.statut)).length}</div>
                <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{analyses.filter((a) => a.statut === 'terminé').length} résultat(s) disponible(s)</div>
              </div>
              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--neutral-400)', fontWeight: 600, textTransform: 'uppercase' }}>Reste à payer</div>
                <div style={{ fontWeight: 700, marginTop: 6, color: resteGlobal > 0 ? 'var(--danger)' : 'var(--success-600)' }}>{formatMoney(resteGlobal)}</div>
                <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{factures.length} facture(s)</div>
              </div>
            </div>
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="card-title">Dernière Consultation</span>
                {consultations.length > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setActiveTab('consultations')}>
                    Voir tout
                  </button>
                )}
              </div>
              <div className="card-body">
                {consultations.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--neutral-400)' }}>
                    Aucune consultation enregistrée
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Stethoscope size={24} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                        <h3 style={{ fontSize: 15, fontWeight: 700 }}>Dr. {consultations[0].personnel?.nom}</h3>
                        <span className="badge badge-neutral" style={{ fontSize: 10 }}>{new Date(consultations[0].date_consultation).toLocaleDateString('fr-FR')}</span>
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--neutral-600)', marginBottom: 8 }}>
                        <strong style={{ color: 'var(--neutral-900)' }}>Motif:</strong> {consultations[0].motif}
                      </p>
                      {consultations[0].diagnostic_principal && (
                        <p style={{ fontSize: 13, color: 'var(--neutral-600)' }}>
                          <strong style={{ color: 'var(--neutral-900)' }}>Diagnostic:</strong> {consultations[0].diagnostic_principal}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: Consultations */}
      {activeTab === 'consultations' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="card-title">Historique des consultations</span>
            <Link href={`/consultations/nouvelle?patient_id=${patient.id}`} className="btn btn-primary btn-sm">
              Nouvelle Consultation
            </Link>
          </div>
          {consultations.length === 0 ? (
            <div className="card-body" style={{ textAlign: 'center', padding: 40, color: 'var(--neutral-400)' }}>
              Aucune consultation trouvée.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Médecin</th>
                  <th>Motif</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {consultations.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>
                      {new Date(c.date_consultation).toLocaleDateString('fr-FR')}<br/>
                      <span style={{ fontSize: 11, color: 'var(--neutral-400)', fontWeight: 400 }}>
                        {new Date(c.date_consultation).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td>Dr. {c.personnel?.nom} <br/><span style={{ fontSize: 11, color: 'var(--primary-500)' }}>{c.personnel?.specialite}</span></td>
                    <td style={{ maxWidth: 200 }}>{c.motif}</td>
                    <td>
                      <span className={`badge ${c.statut === 'terminée' ? 'badge-success' : 'badge-warning'}`}>
                        {c.statut}
                      </span>
                    </td>
                    <td>
                      <Link href={`/consultations/${c.id}`} className="btn btn-outline btn-sm">Détails</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB: Rendez-vous */}
      {activeTab === 'rdv' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="card-title">Rendez-vous</span>
            {can('rendez-vous') && <Link href={`/rendez-vous/nouveau?patient_id=${patient.id}`} className="btn btn-primary btn-sm">Nouveau rendez-vous</Link>}
          </div>
          {rendezVous.length === 0 ? (
            <div className="card-body" style={{ textAlign: 'center', padding: 40, color: 'var(--neutral-400)' }}>Aucun rendez-vous.</div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Date</th><th>Médecin</th><th>Motif</th><th>Type</th><th>Statut</th></tr></thead>
              <tbody>
                {rendezVous.map((r) => {
                  const st = statusBadge(RDV_STATUTS, r.statut);
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{formatDate(r.date_heure)}<br /><span style={{ fontSize: 11, color: 'var(--neutral-400)', fontWeight: 400 }}>{formatTime(r.date_heure)}</span></td>
                      <td>Dr. {r.personnel?.prenom} {r.personnel?.nom}</td>
                      <td style={{ maxWidth: 240 }}>{r.motif}</td>
                      <td><span className="badge badge-info">{RDV_TYPES[r.type] || r.type}</span></td>
                      <td><span className={`badge ${st.badge}`}>{st.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB: Hospitalisations */}
      {activeTab === 'hospitalisations' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="card-title">Séjours hospitaliers</span>
            {can('hospitalisation') && !sejourActif && <Link href={`/hospitalisation/nouvelle?patient_id=${patient.id}`} className="btn btn-primary btn-sm">Nouvelle admission</Link>}
          </div>
          {hospitalisations.length === 0 ? (
            <div className="card-body" style={{ textAlign: 'center', padding: 40, color: 'var(--neutral-400)' }}>Aucune hospitalisation.</div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Admission</th><th>Durée</th><th>Lit</th><th>Motif</th><th>Statut</th><th></th></tr></thead>
              <tbody>
                {hospitalisations.map((h) => {
                  const st = statusBadge(HOSP_STATUTS, h.statut);
                  return (
                    <tr key={h.id}>
                      <td style={{ fontWeight: 600 }}>{formatDate(h.date_admission)}</td>
                      <td>{daysBetween(h.date_admission, h.date_sortie || new Date())} j</td>
                      <td>{h.lits ? `Ch. ${h.lits.chambres?.numero} / ${h.lits.numero}` : '—'}</td>
                      <td style={{ maxWidth: 240 }}>{h.motif_admission}</td>
                      <td><span className={`badge ${st.badge}`}>{st.label}</span></td>
                      <td>{can('hospitalisation') && <Link href={`/hospitalisation/${h.id}`} className="btn btn-outline btn-sm">Détails</Link>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB: Laboratoire */}
      {activeTab === 'laboratoire' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="card-title">Examens de laboratoire</span>
            {can('laboratoire') && <Link href={`/laboratoire/nouveau?patient_id=${patient.id}`} className="btn btn-primary btn-sm">Demander une analyse</Link>}
          </div>
          {analyses.length === 0 ? (
            <div className="card-body" style={{ textAlign: 'center', padding: 40, color: 'var(--neutral-400)' }}>Aucune analyse.</div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Demande</th><th>Examen</th><th>Résultat</th><th>Statut</th><th></th></tr></thead>
              <tbody>
                {analyses.map((a) => {
                  const st = statusBadge(LAB_STATUTS, a.statut);
                  const anomalies = (a.resultats?.parametres || []).filter((p: any) => p.anormal).length;
                  return (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600 }}>{formatDate(a.date_demande)}</td>
                      <td>{a.type_analyse} {a.urgent && <span className="badge badge-danger">Urgent</span>}</td>
                      <td style={{ maxWidth: 260, fontSize: 13 }}>
                        {a.resultats?.texte || (a.statut === 'terminé' ? 'Voir le détail' : '—')}
                        {anomalies > 0 && <div><span className="badge badge-danger">{anomalies} valeur(s) anormale(s)</span></div>}
                      </td>
                      <td><span className={`badge ${st.badge}`}>{st.label}</span></td>
                      <td>{can('laboratoire') && <Link href={`/laboratoire/${a.id}`} className="btn btn-outline btn-sm">Détails</Link>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB: Factures */}
      {activeTab === 'factures' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="card-title">Historique de facturation</span>
            <Link href={`/facturation/nouvelle?patient_id=${patient.id}`} className="btn btn-primary btn-sm">
              Nouvelle Facture
            </Link>
          </div>
          {factures.length === 0 ? (
            <div className="card-body" style={{ textAlign: 'center', padding: 40, color: 'var(--neutral-400)' }}>
              Aucune facture trouvée.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Net patient</th>
                  <th>Montant Payé</th>
                  <th>Reste</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {factures.map(f => {
                  const reste = f.statut === 'annulée' ? 0 : Math.max(0, Number(f.montant_patient || 0) - (f.montant_paye || 0));
                  const st = statusBadge(FACTURE_STATUTS, f.statut);
                  return (
                    <tr key={f.id}>
                      <td style={{ fontWeight: 600 }}>
                        {formatDate(f.date_facture)}
                        <div style={{ fontSize: 11, color: 'var(--neutral-400)', fontFamily: 'monospace', fontWeight: 400 }}>{f.numero_facture}</div>
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {formatMoney(f.montant_patient)}
                        {Number(f.montant_assurance) > 0 && <div style={{ fontSize: 11, color: 'var(--neutral-400)', fontWeight: 400 }}>Assurance : {formatMoney(f.montant_assurance)}</div>}
                      </td>
                      <td style={{ color: 'var(--success)' }}>{formatMoney(f.montant_paye || 0)}</td>
                      <td style={{ color: reste > 0 ? 'var(--danger)' : 'var(--neutral-400)' }}>{formatMoney(reste)}</td>
                      <td>
                        <span className={`badge ${st.badge}`}>{st.label}</span>
                      </td>
                      <td>
                        <Link href={`/facturation/${f.id}`} className="btn btn-outline btn-sm">Détails</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
