'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, AlertTriangle, Search, Plus, Inbox, Ban, Download, ChevronDown, ChevronRight, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import Pagination from '@/components/ui/Pagination';
import { usePagination } from '@/lib/usePagination';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import { canCancelOperationAssurance } from '@/lib/role-permissions';
import { formatMoney, formatDate, formatDateTime, MODES_PAIEMENT, downloadCsv, explainDbError } from '@/lib/format';
import { toast } from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import AssuranceHeader from '@/components/assurances/AssuranceHeader';
import ReglementModal from '@/components/assurances/ReglementModal';
import { fetchAssureurs, totalReglements, type Assureur, type PaiementAssurance } from '@/lib/assurances';

type Reglement = PaiementAssurance & {
  assureurs?: { nom: string } | null;
  bordereaux_assurance?: { numero: string } | null;
  personnel?: { nom: string; prenom: string } | null;
  paiements_assurance_factures?: { montant: number; facture_id: string; factures?: { numero_facture: string } | null }[];
};

export default function ReglementsPage() {
  const { profile } = useAuth();
  const canCancel = canCancelOperationAssurance(profile?.role);
  const [reglements, setReglements] = useState<Reglement[]>([]);
  const [assureurs, setAssureurs] = useState<Assureur[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState('');
  const [search, setSearch] = useState('');
  const [assureur, setAssureur] = useState('');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [showAnnules, setShowAnnules] = useState(false);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [annulation, setAnnulation] = useState<{ r: Reglement; motif: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [{ data, error }, { assureurs: list }] = await Promise.all([
      supabase.from('paiements_assurance')
        .select('*, assureurs(nom), bordereaux_assurance(numero), personnel(nom, prenom), paiements_assurance_factures(montant, facture_id, factures(numero_facture))')
        .order('date_paiement', { ascending: false }),
      fetchAssureurs({ inclureInactifs: true }),
    ]);
    if (error) setDbError(explainDbError(error));
    else setDbError('');
    setReglements((data || []) as Reglement[]);
    setAssureurs(list);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load, ['paiements_assurance']);

  const filtered = reglements.filter((r) => {
    const q = search.trim().toLowerCase();
    const d = r.date_paiement.slice(0, 10);
    return (showAnnules || r.statut !== 'annulé') && (!assureur || r.assureur_id === assureur)
      && (!du || d >= du) && (!au || d <= au)
      && (!q || [r.numero, r.reference, r.assureurs?.nom, r.bordereaux_assurance?.numero].some((v) => (v || '').toLowerCase().includes(q)));
  });
  const { pageItems, page, pageCount, total, setPage } = usePagination(filtered, [search, assureur, du, au, showAnnules]);
  const totalValide = totalReglements(filtered);

  const exporter = () => downloadCsv(
    `reglements-assureurs-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Date', 'N° règlement', 'Assureur', 'Bordereau', 'Mode', 'Référence', 'Statut', 'Montant', 'Factures réglées'],
    filtered.map((r) => [
      formatDate(r.date_paiement), r.numero, r.assureurs?.nom, r.bordereaux_assurance?.numero, MODES_PAIEMENT[r.mode_paiement] || r.mode_paiement,
      r.reference, r.statut === 'annulé' ? 'Annulé' : 'Validé', Number(r.montant),
      (r.paiements_assurance_factures || []).map((p) => `${p.factures?.numero_facture} (${Number(p.montant)})`).join(', '),
    ]),
  );

  const annuler = async () => {
    if (!annulation?.motif.trim()) return;
    setSaving(true);
    const { error } = await supabase.rpc('annuler_paiement_assurance', { p_paiement_id: annulation.r.id, p_motif: annulation.motif });
    setSaving(false);
    if (error) return toast.error(explainDbError(error));
    toast.success('Règlement annulé : les factures concernées redeviennent dues.');
    setAnnulation(null);
    load();
  };

  return (
    <div className="animate-fade-in">
      <AssuranceHeader
        title="Règlements des assureurs"
        subtitle="Paiements reçus des assureurs, comptabilisés dans les encaissements de l’hôpital"
        actions={(
          <>
            <button className="btn btn-outline" onClick={exporter} disabled={!filtered.length}><Download size={16} /> Exporter</button>
            <button className="btn btn-primary" onClick={() => setShowNew(true)} disabled={!!dbError}><Plus size={16} /> Enregistrer un règlement</button>
          </>
        )}
      />

      {dbError && <div className="alert alert-danger" style={{ marginBottom: 20 }}><AlertTriangle size={18} /> {dbError}</div>}
      {!canCancel && (
        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          <Lock size={18} /> Un règlement enregistré ne peut être annulé que par l&apos;administration. Vérifiez le montant et la répartition avant de valider.
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '14px 22px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="header-search" style={{ flex: 1, minWidth: 220 }}>
            <Search className="header-search-icon" />
            <input type="text" placeholder="N° règlement, référence, bordereau..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="form-select" style={{ width: 200 }} value={assureur} onChange={(e) => setAssureur(e.target.value)}>
            <option value="">Tous les assureurs</option>
            {assureurs.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>Du <input type="date" className="form-input" style={{ width: 150 }} value={du} onChange={(e) => setDu(e.target.value)} /></label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>au <input type="date" className="form-input" style={{ width: 150 }} value={au} onChange={(e) => setAu(e.target.value)} /></label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={showAnnules} onChange={(e) => setShowAnnules(e.target.checked)} /> Annulés
          </label>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="card"><div className="card-body"><div className="empty-state">
          <Inbox className="empty-state-icon" />
          <h3>Aucun règlement</h3>
          <p>Les paiements reçus des assureurs (virements, chèques…) s’enregistrent ici.</p>
        </div></div></div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 32 }} />
                <th>Date</th>
                <th>N° règlement</th>
                <th>Assureur</th>
                <th>Bordereau</th>
                <th>Mode / référence</th>
                <th style={{ textAlign: 'right' }}>Montant</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((r) => {
                const annule = r.statut === 'annulé';
                const deplie = ouvert === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr style={{ opacity: annule ? 0.55 : 1 }}>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => setOuvert(deplie ? null : r.id)} title="Factures réglées">
                          {deplie ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      <td>{formatDate(r.date_paiement)}</td>
                      <td style={{ fontWeight: 600 }}>{r.numero}{annule && <div><span className="badge badge-danger">Annulé</span></div>}</td>
                      <td><Link href={`/assurances/assureurs/${r.assureur_id}`}>{r.assureurs?.nom || '—'}</Link></td>
                      <td>{r.bordereau_id ? <Link href={`/assurances/bordereaux/${r.bordereau_id}`}>{r.bordereaux_assurance?.numero}</Link> : '—'}</td>
                      <td style={{ fontSize: 13 }}>{MODES_PAIEMENT[r.mode_paiement] || r.mode_paiement}{r.reference && <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{r.reference}</div>}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(r.montant)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {canCancel && !annule && (
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} title="Annuler le règlement" onClick={() => setAnnulation({ r, motif: '' })}><Ban size={14} /></button>
                        )}
                      </td>
                    </tr>
                    {deplie && (
                      <tr>
                        <td />
                        <td colSpan={7} style={{ background: 'var(--neutral-50)', fontSize: 13 }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                            {(r.paiements_assurance_factures || []).map((p) => (
                              <Link key={p.facture_id} href={`/facturation/${p.facture_id}`} className="badge badge-info" style={{ textDecoration: 'none' }}>
                                {p.factures?.numero_facture} : {formatMoney(p.montant)}
                              </Link>
                            ))}
                          </div>
                          <div style={{ color: 'var(--neutral-500)', fontSize: 12 }}>
                            Enregistré le {formatDateTime(r.created_at)}{r.personnel ? ` par ${r.personnel.prenom} ${r.personnel.nom}` : ''}
                            {r.notes ? ` • ${r.notes}` : ''}
                            {annule && r.motif_annulation ? ` • Motif d’annulation : ${r.motif_annulation}` : ''}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={6}>TOTAL ENCAISSÉ (règlements validés)</td>
                <td style={{ textAlign: 'right' }}>{formatMoney(totalValide)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
          <Pagination page={page} pageCount={pageCount} total={total} onPageChange={setPage} label="règlements" />
        </div>
      )}

      <ReglementModal open={showNew} onClose={() => setShowNew(false)} onSaved={load} />

      <Modal
        open={!!annulation}
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Ban size={18} /> Annuler le règlement {annulation?.r.numero}</span>}
        onClose={() => setAnnulation(null)}
        footer={(
          <>
            <button className="btn btn-outline" onClick={() => setAnnulation(null)}>Retour</button>
            <button className="btn btn-danger" onClick={annuler} disabled={saving || !annulation?.motif.trim()}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />} Annuler le règlement
            </button>
          </>
        )}
      >
        {annulation && (
          <>
            <p style={{ fontSize: 14, marginTop: 0 }}>
              Le règlement de <strong>{formatMoney(annulation.r.montant)}</strong> reçu de {annulation.r.assureurs?.nom} sera retiré des encaissements, et ses factures redeviendront dues.
            </p>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Motif de l’annulation *</label>
              <textarea className="form-textarea" rows={3} value={annulation.motif} onChange={(e) => setAnnulation({ ...annulation, motif: e.target.value })} placeholder="Ex : chèque rejeté, erreur de saisie du montant…" />
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
