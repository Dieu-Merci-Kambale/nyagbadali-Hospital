'use client';

import { useState, useEffect } from 'react';
import {
  Stethoscope,
  Clock,
  Activity,
  FileText,
  Plus,
  Eye,
  Loader2,
  Inbox,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function ConsultationsPage() {
  const [consultations, setConsultations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'en_cours' | 'terminée' | 'toutes'>('toutes');

  useEffect(() => {
    async function fetchConsultations() {
      setLoading(true);
      const { data, error } = await supabase
        .from('consultations')
        .select('*, patients(nom, prenom, code_patient), personnel(nom, prenom)')
        .order('date_consultation', { ascending: false });

      if (error) {
        console.error('Erreur:', error);
      } else {
        setConsultations(data || []);
      }
      setLoading(false);
    }
    fetchConsultations();
  }, []);

  const filtered = activeTab === 'toutes'
    ? consultations
    : consultations.filter(c => c.statut === activeTab);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, gap: 12 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
        <span style={{ fontWeight: 500, color: 'var(--neutral-500)' }}>Chargement des consultations...</span>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Consultations</h1>
          <p className="page-subtitle">Dossiers médicaux et consultations</p>
        </div>
        <button className="btn btn-primary">
          <Plus size={16} /> Nouvelle Consultation
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${activeTab === 'toutes' ? 'active' : ''}`} onClick={() => setActiveTab('toutes')}>
          Toutes ({consultations.length})
        </button>
        <button className={`tab ${activeTab === 'en_cours' ? 'active' : ''}`} onClick={() => setActiveTab('en_cours')}>
          🔄 En cours ({consultations.filter(c => c.statut === 'en_cours').length})
        </button>
        <button className={`tab ${activeTab === 'terminée' ? 'active' : ''}`} onClick={() => setActiveTab('terminée')}>
          ✅ Terminées ({consultations.filter(c => c.statut === 'terminée').length})
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <Inbox className="empty-state-icon" />
              <h3>Aucune consultation</h3>
              <p>Il n&apos;y a aucune consultation pour cette sélection.</p>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filtered.map((consultation: any, index: number) => (
            <div key={consultation.id} className="card animate-slide-up" style={{ animationDelay: `${index * 0.1}s` }}>
              <div className="card-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <div className={`avatar avatar-lg ${consultation.statut === 'en_cours' ? 'avatar-orange' : 'avatar-blue'}`}>
                      {consultation.patients?.prenom?.[0]}{consultation.patients?.nom?.[0]}
                    </div>
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--neutral-900)' }}>
                        {consultation.patients?.prenom} {consultation.patients?.nom}
                      </h3>
                      <div style={{ fontSize: 12, color: 'var(--neutral-500)', display: 'flex', gap: 12, marginTop: 2 }}>
                        <span>
                          <Stethoscope size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                          Dr. {consultation.personnel?.nom}
                        </span>
                        <span>
                          <Clock size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                          {new Date(consultation.date_consultation).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className={`badge ${consultation.statut === 'en_cours' ? 'badge-warning' : 'badge-success'}`}>
                      {consultation.statut === 'en_cours' ? '🔄 En cours' : '✅ Terminée'}
                    </span>
                    <button className="btn btn-outline btn-sm"><Eye size={14} /> Voir</button>
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--neutral-400)', marginBottom: 4 }}>Motif</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{consultation.motif}</div>
                </div>

                {/* Constantes */}
                {consultation.constantes && (
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '12px 16px', background: 'var(--neutral-50)', borderRadius: 'var(--radius-md)', marginBottom: 14 }}>
                    {consultation.constantes.tension_systolique && (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--neutral-400)', marginBottom: 2 }}>Tension</div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{consultation.constantes.tension_systolique}/{consultation.constantes.tension_diastolique}</div>
                      </div>
                    )}
                    {consultation.constantes.pouls && (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--neutral-400)', marginBottom: 2 }}>Pouls</div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          <Activity size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2, color: 'var(--danger)' }} />
                          {consultation.constantes.pouls} bpm
                        </div>
                      </div>
                    )}
                    {consultation.constantes.temperature && (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--neutral-400)', marginBottom: 2 }}>Température</div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{consultation.constantes.temperature}°C</div>
                      </div>
                    )}
                  </div>
                )}

                {consultation.diagnostic_principal && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <FileText size={14} style={{ color: 'var(--neutral-400)' }} />
                    <span style={{ fontSize: 12, color: 'var(--neutral-500)' }}>Diagnostic:</span>
                    <span className="badge badge-info" style={{ fontFamily: 'monospace' }}>{consultation.diagnostic_principal}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
