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
  Printer
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { buildPatientDocumentPdf } from '@/lib/document-models';
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
  
  const [patient, setPatient] = useState<Patient | null>(null);
  const [consultations, setConsultations] = useState<any[]>([]);
  const [factures, setFactures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'apercu' | 'consultations' | 'factures'>('apercu');

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

      // Fetch Factures
      const { data: factureData } = await supabase
        .from('factures')
        .select('*')
        .eq('patient_id', id)
        .order('date_facture', { ascending: false });
        
      if (factureData) setFactures(factureData);

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
    });
    pdf.save(`dossier-patient-${patient.code_patient || patient.id}.pdf`);
  };

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
          <Link href={`/facturation/nouvelle?patient_id=${patient.id}`} className="btn btn-outline">
            <CreditCard size={16} /> Facturer
          </Link>
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
        <button className={`tab ${activeTab === 'factures' ? 'active' : ''}`} onClick={() => setActiveTab('factures')}>
          <CreditCard size={16} style={{ display: 'inline', marginRight: 6 }} /> Factures ({factures.length})
        </button>
      </div>

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
                  <th>Montant Total</th>
                  <th>Montant Payé</th>
                  <th>Reste</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {factures.map(f => {
                  const reste = f.montant_total - (f.montant_paye || 0);
                  return (
                    <tr key={f.id}>
                      <td style={{ fontWeight: 600 }}>{new Date(f.date_facture).toLocaleDateString('fr-FR')}</td>
                      <td style={{ fontWeight: 700 }}>{f.montant_total} FC</td>
                      <td style={{ color: 'var(--success)' }}>{f.montant_paye || 0} FC</td>
                      <td style={{ color: reste > 0 ? 'var(--danger)' : 'var(--neutral-400)' }}>{reste} FC</td>
                      <td>
                        <span className={`badge ${f.statut === 'payée' ? 'badge-success' : f.statut === 'en_attente' ? 'badge-warning' : f.statut === 'partielle' ? 'badge-info' : 'badge-danger'}`}>
                          {f.statut}
                        </span>
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
