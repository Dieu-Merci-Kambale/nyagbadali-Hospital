'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, AlertTriangle, Search, Scale, Download, FileStack, Inbox } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Pagination from '@/components/ui/Pagination';
import { usePagination } from '@/lib/usePagination';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import { fetchAll } from '@/lib/reports/helpers';
import { formatMoney, formatDate, statusBadge, downloadCsv, explainDbError } from '@/lib/format';
import AssuranceHeader from '@/components/assurances/AssuranceHeader';
import { OuvrirLitigeModal } from '@/components/assurances/LitigeModals';
import { CREANCE_STATUTS, STATUTS_OUVERTS, fetchAssureurs, type Assureur, type CreanceAssurance } from '@/lib/assurances';

const FILTRES_STATUT = [
  { value: 'ouvertes', label: 'À recouvrer (toutes)' },
  { value: 'retard', label: 'Échéance dépassée' },
  ...Object.entries(CREANCE_STATUTS).map(([value, s]) => ({ value, label: s.label })),
  { value: 'toutes', label: 'Toutes les créances' },
];

function CreancesContent() {
  const params = useSearchParams();
  const [creances, setCreances] = useState<CreanceAssurance[]>([]);
  const [assureurs, setAssureurs] = useState<Assureur[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState('');
  const [assureur, setAssureur] = useState(params.get('assureur') || '');
  const [statut, setStatut] = useState(params.get('statut') || 'ouvertes');
  const [search, setSearch] = useState('');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [litigeSur, setLitigeSur] = useState<CreanceAssurance | null>(null);

  const load = useCallback(async () => {
    try {
      const [rows, { assureurs: list }] = await Promise.all([
        fetchAll<CreanceAssurance>((a, b) => supabase.from('v_creances_assurance').select('*').order('date_facture', { ascending: false }).range(a, b)),
        fetchAssureurs({ inclureInactifs: true }),
      ]);
      setCreances(rows);
      setAssureurs(list);
      setDbError('');
    } catch (e) {
      setDbError(e instanceof Error ? e.message : explainDbError(null));
    }
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load, ['paiements_assurance', 'litiges_assurance', 'bordereaux_assurance', 'factures']);

  const filtered = useMemo(() => creances.filter((c) => {
    const q = search.trim().toLowerCase();
    const d = c.date_facture.slice(0, 10);
    const okStatut = statut === 'toutes' ? true
      : statut === 'ouvertes' ? STATUTS_OUVERTS.includes(c.statut_assurance)
        : statut === 'retard' ? c.en_retard
          : c.statut_assurance === statut;
    return okStatut
      && (!assureur || c.assureur_id === assureur)
      && (!du || d >= du) && (!au || d <= au)
      && (!q || [c.numero_facture, c.patient_nom, c.patient_prenom, c.code_patient, c.numero_assurance, c.bordereau_numero]
        .some((v) => (v || '').toLowerCase().includes(q)));
  }), [creances, search, statut, assureur, du, au]);

  const { pageItems, page, pageCount, total, setPage } = usePagination(filtered, [search, statut, assureur, du, au]);
  const totaux = filtered.reduce((s, c) => ({
    part: s.part + Number(c.montant_assurance), paye: s.paye + Number(c.paye), conteste: s.conteste + Number(c.montant_conteste), reste: s.reste + Number(c.reste),
  }), { part: 0, paye: 0, conteste: 0, reste: 0 });

  const exporter = () => downloadCsv(
    `creances-assurances-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Date', 'Facture', 'Assureur', 'Patient', 'Code patient', 'N° assuré', 'Statut', 'Bordereau', 'Échéance', 'Part assurance', 'Réglé', 'Contesté', 'Abandonné', 'Reste dû'],
    filtered.map((c) => [
      formatDate(c.date_facture), c.numero_facture, c.assureur_nom, `${c.patient_prenom} ${c.patient_nom}`, c.code_patient, c.numero_assurance,
      CREANCE_STATUTS[c.statut_assurance]?.label || c.statut_assurance, c.bordereau_numero, c.date_echeance ? formatDate(c.date_echeance) : '',
      Number(c.montant_assurance), Number(c.paye), Number(c.montant_conteste), Number(c.abandonne), Number(c.reste),
    ]),
  );

  const aReclamer = filtered.filter((c) => c.statut_assurance === 'à_réclamer');

  return (
    <div className="animate-fade-in">
      <AssuranceHeader
        title="Créances sur les assureurs"
        subtitle="Part assurance de chaque facture : réclamation, règlement, litiges et reste dû"
        actions={(
          <>
            <button className="btn btn-outline" onClick={exporter} disabled={!filtered.length}><Download size={16} /> Exporter</button>
            {assureur && aReclamer.length > 0 && (
              <Link href={`/assurances/bordereaux/nouveau?assureur=${assureur}`} className="btn btn-primary">
                <FileStack size={16} /> Réclamer {aReclamer.length} facture(s)
              </Link>
            )}
          </>
        )}
      />

      {dbError && <div className="alert alert-danger" style={{ marginBottom: 20 }}><AlertTriangle size={18} /> {dbError}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '14px 22px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="header-search" style={{ flex: 1, minWidth: 220 }}>
            <Search className="header-search-icon" />
            <input type="text" placeholder="Facture, patient, n° assuré, bordereau..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="form-select" style={{ width: 200 }} value={assureur} onChange={(e) => setAssureur(e.target.value)}>
            <option value="">Tous les assureurs</option>
            {assureurs.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
          </select>
          <select className="form-select" style={{ width: 210 }} value={statut} onChange={(e) => setStatut(e.target.value)}>
            {FILTRES_STATUT.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            Du <input type="date" className="form-input" style={{ width: 150 }} value={du} onChange={(e) => setDu(e.target.value)} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            au <input type="date" className="form-input" style={{ width: 150 }} value={au} onChange={(e) => setAu(e.target.value)} />
          </label>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="card"><div className="card-body"><div className="empty-state">
          <Inbox className="empty-state-icon" />
          <h3>Aucune créance</h3>
          <p>Aucune facture ne correspond à ces critères.</p>
        </div></div></div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Facture</th>
                <th>Assureur</th>
                <th>Patient</th>
                <th>Statut</th>
                <th>Bordereau</th>
                <th style={{ textAlign: 'right' }}>Part assurance</th>
                <th style={{ textAlign: 'right' }}>Réglé</th>
                <th style={{ textAlign: 'right' }}>Reste dû</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((c) => {
                const st = statusBadge(CREANCE_STATUTS, c.statut_assurance);
                const contestable = STATUTS_OUVERTS.includes(c.statut_assurance) && Number(c.reste) - Number(c.montant_conteste) > 0;
                return (
                  <tr key={c.facture_id} style={{ background: c.en_retard ? 'var(--danger-50, #fef2f2)' : undefined }}>
                    <td>
                      <Link href={`/facturation/${c.facture_id}`} style={{ fontWeight: 600 }}>{c.numero_facture}</Link>
                      <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{formatDate(c.date_facture)}</div>
                    </td>
                    <td>{c.assureur_id ? <Link href={`/assurances/assureurs/${c.assureur_id}`}>{c.assureur_nom}</Link> : <span style={{ color: 'var(--danger)' }}>Non rattachée</span>}</td>
                    <td>
                      {c.patient_prenom} {c.patient_nom}
                      <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{c.numero_assurance ? `N° ${c.numero_assurance}` : c.code_patient}</div>
                    </td>
                    <td>
                      <span className={`badge ${st.badge}`}>{st.label}</span>
                      {c.en_retard && <div style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>Échue le {formatDate(c.date_echeance)}</div>}
                      {Number(c.montant_conteste) > 0 && <div style={{ fontSize: 11, color: 'var(--danger)' }}>{formatMoney(c.montant_conteste)} contestés</div>}
                    </td>
                    <td>{c.bordereau_id ? <Link href={`/assurances/bordereaux/${c.bordereau_id}`}>{c.bordereau_numero}</Link> : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(c.montant_assurance)}</td>
                    <td style={{ textAlign: 'right', color: Number(c.paye) > 0 ? 'var(--success)' : undefined }}>{formatMoney(c.paye)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(c.reste)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-ghost btn-sm" title="Ouvrir un litige" disabled={!contestable} onClick={() => setLitigeSur(c)}>
                        <Scale size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={5}>TOTAL — {filtered.length} facture(s){totaux.conteste > 0 ? ` • ${formatMoney(totaux.conteste)} contestés` : ''}</td>
                <td style={{ textAlign: 'right' }}>{formatMoney(totaux.part)}</td>
                <td style={{ textAlign: 'right' }}>{formatMoney(totaux.paye)}</td>
                <td style={{ textAlign: 'right' }}>{formatMoney(totaux.reste)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
          <Pagination page={page} pageCount={pageCount} total={total} onPageChange={setPage} label="factures" />
        </div>
      )}

      <OuvrirLitigeModal creance={litigeSur} onClose={() => setLitigeSur(null)} onSaved={load} />
    </div>
  );
}

export default function CreancesPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>}>
      <CreancesContent />
    </Suspense>
  );
}
