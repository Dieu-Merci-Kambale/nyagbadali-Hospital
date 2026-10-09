'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarDays,
  Search,
  Plus,
  Clock,
  Filter,
  Loader2,
  Inbox,
  RefreshCw,
  Printer,
  CheckCircle,
  UserCheck,
  UserX,
  XCircle,
  Stethoscope,
  ChevronLeft,
  ChevronRight,
  List,
  Edit,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { hasAccess, roleLabels } from '@/lib/role-permissions';
import { buildAppointmentDocumentPdf } from '@/lib/document-models';
import { nextQueueNumber } from '@/lib/rdv';
import { RDV_STATUTS, RDV_TYPES, statusBadge, formatDate, formatTime, toDateKey, explainDbError } from '@/lib/format';

export default function RendezVousPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { confirm } = useConfirm();

  const [rdvs, setRdvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [view, setView] = useState<'agenda' | 'liste'>('agenda');

  // Vue agenda
  const [agendaDate, setAgendaDate] = useState(toDateKey());
  const [medecinFilter, setMedecinFilter] = useState('tous');

  // Vue liste
  const [filterStatut, setFilterStatut] = useState('tous');
  const [search, setSearch] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [appliedDateDebut, setAppliedDateDebut] = useState('');
  const [appliedDateFin, setAppliedDateFin] = useState('');

  const canConsult = profile ? hasAccess(profile.role, 'consultations') : false;

  const fetchRDV = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('rendez_vous')
      .select('*, patients(id, nom, prenom, code_patient, date_naissance, sexe, telephone), personnel(id, nom, prenom, specialite)')
      .order('date_heure', { ascending: false });

    if (error) {
      console.error('Erreur:', error);
      toast.error('Impossible de charger les rendez-vous.');
    } else {
      setRdvs(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRDV();
  }, [fetchRDV]);

  const updateRdv = async (rdv: any, patch: Record<string, unknown>, message: string) => {
    setBusyId(rdv.id);
    const { error } = await supabase.from('rendez_vous').update(patch).eq('id', rdv.id);
    setBusyId(null);
    if (error) {
      toast.error(explainDbError(error));
      return false;
    }
    setRdvs((prev) => prev.map((r) => (r.id === rdv.id ? { ...r, ...patch } : r)));
    toast.success(message);
    return true;
  };

  const handleArrivee = async (rdv: any) => {
    const numero = await nextQueueNumber(rdv.date_heure);
    await updateRdv(rdv, { statut: 'confirmé', numero_queue: numero }, `Arrivée enregistrée — ticket n° ${numero}.`);
  };

  const handleAbsent = async (rdv: any) => {
    const ok = await confirm({ title: 'Patient absent', message: `Marquer ${rdv.patients?.prenom} ${rdv.patients?.nom} comme absent ?`, confirmText: 'Oui, absent', type: 'warning' });
    if (ok) await updateRdv(rdv, { statut: 'absent' }, 'Rendez-vous marqué absent.');
  };

  const handleAnnuler = async (rdv: any) => {
    const ok = await confirm({ title: 'Annuler le rendez-vous', message: `Annuler le rendez-vous de ${rdv.patients?.prenom} ${rdv.patients?.nom} ?`, confirmText: 'Oui, annuler', type: 'danger' });
    if (ok) await updateRdv(rdv, { statut: 'annulé' }, 'Rendez-vous annulé.');
  };

  const handleDemarrer = async (rdv: any) => {
    const ok = await updateRdv(rdv, { statut: 'en_cours' }, 'Patient appelé en consultation.');
    if (ok) router.push(`/consultations/nouvelle?patient_id=${rdv.patient_id}&rdv_id=${rdv.id}`);
  };

  const handlePrint = async (rdv: any) => {
    try {
      const pdf = await buildAppointmentDocumentPdf({
        rendezVous: rdv,
        printedBy: profile ? { prenom: profile.prenom, nom: profile.nom, role: roleLabels[profile.role] } : undefined,
        printedAt: new Date(),
      });
      pdf.save(`convocation-${rdv.patients?.code_patient || rdv.id}-${toDateKey(rdv.date_heure)}.pdf`);
    } catch (err) {
      console.error(err);
      toast.error('Impossible de générer la convocation.');
    }
  };

  // ----- Données dérivées -----
  const medecinsDuJour = Array.from(
    new Map(rdvs.filter((r) => r.personnel).map((r) => [r.personnel.id, r.personnel])).values()
  );

  const agenda = rdvs
    .filter((r) => toDateKey(r.date_heure) === agendaDate)
    .filter((r) => medecinFilter === 'tous' || r.medecin_id === medecinFilter)
    .sort((a, b) => new Date(a.date_heure).getTime() - new Date(b.date_heure).getTime());

  const agendaStats = {
    total: agenda.filter((r) => r.statut !== 'annulé').length,
    arrives: agenda.filter((r) => r.numero_queue && ['confirmé', 'en_cours'].includes(r.statut)).length,
    termines: agenda.filter((r) => r.statut === 'terminé').length,
    absents: agenda.filter((r) => r.statut === 'absent').length,
  };

  const shiftDay = (delta: number) => {
    const [y, m, d] = agendaDate.split('-').map(Number);
    setAgendaDate(toDateKey(new Date(y, m - 1, d + delta)));
  };

  const filtered = rdvs.filter((r) => {
    const matchStatut = filterStatut === 'tous' || r.statut === filterStatut;
    const s = search.toLowerCase();
    const matchSearch = search === '' ||
      `${r.patients?.prenom} ${r.patients?.nom}`.toLowerCase().includes(s) ||
      (r.patients?.code_patient && r.patients.code_patient.toLowerCase().includes(s)) ||
      `${r.personnel?.prenom} ${r.personnel?.nom}`.toLowerCase().includes(s) ||
      (r.motif && r.motif.toLowerCase().includes(s));

    let matchDate = true;
    if (appliedDateDebut || appliedDateFin) {
      // Filtre sur la date de création du rendez-vous
      const rDate = new Date(r.created_at).getTime();
      if (appliedDateDebut) {
        const [y, m, d] = appliedDateDebut.split('-');
        if (rDate < new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0).getTime()) matchDate = false;
      }
      if (appliedDateFin) {
        const [y, m, d] = appliedDateFin.split('-');
        if (rDate > new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999).getTime()) matchDate = false;
      }
    }
    return matchStatut && matchSearch && matchDate;
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, gap: 12 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
        <span style={{ fontWeight: 500, color: 'var(--neutral-500)' }}>Chargement des rendez-vous...</span>
      </div>
    );
  }

  const isToday = agendaDate === toDateKey();
  const [ay, am, ad] = agendaDate.split('-').map(Number);
  const agendaLabel = new Date(ay, am - 1, ad).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const renderActions = (rdv: any) => {
    const busy = busyId === rdv.id;
    if (busy) return <Loader2 size={16} className="animate-spin" />;
    const closed = ['terminé', 'annulé', 'absent'].includes(rdv.statut);
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {rdv.statut === 'planifié' && (
          <button className="btn btn-outline btn-sm" onClick={() => updateRdv(rdv, { statut: 'confirmé' }, 'Rendez-vous confirmé.')} title="Le patient a confirmé sa venue">
            <CheckCircle size={14} /> Confirmer
          </button>
        )}
        {['planifié', 'confirmé'].includes(rdv.statut) && !rdv.numero_queue && (
          <button className="btn btn-primary btn-sm" onClick={() => handleArrivee(rdv)} title="Le patient est arrivé : lui attribuer un ticket">
            <UserCheck size={14} /> Arrivé
          </button>
        )}
        {canConsult && ['confirmé', 'planifié'].includes(rdv.statut) && rdv.numero_queue && (
          <button className="btn btn-success btn-sm" onClick={() => handleDemarrer(rdv)}>
            <Stethoscope size={14} /> Consulter
          </button>
        )}
        {rdv.statut === 'en_cours' && (
          <button className="btn btn-outline btn-sm" onClick={() => updateRdv(rdv, { statut: 'terminé' }, 'Rendez-vous terminé.')}>
            <CheckCircle size={14} /> Terminer
          </button>
        )}
        {!closed && rdv.statut !== 'en_cours' && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => handleAbsent(rdv)} title="Absent"><UserX size={14} /></button>
            <button className="btn btn-ghost btn-sm" onClick={() => handleAnnuler(rdv)} title="Annuler" style={{ color: 'var(--danger)' }}><XCircle size={14} /></button>
          </>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => handlePrint(rdv)} title="Imprimer la convocation"><Printer size={14} /></button>
        <Link href={`/rendez-vous/${rdv.id}/edit`} className="btn btn-ghost btn-sm" title="Modifier"><Edit size={14} /></Link>
      </div>
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Rendez-vous</h1>
          <p className="page-subtitle">{rdvs.length} rendez-vous enregistrés</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ display: 'flex', border: '1px solid var(--neutral-200)', borderRadius: 10, overflow: 'hidden' }}>
            <button className={`btn btn-sm ${view === 'agenda' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: 0 }} onClick={() => setView('agenda')}>
              <CalendarDays size={14} /> Agenda
            </button>
            <button className={`btn btn-sm ${view === 'liste' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: 0 }} onClick={() => setView('liste')}>
              <List size={14} /> Liste
            </button>
          </div>
          <button onClick={fetchRDV} className="btn btn-outline" title="Actualiser la liste">
            <RefreshCw size={16} /> Actualiser
          </button>
          <Link href="/rendez-vous/nouveau" className="btn btn-primary">
            <Plus size={16} /> Nouveau rendez-vous
          </Link>
        </div>
      </div>

      {view === 'agenda' ? (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-body" style={{ padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-outline btn-sm" onClick={() => shiftDay(-1)} title="Jour précédent"><ChevronLeft size={16} /></button>
              <input type="date" className="form-input" style={{ width: 160 }} value={agendaDate} onChange={(e) => e.target.value && setAgendaDate(e.target.value)} />
              <button className="btn btn-outline btn-sm" onClick={() => shiftDay(1)} title="Jour suivant"><ChevronRight size={16} /></button>
              {!isToday && <button className="btn btn-ghost btn-sm" onClick={() => setAgendaDate(toDateKey())}>Aujourd&apos;hui</button>}
              <span style={{ fontWeight: 700, color: 'var(--neutral-800)', textTransform: 'capitalize' }}>{agendaLabel}</span>
              <select className="form-select" style={{ width: 220, marginLeft: 'auto' }} value={medecinFilter} onChange={(e) => setMedecinFilter(e.target.value)}>
                <option value="tous">Tous les médecins</option>
                {medecinsDuJour.map((m: any) => <option key={m.id} value={m.id}>Dr. {m.prenom} {m.nom}</option>)}
              </select>
            </div>
          </div>

          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
            {[
              { label: 'Rendez-vous', value: agendaStats.total, color: 'blue', icon: <CalendarDays size={22} /> },
              { label: 'En salle d\'attente', value: agendaStats.arrives, color: 'orange', icon: <UserCheck size={22} /> },
              { label: 'Vus', value: agendaStats.termines, color: 'green', icon: <CheckCircle size={22} /> },
              { label: 'Absents', value: agendaStats.absents, color: 'red', icon: <UserX size={22} /> },
            ].map((s) => (
              <div key={s.label} className="stat-card">
                <div className={`stat-card-icon ${s.color}`}>{s.icon}</div>
                <div className="stat-card-info"><h3>{s.label}</h3><div className="stat-value">{s.value}</div></div>
              </div>
            ))}
          </div>

          {agenda.length === 0 ? (
            <div className="card"><div className="card-body"><div className="empty-state">
              <Inbox className="empty-state-icon" />
              <h3>Aucun rendez-vous ce jour</h3>
              <p>L&apos;agenda est libre pour cette date.</p>
            </div></div></div>
          ) : (
            <div className="card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>Heure</th>
                    <th style={{ width: 70 }}>Ticket</th>
                    <th>Patient</th>
                    <th>Médecin</th>
                    <th>Motif</th>
                    <th>Statut</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {agenda.map((rdv) => {
                    const st = statusBadge(RDV_STATUTS, rdv.statut);
                    const dimmed = ['annulé', 'absent'].includes(rdv.statut);
                    return (
                      <tr key={rdv.id} style={{ opacity: dimmed ? 0.55 : 1 }}>
                        <td>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{formatTime(rdv.date_heure)}</div>
                          <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{rdv.duree_minutes || 30} min</div>
                        </td>
                        <td>
                          {rdv.numero_queue ? (
                            <span style={{ display: 'inline-flex', width: 34, height: 34, borderRadius: '50%', alignItems: 'center', justifyContent: 'center', background: 'var(--primary-600)', color: 'white', fontWeight: 800 }}>{rdv.numero_queue}</span>
                          ) : <span style={{ color: 'var(--neutral-300)' }}>—</span>}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{rdv.patients?.prenom} {rdv.patients?.nom}</div>
                          <div style={{ fontSize: 11, color: 'var(--neutral-400)' }}>{rdv.patients?.code_patient}{rdv.patients?.telephone ? ` • ${rdv.patients.telephone}` : ''}</div>
                        </td>
                        <td>Dr. {rdv.personnel?.prenom} {rdv.personnel?.nom}</td>
                        <td style={{ maxWidth: 220 }}>
                          <div>{rdv.motif}</div>
                          <span className={`badge ${rdv.type === 'urgence' ? 'badge-danger' : 'badge-info'}`} style={{ marginTop: 4 }}>{RDV_TYPES[rdv.type] || rdv.type}</span>
                        </td>
                        <td><span className={`badge ${st.badge}`}>{st.label}</span></td>
                        <td>{renderActions(rdv)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-body" style={{ padding: '14px 22px' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="header-search" style={{ flex: 1, minWidth: 250 }}>
                  <Search className="header-search-icon" />
                  <input
                    type="text"
                    placeholder="Rechercher par patient, médecin, code patient ou motif..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: 'var(--neutral-500)', fontSize: 13 }}>Créés du</span>
                  <input type="date" className="form-input" style={{ width: 140, padding: '8px 12px' }} value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
                  <span style={{ color: 'var(--neutral-500)', fontSize: 13 }}>au</span>
                  <input type="date" className="form-input" style={{ width: 140, padding: '8px 12px' }} value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
                  <button onClick={() => { setAppliedDateDebut(dateDebut); setAppliedDateFin(dateFin); }} className="btn btn-primary" style={{ padding: '8px 16px' }}>
                    <Filter size={16} /> Filtrer
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="tabs">
            {['tous', ...Object.keys(RDV_STATUTS)].map((s) => (
              <button key={s} className={`tab ${filterStatut === s ? 'active' : ''}`} onClick={() => setFilterStatut(s)}>
                {s === 'tous' ? `Tous (${rdvs.length})` : `${RDV_STATUTS[s].label} (${rdvs.filter((r) => r.statut === s).length})`}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="card"><div className="card-body"><div className="empty-state">
              <Inbox className="empty-state-icon" />
              <h3>Aucun rendez-vous</h3>
              <p>Il n&apos;y a aucun rendez-vous pour cette sélection.</p>
            </div></div></div>
          ) : (
            <div className="card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Médecin</th>
                    <th>Date & heure</th>
                    <th>Motif</th>
                    <th>Type</th>
                    <th>Statut</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((rdv: any) => {
                    const st = statusBadge(RDV_STATUTS, rdv.statut);
                    return (
                      <tr key={rdv.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{rdv.patients?.prenom} {rdv.patients?.nom}</div>
                          <div style={{ fontSize: 11, color: 'var(--neutral-400)' }}>{rdv.patients?.code_patient}</div>
                        </td>
                        <td>Dr. {rdv.personnel?.prenom} {rdv.personnel?.nom}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{formatDate(rdv.date_heure)}</div>
                          <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>
                            <Clock size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                            {formatTime(rdv.date_heure)} • {rdv.duree_minutes || 30} min
                          </div>
                        </td>
                        <td style={{ maxWidth: 200 }}>{rdv.motif}</td>
                        <td><span className={`badge ${rdv.type === 'urgence' ? 'badge-danger' : 'badge-info'}`}>{RDV_TYPES[rdv.type] || rdv.type}</span></td>
                        <td><span className={`badge ${st.badge}`}>{st.label}</span></td>
                        <td>{renderActions(rdv)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
