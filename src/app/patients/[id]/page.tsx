'use client';

import { useState, useEffect } from 'react';
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
  AlertCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
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

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <button className="btn btn-outline" onClick={() => router.push('/patients')} style={{ padding: 8, borderRadius: '50%' }}>
            <ArrowLeft size={18} />
          </button>
          
          <div className="avatar avatar-xl avatar-blue">
            {patient.prenom[0]}{patient.nom[0]}
          </div>
          
          <div>
            <h1 className="page-title" style={{ marginBottom: 4 }}>{patient.prenom} {patient.nom}</h1>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13, color: 'var(--neutral-500)' }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary-600)' }}>{patient.code_patient}</span>
              <span>&bull;</span>
              <span>{patient.sexe === 'M' ? 'Homme' : 'Femme'}, {getAge(patient.date_naissance)} ans</span>
              <span>&bull;</span>
              <span className={`badge ${patient.statut === 'actif' ? 'badge-success' : 'badge-neutral'}`}>
                {patient.statut}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href={`/consultations/nouvelle?patient_id=${patient.id}`} className="btn btn-primary">
            <Stethoscope size={16} /> Nouvelle Consultation
          </Link>
          <Link href={`/facturation/nouvelle?patient_id=${patient.id}`} className="btn btn-outline">
            <CreditCard size={16} /> Facturer
          </Link>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
          {/* Sidebar Profil */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card">
              <div className="card-header"><span className="card-title">Informations de contact</span></div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--neutral-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--neutral-500)' }}>
                    <Phone size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--neutral-400)', fontWeight: 600, textTransform: 'uppercase' }}>Téléphone</div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{patient.telephone || 'Non renseigné'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--neutral-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--neutral-500)' }}>
                    <Mail size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--neutral-400)', fontWeight: 600, textTransform: 'uppercase' }}>Email</div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{patient.email || 'Non renseigné'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--neutral-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--neutral-500)' }}>
                    <MapPin size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--neutral-400)', fontWeight: 600, textTransform: 'uppercase' }}>Adresse</div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{patient.adresse || 'Non renseignée'}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
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
