'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, AlertTriangle, Search, Plus, Inbox, Gavel, PlayCircle, Ban, Scale } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';
import Pagination from '@/components/ui/Pagination';
import { usePagination } from '@/lib/usePagination';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import { formatMoney, formatDate, statusBadge, explainDbError } from '@/lib/format';
import Modal from '@/components/ui/Modal';
import AssuranceHeader from '@/components/assurances/AssuranceHeader';
import { OuvrirLitigeModal, ResoudreLitigeModal } from '@/components/assurances/LitigeModals';
import {
  LITIGE_STATUTS, MOTIFS_LITIGE, STATUTS_OUVERTS, fetchAssureurs,
  type Assureur, type CreanceAssurance, type LitigeAssurance,
} from '@/lib/assurances';

type Litige = LitigeAssurance & {
  assureurs?: { nom: string } | null;
  factures?: { numero_facture: string; patients?: { nom: string; prenom: string } | null } | null;
};

export default function LitigesPage() {
  const { confirm } = useConfirm();
  const [litiges, setLitiges] = useState<Litige[]>([]);
  const [assureurs, setAssureurs] = useState<Assureur[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState('');
  const [search, setSearch] = useState('');
  const [statut, setStatut] = useState('ouverts');
  const [assureur, setAssureur] = useState('');
  const [motif, setMotif] = useState('');
  const [aResoudre, setAResoudre] = useState<Litige | null>(null);
  const [choix, setChoix] = useState(false);
  const [creances, setCreances] = useState<CreanceAssurance[]>([]);
  const [rechercheFacture, setRechercheFacture] = useState('');
  const [litigeSur, setLitigeSur] = useState<CreanceAssurance | null>(null);

  const load = useCallback(async () => {
    const [{ data, error }, { assureurs: list }] = await Promise.all([
      supabase.from('litiges_assurance')
        .select('*, assureurs(nom), factures(numero_facture, patients(nom, prenom))')
        .order('date_ouverture', { ascending: false }),
      fetchAssureurs({ inclureInactifs: true }),
    ]);
    if (error) setDbError(explainDbError(error));
    else setDbError('');
    setLitiges((data || []) as Litige[]);
    setAssureurs(list);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load, ['litiges_assurance']);

  const ouvrirChoix = async () => {
    setChoix(true);
    setRechercheFacture('');
    const { data, error } = await supabase.from('v_creances_assurance').select('*').gt('reste', 0).order('date_facture', { ascending: false }).limit(500);
    if (error) toast.error(explainDbError(error));
    setCreances(((data || []) as CreanceAssurance[]).filter((c) => STATUTS_OUVERTS.includes(c.statut_assurance) && Number(c.reste) - Number(c.montant_conteste) > 0));
  };

  const majStatut = async (l: Litige, nouveau: 'en_cours' | 'annulé') => {
    if (nouveau === 'annulé') {
      const ok = await confirm({
        title: 'Annuler le litige',
        message: `Le litige ${l.numero} sera annulé (ouvert par erreur ou retiré par l’assureur) : le montant redevient dû normalement par l’assureur.`,
        confirmText: 'Annuler le litige',
        type: 'warning',
      });
      if (!ok) return;
    }
    const { error } = await supabase.rpc('maj_litige_assurance', { p_litige_id: l.id, p_statut: nouveau, p_description: null });
    if (error) return toast.error(explainDbError(error));
    toast.success(nouveau === 'en_cours' ? 'Litige pris en charge.' : 'Litige annulé.');
    load();
  };

  const filtered = litiges.filter((l) => {
    const q = search.trim().toLowerCase();
    const okStatut = statut === 'tous' ? true : statut === 'ouverts' ? l.statut === 'ouvert' || l.statut === 'en_cours' : l.statut === statut;
    return okStatut && (!assureur || l.assureur_id === assureur) && (!motif || l.motif === motif)
      && (!q || [l.numero, l.factures?.numero_facture, l.factures?.patients?.nom, l.factures?.patients?.prenom, l.description]
        .some((v) => (v || '').toLowerCase().includes(q)));
  });
  const { pageItems, page, pageCount, total, setPage } = usePagination(filtered, [search, statut, assureur, motif]);

  const stats = useMemo(() => {
    const ouverts = litiges.filter((l) => l.statut === 'ouvert' || l.statut === 'en_cours');
    const resolus = litiges.filter((l) => l.statut === 'résolu');
    const duree = resolus.length
      ? resolus.reduce((s, l) => s + (new Date(l.date_resolution || l.date_ouverture).getTime() - new Date(l.date_ouverture).getTime()), 0) / resolus.length / 86400000
      : 0;
    const somme = (k: 'montant_accepte' | 'montant_transfere' | 'montant_abandonne') => resolus.reduce((s, l) => s + Number(l[k]), 0);
    return {
      ouverts: ouverts.length,
      conteste: ouverts.reduce((s, l) => s + Number(l.montant_conteste), 0),
      duree,
      accepte: somme('montant_accepte'),
      transfere: somme('montant_transfere'),
      abandonne: somme('montant_abandonne'),
    };
  }, [litiges]);

  // Objet stable : la fenêtre de décision ne se réinitialise pas à chaque actualisation
  const litigeDecision = useMemo(
    () => (aResoudre ? { ...aResoudre, numero_facture: aResoudre.factures?.numero_facture, assureur_nom: aResoudre.assureurs?.nom } : null),
    [aResoudre],
  );

  const choixFiltres = creances.filter((c) => {
    const q = rechercheFacture.trim().toLowerCase();
    return !q || [c.numero_facture, c.patient_nom, c.patient_prenom, c.assureur_nom].some((v) => (v || '').toLowerCase().includes(q));
  }).slice(0, 30);

  return (
    <div className="animate-fade-in">
      <AssuranceHeader
        title="Litiges avec les assureurs"
        subtitle="Montants contestés ou refusés par les assureurs, par facture, et décisions prises"
        actions={<button className="btn btn-primary" onClick={ouvrirChoix} disabled={!!dbError}><Plus size={16} /> Nouveau litige</button>}
      />

      {dbError && <div className="alert alert-danger" style={{ marginBottom: 20 }}><AlertTriangle size={18} /> {dbError}</div>}

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card"><div className="stat-card-icon red"><Scale size={22} /></div><div className="stat-card-info"><h3>Litiges ouverts</h3><div className="stat-value">{stats.ouverts}</div><div className="stat-change negative">{formatMoney(stats.conteste)} contestés</div></div></div>
        <div className="stat-card"><div className="stat-card-icon green"><Gavel size={22} /></div><div className="stat-card-info"><h3>Obtenu de l’assureur</h3><div className="stat-value">{formatMoney(stats.accepte)}</div><div className="stat-change">après contestation</div></div></div>
        <div className="stat-card"><div className="stat-card-icon orange"><Gavel size={22} /></div><div className="stat-card-info"><h3>Reporté aux patients</h3><div className="stat-value">{formatMoney(stats.transfere)}</div></div></div>
        <div className="stat-card"><div className="stat-card-icon purple"><Gavel size={22} /></div><div className="stat-card-info"><h3>Abandonné (pertes)</h3><div className="stat-value">{formatMoney(stats.abandonne)}</div><div className="stat-change">Durée moyenne : {Math.round(stats.duree)} j</div></div></div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '14px 22px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="header-search" style={{ flex: 1, minWidth: 220 }}>
            <Search className="header-search-icon" />
            <input type="text" placeholder="N° litige, facture, patient..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="form-select" style={{ width: 180 }} value={statut} onChange={(e) => setStatut(e.target.value)}>
            <option value="ouverts">À traiter</option>
            {Object.entries(LITIGE_STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            <option value="tous">Tous</option>
          </select>
          <select className="form-select" style={{ width: 190 }} value={assureur} onChange={(e) => setAssureur(e.target.value)}>
            <option value="">Tous les assureurs</option>
            {assureurs.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
          </select>
          <select className="form-select" style={{ width: 230 }} value={motif} onChange={(e) => setMotif(e.target.value)}>
            <option value="">Tous les motifs</option>
            {Object.entries(MOTIFS_LITIGE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="card"><div className="card-body"><div className="empty-state">
          <Inbox className="empty-state-icon" />
          <h3>Aucun litige</h3>
          <p>Ouvrez un litige quand un assureur conteste ou refuse tout ou partie d’une facture.</p>
        </div></div></div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Litige</th>
                <th>Facture / patient</th>
                <th>Assureur</th>
                <th>Motif</th>
                <th>Statut</th>
                <th style={{ textAlign: 'right' }}>Contesté</th>
                <th>Décision</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((l) => {
                const st = statusBadge(LITIGE_STATUTS, l.statut);
                const actif = l.statut === 'ouvert' || l.statut === 'en_cours';
                return (
                  <tr key={l.id} style={{ opacity: l.statut === 'annulé' ? 0.55 : 1 }}>
                    <td style={{ fontWeight: 600 }}>{l.numero}<div style={{ fontSize: 11, color: 'var(--neutral-500)', fontWeight: 400 }}>{formatDate(l.date_ouverture)}</div></td>
                    <td>
                      <Link href={`/facturation/${l.facture_id}`} style={{ fontWeight: 600 }}>{l.factures?.numero_facture || '—'}</Link>
                      <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{l.factures?.patients ? `${l.factures.patients.prenom} ${l.factures.patients.nom}` : ''}</div>
                    </td>
                    <td><Link href={`/assurances/assureurs/${l.assureur_id}`}>{l.assureurs?.nom || '—'}</Link></td>
                    <td style={{ fontSize: 13, maxWidth: 240 }}>
                      {MOTIFS_LITIGE[l.motif] || l.motif}
                      {l.description && <div style={{ fontSize: 11, color: 'var(--neutral-500)', whiteSpace: 'pre-wrap' }}>{l.description}</div>}
                    </td>
                    <td><span className={`badge ${st.badge}`}>{st.label}</span></td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(l.montant_conteste)}</td>
                    <td style={{ fontSize: 12 }}>
                      {l.statut === 'résolu' ? (
                        <>
                          {Number(l.montant_accepte) > 0 && <div style={{ color: 'var(--success)' }}>Assureur : {formatMoney(l.montant_accepte)}</div>}
                          {Number(l.montant_transfere) > 0 && <div>Patient : {formatMoney(l.montant_transfere)}</div>}
                          {Number(l.montant_abandonne) > 0 && <div style={{ color: 'var(--danger)' }}>Perte : {formatMoney(l.montant_abandonne)}</div>}
                          {l.resolution && <div style={{ color: 'var(--neutral-500)' }}>{l.resolution}</div>}
                        </>
                      ) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {actif && (
                        <>
                          {l.statut === 'ouvert' && <button className="btn btn-ghost btn-sm" title="Prendre en charge (en cours)" onClick={() => majStatut(l, 'en_cours')}><PlayCircle size={14} /></button>}
                          <button className="btn btn-primary btn-sm" onClick={() => setAResoudre(l)}><Gavel size={14} /> Décision</button>
                          <button className="btn btn-ghost btn-sm" title="Annuler le litige" style={{ color: 'var(--danger)' }} onClick={() => majStatut(l, 'annulé')}><Ban size={14} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} pageCount={pageCount} total={total} onPageChange={setPage} label="litiges" />
        </div>
      )}

      <Modal
        open={choix}
        maxWidth={720}
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Scale size={18} /> Facture contestée par l’assureur</span>}
        onClose={() => setChoix(false)}
      >
        <div className="header-search" style={{ marginBottom: 12 }}>
          <Search className="header-search-icon" />
          <input type="text" placeholder="N° facture, patient ou assureur..." value={rechercheFacture} onChange={(e) => setRechercheFacture(e.target.value)} autoFocus />
        </div>
        {choixFiltres.length === 0 ? (
          <p className="form-help">Aucune facture avec une part assurance restant due.</p>
        ) : (
          <div style={{ display: 'grid', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
            {choixFiltres.map((c) => (
              <button
                key={c.facture_id}
                type="button"
                onClick={() => { setChoix(false); setLitigeSur(c); }}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 10, textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--neutral-200)', background: 'white', cursor: 'pointer' }}
              >
                <span>
                  <strong>{c.numero_facture}</strong> • {c.patient_prenom} {c.patient_nom}
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--neutral-500)' }}>{c.assureur_nom} • {formatDate(c.date_facture)}</span>
                </span>
                <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{formatMoney(c.reste)}</span>
              </button>
            ))}
          </div>
        )}
      </Modal>

      <OuvrirLitigeModal creance={litigeSur} onClose={() => setLitigeSur(null)} onSaved={load} />
      <ResoudreLitigeModal
        litige={litigeDecision}
        onClose={() => setAResoudre(null)}
        onSaved={load}
      />
    </div>
  );
}
