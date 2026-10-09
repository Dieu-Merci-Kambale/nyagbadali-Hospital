'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Stethoscope,
  Clock,
  Activity,
  FileText,
  Plus,
  Eye,
  Loader2,
  Inbox,
  Search,
  Thermometer,
  HeartPulse,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate, formatTime, toDateKey } from '@/lib/format';

const PERIODES = [
  { key: 'tout', label: 'Toutes les dates' },
  { key: 'jour', label: "Aujourd'hui" },
  { key: 'semaine', label: '7 derniers jours' },
  { key: 'mois', label: '30 derniers jours' },
];

export default function ConsultationsPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [consultations, setConsultations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'en_cours' | 'terminée' | 'toutes'>('toutes');
  const [search, setSearch] = useState('');
  const [periode, setPeriode] = useState('tout');
  const [mesConsultations, setMesConsultations] = useState(false);

  const isMedecin = profile?.role === 'medecin' || profile?.role === 'medecin_chef';

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

  const now = Date.now();
  const base = consultations.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch = q === '' ||
      `${c.patients?.prenom || ''} ${c.patients?.nom || ''}`.toLowerCase().includes(q) ||
      (c.patients?.code_patient || '').toLowerCase().includes(q) ||
      (c.motif || '').toLowerCase().includes(q) ||
      (c.diagnostic_principal || '').toLowerCase().includes(q);
    const t = new Date(c.date_consultation).getTime();
    const matchPeriode =
      periode === 'tout' ||
      (periode === 'jour' && toDateKey(c.date_consultation) === toDateKey()) ||
      (periode === 'semaine' && now - t <= 7 * 86_400_000) ||
      (periode === 'mois' && now - t <= 30 * 86_400_000);
    const matchMedecin = !mesConsultations || c.medecin_id === profile?.id;
    return matchSearch && matchPeriode && matchMedecin;
  });

  const filtered = activeTab === 'toutes' ? base : base.filter((c) => c.statut === activeTab);

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
        <button type="button" className="btn btn-primary" onClick={() => router.push('/consultations/nouvelle')}>
          <Plus size={16} /> Nouvelle consultation
        </button>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '14px 22px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="header-search" style={{ flex: 1, minWidth: 250 }}>
              <Search className="header-search-icon" />
              <input
                type="text"
                placeholder="Rechercher par patient, code, motif ou diagnostic..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className="form-select" style={{ width: 190 }} value={periode} onChange={(e) => setPeriode(e.target.value)}>
              {PERIODES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            {isMedecin && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                <input type="checkbox" checked={mesConsultations} onChange={(e) => setMesConsultations(e.target.checked)} />
                Mes consultations uniquement
              </label>
            )}
          </div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${activeTab === 'toutes' ? 'active' : ''}`} onClick={() => setActiveTab('toutes')}>
          Toutes ({base.length})
        </button>
        <button className={`tab ${activeTab === 'en_cours' ? 'active' : ''}`} onClick={() => setActiveTab('en_cours')}>
          🔄 En cours ({base.filter((c) => c.statut === 'en_cours').length})
        </button>
        <button className={`tab ${activeTab === 'terminée' ? 'active' : ''}`} onClick={() => setActiveTab('terminée')}>
          ✅ Terminées ({base.filter((c) => c.statut === 'terminée').length})
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
          {filtered.map((consultation: any, index: number) => {
            const k = consultation.constantes || {};
            const tension = k.tension || (k.tension_systolique ? `${k.tension_systolique}/${k.tension_diastolique}` : '');
            const statutBadge = consultation.statut === 'en_cours' ? 'badge-warning' : consultation.statut === 'annulée' ? 'badge-danger' : 'badge-success';
            const statutLabel = consultation.statut === 'en_cours' ? '🔄 En cours' : consultation.statut === 'annulée' ? 'Annulée' : '✅ Terminée';
            return (
              <div key={consultation.id} className="card animate-slide-up" style={{ animationDelay: `${Math.min(index, 10) * 0.05}s` }}>
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
                            {formatDate(consultation.date_consultation)} à {formatTime(consultation.date_consultation)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span className={`badge ${statutBadge}`}>{statutLabel}</span>
                      <Link href={`/consultations/${consultation.id}`} className="btn btn-outline btn-sm">
                        <Eye size={14} /> Voir
                      </Link>
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--neutral-400)', marginBottom: 4 }}>Motif</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{consultation.motif}</div>
                  </div>

                  {(tension || k.pouls || k.temperature || k.poids) && (
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', padding: '12px 16px', background: 'var(--neutral-50)', borderRadius: 'var(--radius-md)', marginBottom: 14 }}>
                      {tension && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: 'var(--neutral-400)', marginBottom: 2 }}>Tension</div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}><HeartPulse size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2, color: 'var(--danger)' }} />{tension}</div>
                        </div>
                      )}
                      {k.pouls && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: 'var(--neutral-400)', marginBottom: 2 }}>Pouls</div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}><Activity size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2, color: 'var(--danger)' }} />{k.pouls} bpm</div>
                        </div>
                      )}
                      {k.temperature && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: 'var(--neutral-400)', marginBottom: 2 }}>Température</div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}><Thermometer size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2, color: 'var(--warning)' }} />{String(k.temperature).replace('.', ',')} °C</div>
                        </div>
                      )}
                      {k.poids && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: 'var(--neutral-400)', marginBottom: 2 }}>Poids</div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{k.poids} kg</div>
                        </div>
                      )}
                    </div>
                  )}

                  {consultation.diagnostic_principal && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <FileText size={14} style={{ color: 'var(--neutral-400)' }} />
                      <span style={{ fontSize: 12, color: 'var(--neutral-500)' }}>Diagnostic :</span>
                      <span className="badge badge-info">{consultation.diagnostic_principal}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
