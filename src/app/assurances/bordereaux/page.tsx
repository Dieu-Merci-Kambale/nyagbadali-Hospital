'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, AlertTriangle, Search, Plus, Inbox, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Pagination from '@/components/ui/Pagination';
import { usePagination } from '@/lib/usePagination';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import { formatMoney, formatDate, statusBadge, explainDbError } from '@/lib/format';
import AssuranceHeader from '@/components/assurances/AssuranceHeader';
import { BORDEREAU_STATUTS, fetchAssureurs, type Assureur, type BordereauAssurance } from '@/lib/assurances';

export default function BordereauxPage() {
  const [bordereaux, setBordereaux] = useState<BordereauAssurance[]>([]);
  const [assureurs, setAssureurs] = useState<Assureur[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState('');
  const [search, setSearch] = useState('');
  const [assureur, setAssureur] = useState('');
  const [statut, setStatut] = useState('actifs');

  const load = useCallback(async () => {
    const [{ data, error }, { assureurs: list }] = await Promise.all([
      supabase.from('v_bordereaux_assurance').select('*').order('date_emission', { ascending: false }),
      fetchAssureurs({ inclureInactifs: true }),
    ]);
    if (error) setDbError(explainDbError(error));
    else setDbError('');
    setBordereaux((data || []) as BordereauAssurance[]);
    setAssureurs(list);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load, ['bordereaux_assurance', 'paiements_assurance', 'litiges_assurance']);

  const filtered = bordereaux.filter((b) => {
    const q = search.trim().toLowerCase();
    const okStatut = statut === 'tous' ? true
      : statut === 'actifs' ? b.statut_calcule !== 'annulé' && b.statut_calcule !== 'payé'
        : statut === 'retard' ? b.en_retard
          : b.statut_calcule === statut;
    return okStatut && (!assureur || b.assureur_id === assureur)
      && (!q || b.numero.toLowerCase().includes(q) || b.assureur_nom.toLowerCase().includes(q));
  });
  const { pageItems, page, pageCount, total, setPage } = usePagination(filtered, [search, assureur, statut]);
  const totalReste = filtered.filter((b) => b.statut !== 'annulé').reduce((s, b) => s + Number(b.reste), 0);

  return (
    <div className="animate-fade-in">
      <AssuranceHeader
        title="Bordereaux"
        subtitle="Factures adressées aux assureurs pour le paiement de leur part"
        actions={<Link href="/assurances/bordereaux/nouveau" className="btn btn-primary"><Plus size={16} /> Nouveau bordereau</Link>}
      />

      {dbError && <div className="alert alert-danger" style={{ marginBottom: 20 }}><AlertTriangle size={18} /> {dbError}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '14px 22px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="header-search" style={{ flex: 1, minWidth: 220 }}>
            <Search className="header-search-icon" />
            <input type="text" placeholder="N° de bordereau ou assureur..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="form-select" style={{ width: 200 }} value={assureur} onChange={(e) => setAssureur(e.target.value)}>
            <option value="">Tous les assureurs</option>
            {assureurs.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
          </select>
          <select className="form-select" style={{ width: 200 }} value={statut} onChange={(e) => setStatut(e.target.value)}>
            <option value="actifs">En cours (non soldés)</option>
            <option value="retard">Échéance dépassée</option>
            {Object.entries(BORDEREAU_STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            <option value="tous">Tous</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="card"><div className="card-body"><div className="empty-state">
          <Inbox className="empty-state-icon" />
          <h3>Aucun bordereau</h3>
          <p>Regroupez les factures à réclamer d’un assureur dans un bordereau pour lui demander le paiement.</p>
        </div></div></div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Bordereau</th>
                <th>Assureur</th>
                <th>Période</th>
                <th>Statut</th>
                <th style={{ textAlign: 'right' }}>Factures</th>
                <th style={{ textAlign: 'right' }}>Réclamé</th>
                <th style={{ textAlign: 'right' }}>Réglé</th>
                <th style={{ textAlign: 'right' }}>Reste</th>
                <th>Échéance</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((b) => {
                const st = statusBadge(BORDEREAU_STATUTS, b.statut_calcule);
                return (
                  <tr key={b.id} style={{ opacity: b.statut === 'annulé' ? 0.55 : 1 }}>
                    <td><Link href={`/assurances/bordereaux/${b.id}`} style={{ fontWeight: 600 }}>{b.numero}</Link><div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>Émis le {formatDate(b.date_emission)}</div></td>
                    <td>{b.assureur_nom}</td>
                    <td style={{ fontSize: 12 }}>{b.periode_debut || b.periode_fin ? `${formatDate(b.periode_debut)} → ${formatDate(b.periode_fin)}` : '—'}</td>
                    <td>
                      <span className={`badge ${st.badge}`}>{st.label}</span>
                      {b.litiges_ouverts > 0 && <div style={{ fontSize: 11, color: 'var(--danger)' }}>{b.litiges_ouverts} litige(s)</div>}
                    </td>
                    <td style={{ textAlign: 'right' }}>{b.nb_factures}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(b.montant)}</td>
                    <td style={{ textAlign: 'right', color: Number(b.paye) > 0 ? 'var(--success)' : undefined }}>{formatMoney(b.paye)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{b.statut === 'annulé' ? '—' : formatMoney(b.reste)}</td>
                    <td style={{ color: b.en_retard ? 'var(--danger)' : undefined, fontWeight: b.en_retard ? 600 : 400 }}>{b.date_echeance ? formatDate(b.date_echeance) : '—'}</td>
                    <td style={{ textAlign: 'right' }}><Link href={`/assurances/bordereaux/${b.id}`} className="btn btn-ghost btn-sm"><ChevronRight size={16} /></Link></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={7}>TOTAL RESTANT DÛ — {filtered.length} bordereau(x)</td>
                <td style={{ textAlign: 'right' }}>{formatMoney(totalReste)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
          <Pagination page={page} pageCount={pageCount} total={total} onPageChange={setPage} label="bordereaux" />
        </div>
      )}
    </div>
  );
}
