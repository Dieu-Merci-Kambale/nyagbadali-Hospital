'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { ScrollText, Loader2, Search, RefreshCw, AlertTriangle, Inbox, ChevronDown, ChevronRight, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDateTime, downloadCsv, explainDbError, startOfDayISO, endOfDayISO } from '@/lib/format';
import type { AuditLog } from '@/types';

const TABLES: Record<string, string> = {
  patients: 'Patients',
  personnel: 'Personnel',
  departements: 'Départements',
  rendez_vous: 'Rendez-vous',
  consultations: 'Consultations',
  prescriptions: 'Prescriptions',
  medicaments: 'Médicaments',
  hospitalisations: 'Hospitalisations',
  lits: 'Lits',
  chambres: 'Chambres',
  factures: 'Factures',
  lignes_facture: 'Lignes de facture',
  paiements: 'Paiements',
  analyses_laboratoire: 'Laboratoire',
  actes_tarifs: 'Tarifs',
};

const ACTIONS: Record<string, { label: string; badge: string }> = {
  INSERT: { label: 'Création', badge: 'badge-success' },
  UPDATE: { label: 'Modification', badge: 'badge-info' },
  DELETE: { label: 'Suppression', badge: 'badge-danger' },
};

const IGNORED_FIELDS = new Set(['updated_at', 'created_at']);

/** Résumé lisible de l'enregistrement concerné. */
function describe(log: AuditLog): string {
  const v = (log.new_values || log.old_values || {}) as Record<string, any>;
  if (v.nom && v.prenom) return `${v.prenom} ${v.nom}`;
  return v.numero_facture || v.nom_commercial || v.nom_medicament || v.type_analyse || v.libelle || v.motif || v.motif_admission || v.nom || v.numero || (v.montant ? `${v.montant} FC` : '') || '';
}

function changedFields(log: AuditLog): { field: string; before: unknown; after: unknown }[] {
  if (log.action !== 'UPDATE' || !log.old_values || !log.new_values) return [];
  const before = log.old_values as Record<string, unknown>;
  const after = log.new_values as Record<string, unknown>;
  return Object.keys(after)
    .filter((k) => !IGNORED_FIELDS.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => ({ field: k, before: before[k], after: after[k] }));
}

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [table, setTable] = useState('toutes');
  const [action, setAction] = useState('toutes');
  const [user, setUser] = useState('');
  const [date, setDate] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(500);
    if (table !== 'toutes') q = q.eq('table_name', table);
    if (action !== 'toutes') q = q.eq('action', action);
    if (user.trim()) q = q.ilike('user_email', `%${user.trim()}%`);
    if (date) q = q.gte('timestamp', startOfDayISO(`${date}T00:00:00`)).lte('timestamp', endOfDayISO(`${date}T00:00:00`));
    const { data, error: e } = await q;
    if (e) {
      setError(explainDbError(e));
      setLogs([]);
    } else {
      setError('');
      setLogs((data || []) as AuditLog[]);
    }
    setLoading(false);
  }, [table, action, user, date]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const exportCsv = () => downloadCsv(
    `journal-activite-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Date', 'Utilisateur', 'Action', 'Module', 'Élément', 'Champs modifiés'],
    logs.map((l) => [
      formatDateTime(l.timestamp), l.user_email || 'système', ACTIONS[l.action]?.label || l.action, TABLES[l.table_name] || l.table_name,
      describe(l), changedFields(l).map((c) => `${c.field}: ${show(c.before)} → ${show(c.after)}`).join(' | '),
    ])
  );

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Journal d&apos;activité</h1>
          <p className="page-subtitle">Traçabilité des créations, modifications et suppressions</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-outline" onClick={exportCsv} disabled={logs.length === 0}><Download size={16} /> Exporter</button>
          <button className="btn btn-outline" onClick={load}><RefreshCw size={16} /> Actualiser</button>
        </div>
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: 20 }}><AlertTriangle size={18} /> {error}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '14px 22px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="header-search" style={{ flex: 1, minWidth: 220 }}>
            <Search className="header-search-icon" />
            <input placeholder="Filtrer par email d'utilisateur..." value={user} onChange={(e) => setUser(e.target.value)} />
          </div>
          <select className="form-select" style={{ width: 190 }} value={table} onChange={(e) => setTable(e.target.value)}>
            <option value="toutes">Tous les modules</option>
            {Object.entries(TABLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="form-select" style={{ width: 170 }} value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="toutes">Toutes les actions</option>
            {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input type="date" className="form-input" style={{ width: 160 }} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>
      ) : logs.length === 0 ? (
        <div className="card"><div className="card-body"><div className="empty-state">
          <Inbox className="empty-state-icon" />
          <h3>Aucune activité</h3>
          <p>Les actions effectuées dans l&apos;application seront enregistrées ici automatiquement.</p>
        </div></div></div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}></th>
                <th>Date</th>
                <th>Utilisateur</th>
                <th>Action</th>
                <th>Module</th>
                <th>Élément</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => {
                const a = ACTIONS[l.action] || { label: l.action, badge: 'badge-neutral' };
                const changes = changedFields(l);
                const isOpen = expanded === l.id;
                return (
                  <Fragment key={l.id}>
                    <tr onClick={() => setExpanded(isOpen ? null : l.id)} style={{ cursor: 'pointer' }}>
                      <td>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                      <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDateTime(l.timestamp)}</td>
                      <td style={{ fontSize: 13 }}>{l.user_email || 'système'}</td>
                      <td><span className={`badge ${a.badge}`}>{a.label}</span></td>
                      <td>{TABLES[l.table_name] || l.table_name}</td>
                      <td style={{ maxWidth: 280, fontSize: 13 }}>
                        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{describe(l) || '—'}</div>
                        {changes.length > 0 && <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{changes.length} champ(s) : {changes.slice(0, 3).map((c) => c.field).join(', ')}{changes.length > 3 ? '…' : ''}</div>}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td></td>
                        <td colSpan={5} style={{ background: 'var(--neutral-50)' }}>
                          {changes.length > 0 ? (
                            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                              <thead><tr style={{ textAlign: 'left', color: 'var(--neutral-500)' }}><th style={{ padding: 4 }}>Champ</th><th style={{ padding: 4 }}>Avant</th><th style={{ padding: 4 }}>Après</th></tr></thead>
                              <tbody>
                                {changes.map((c) => (
                                  <tr key={c.field}>
                                    <td style={{ padding: 4, fontFamily: 'monospace', fontWeight: 600 }}>{c.field}</td>
                                    <td style={{ padding: 4, color: 'var(--danger-600)', wordBreak: 'break-word' }}>{show(c.before)}</td>
                                    <td style={{ padding: 4, color: 'var(--success-600)', wordBreak: 'break-word' }}>{show(c.after)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, maxHeight: 240, overflow: 'auto' }}>
                              {JSON.stringify(l.new_values || l.old_values, null, 2)}
                            </pre>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {logs.length === 500 && <p style={{ padding: 12, fontSize: 12, color: 'var(--neutral-500)', textAlign: 'center' }}>Affichage limité aux 500 dernières entrées : affinez les filtres pour remonter plus loin.</p>}
        </div>
      )}
      <p style={{ marginTop: 12, fontSize: 12, color: 'var(--neutral-400)', display: 'flex', gap: 6, alignItems: 'center' }}>
        <ScrollText size={12} /> Le journal est alimenté automatiquement par la base de données et ne peut pas être modifié.
      </p>
    </div>
  );
}
