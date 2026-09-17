'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Stethoscope, User, Calendar, FileText, Printer, Loader2, AlertCircle, Edit } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function ConsultationDetailsPage() {
  const { id } = useParams();
  const router = useRouter();
  
  const [consultation, setConsultation] = useState<any>(null);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDetails() {
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
        
        // Fetch prescriptions
        const { data: presData } = await supabase
          .from('prescriptions')
          .select('*, medicament:medicaments(nom_commercial, forme)')
          .eq('consultation_id', id)
          .order('created_at', { ascending: false });
          
        if (presData) setPrescriptions(presData);
      }
      setLoading(false);
    }
    fetchDetails();
  }, [id]);

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
        <p>Ce dossier n'existe pas ou a été supprimé.</p>
        <button className="btn btn-outline" onClick={() => router.push('/consultations')} style={{ marginTop: 16 }}>
          Retour
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
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
          <button className="btn btn-outline" onClick={() => window.print()}>
            <Printer size={16} /> Imprimer
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        {/* Main Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title"><FileText size={16} /> Rapport Clinique</span>
              <span className={`badge ${consultation.statut === 'terminée' ? 'badge-success' : 'badge-warning'}`}>
                {consultation.statut}
              </span>
            </div>
            <div className="card-body">
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--neutral-400)', fontWeight: 600, marginBottom: 8 }}>Motif de consultation</h4>
                <p style={{ fontSize: 16, fontWeight: 500 }}>{consultation.motif}</p>
              </div>

              {consultation.diagnostic_principal && (
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--neutral-400)', fontWeight: 600, marginBottom: 8 }}>Diagnostic</h4>
                  <p style={{ fontSize: 15, color: 'var(--danger)', fontWeight: 600 }}>{consultation.diagnostic_principal}</p>
                </div>
              )}

              {consultation.notes_privees && (
                <div>
                  <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--neutral-400)', fontWeight: 600, marginBottom: 8 }}>Notes & Prescriptions</h4>
                  <div style={{ 
                    padding: 16, 
                    background: 'var(--neutral-50)', 
                    borderRadius: 8, 
                    border: '1px solid var(--neutral-100)',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.6
                  }}>
                    {consultation.notes_privees}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SECTION PRESCRIPTIONS */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="card-title">Ordonnance & Prescriptions</span>
              <Link href={`/consultations/${consultation.id}/prescriptions/nouvelle`} className="btn btn-primary btn-sm">
                + Prescrire un médicament
              </Link>
            </div>
            <div className="card-body">
              {prescriptions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--neutral-500)' }}>
                  <p>Aucune prescription pour cette consultation.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {prescriptions.map((pres) => (
                    <div key={pres.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: 16, border: '1px solid var(--neutral-200)', borderRadius: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--neutral-900)' }}>
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
                      <div>
                        <span className={`badge ${pres.statut === 'active' ? 'badge-primary' : pres.statut === 'dispensée' ? 'badge-success' : 'badge-neutral'}`}>
                          {pres.statut === 'active' ? 'En attente' : pres.statut === 'dispensée' ? 'Dispensée' : 'Annulée'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Patient Card */}
          <div className="card">
            <div className="card-header"><span className="card-title">Patient</span></div>
            <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="avatar avatar-blue">
                {consultation.patients?.prenom?.[0]}{consultation.patients?.nom?.[0]}
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>{consultation.patients?.prenom} {consultation.patients?.nom}</div>
                <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{consultation.patients?.code_patient}</div>
                <Link href={`/patients/${consultation.patients?.id}`} style={{ fontSize: 12, color: 'var(--primary-600)', textDecoration: 'none', fontWeight: 500, marginTop: 4, display: 'inline-block' }}>
                  Voir le dossier complet &rarr;
                </Link>
              </div>
            </div>
          </div>

          {/* Medecin Card */}
          <div className="card">
            <div className="card-header"><span className="card-title">Médecin Traitant</span></div>
            <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="avatar avatar-purple">
                Dr
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>Dr. {consultation.personnel?.nom} {consultation.personnel?.prenom}</div>
                <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{consultation.personnel?.specialite}</div>
              </div>
            </div>
          </div>

          {/* Constantes */}
          {consultation.constantes && (
            <div className="card">
              <div className="card-header"><span className="card-title">Constantes Vitales</span></div>
              <div className="card-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                  {consultation.constantes.poids && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--neutral-100)', paddingBottom: 8 }}>
                      <span style={{ color: 'var(--neutral-500)' }}>Poids</span>
                      <span style={{ fontWeight: 600 }}>{consultation.constantes.poids} kg</span>
                    </div>
                  )}
                  {consultation.constantes.temperature && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--neutral-100)', paddingBottom: 8 }}>
                      <span style={{ color: 'var(--neutral-500)' }}>Température</span>
                      <span style={{ fontWeight: 600 }}>{consultation.constantes.temperature} °C</span>
                    </div>
                  )}
                  {consultation.constantes.tension && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--neutral-500)' }}>Tension</span>
                      <span style={{ fontWeight: 600 }}>{consultation.constantes.tension}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
