'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { FilePenLine, Plus, Search, Loader2, Inbox, AlertTriangle, PenLine, Eye, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Pagination from '@/components/ui/Pagination';
import { usePagination } from '@/lib/usePagination';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import { useAuth } from '@/contexts/AuthContext';
import {
  DEMANDE_STATUTS, MODULES_DEMANDE, canSignDirection, canSignMedecinChef, canMarkExecutee, seesAllDemandes,
} from '@/lib/demandes-modification';
import { formatDateTime, statusBadge, explainDbError } from '@/lib/format';
import type { DemandeModification } from '@/types';

type DemandeRow = DemandeModification & { demandeur?: { nom: string; prenom: string } | null };

export default function DemandesModificationPage() {
  const { profile } = useAuth();
  const toutes = seesAllDemandes(profile?.role);

  const [demandes, setDemandes] = useState<DemandeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState('');
  const [search, setSearch] = useState('');
  const [statut, setStatut] = useState('tous');

  const load = useCallback(async () => {
    // Les signatures (images) ne sont chargées que sur la fiche
    const { data, error } = await supabase
      .from('demandes_modification')
      .select('id, numero, module, reference_enregistrement, description_erreur, statut, demandeur_id, date_signature_demandeur, created_at, demandeur:personnel!demandes_modification_demandeur_id_fkey(nom, prenom)')
      .order('created_at', { ascending: false });
    if (error) {
      setDbError(explainDbError(error));
    } else {
      setDbError('');
      setDemandes((data || []) as unknown as DemandeRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useLiveRefresh(load, ['demandes_modification']);

  // Demandes qui attendent une action de l'utilisateur connecté
  const aTraiter = (d: DemandeRow) =>
    canSignMedecinChef(profile?.role, profile?.id, d) || canSignDirection(profile?.role, profile?.id, d) || canMarkExecutee(profile?.role, d);
  const nbATraiter = demandes.filter(aTraiter).length;

  const filtered = demandes.filter((d) => {
    const q = search.toLowerCase();
    return (statut === 'tous' || (statut === 'a_traiter' ? aTraiter(d) : d.statut === statut)) &&
      (q === '' || [d.numero, d.reference_enregistrement, d.description_erreur, d.demandeur?.nom, d.demandeur?.prenom]
        .some((v) => (v || '').toLowerCase().includes(q)));
  });
  const { pageItems, page, pageCount, total, setPage } = usePagination(filtered, [search, statut]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, gap: 12 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
        <span style={{ fontWeight: 500, color: 'var(--neutral-500)' }}>Chargement des demandes...</span>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Demandes de modification</h1>
          <p className="page-subtitle">Correction d&apos;une erreur de saisie : explication signée, avis du médecin chef, accord de la direction</p>
        </div>
        <Link href="/demandes-modification/nouvelle" className="btn btn-primary" aria-disabled={!!dbError}>
          <Plus size={16} /> Nouvelle demande
        </Link>
      </div>

      {dbError && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <AlertTriangle size={18} /> {dbError}
        </div>
      )}

      {!dbError && (
        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          <Info size={18} />
          <span>
            {toutes
              ? 'Toutes les demandes du personnel sont listées. '
              : 'Seules vos propres demandes sont listées. '}
            Circuit : 1. le demandeur explique et signe → 2. le médecin chef donne son avis et signe → 3. la direction approuve et signe → la correction est faite par l&apos;administration.
          </span>
        </div>
      )}

      {nbATraiter > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: 20, cursor: 'pointer' }} onClick={() => setStatut('a_traiter')}>
          <PenLine size={18} /> {nbATraiter} demande(s) attendent votre signature ou votre action.
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '14px 22px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="header-search" style={{ flex: 1, minWidth: 250 }}>
            <Search className="header-search-icon" />
            <input type="text" placeholder="Rechercher un n°, un enregistrement, une erreur ou un demandeur..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="form-select" style={{ width: 220 }} value={statut} onChange={(e) => setStatut(e.target.value)}>
            <option value="tous">Tous les statuts</option>
            <option value="a_traiter">À traiter par moi</option>
            {Object.entries(DEMANDE_STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><div className="card-body"><div className="empty-state">
          <Inbox className="empty-state-icon" />
          <h3>Aucune demande</h3>
          <p>Aucune demande de modification ne correspond à cette sélection.</p>
        </div></div></div>
      ) : (
        <div className="card">
          <div className="card-header">
            <span className="card-title"><FilePenLine size={16} /> {filtered.length} demande(s)</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>N° / Date</th>
                <th>Module</th>
                <th>Erreur</th>
                <th>Demandeur</th>
                <th>Statut</th>
                <th style={{ textAlign: 'right' }}>Fiche</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((d) => {
                const st = statusBadge(DEMANDE_STATUTS, d.statut);
                const action = aTraiter(d);
                return (
                  <tr key={d.id}>
                    <td>
                      <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12 }}>{d.numero}</div>
                      <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{formatDateTime(d.date_signature_demandeur || d.created_at)}</div>
                    </td>
                    <td><span className="badge badge-info">{MODULES_DEMANDE[d.module] || d.module}</span></td>
                    <td style={{ maxWidth: 360 }}>
                      {d.reference_enregistrement && <div style={{ fontWeight: 600, fontSize: 13 }}>{d.reference_enregistrement}</div>}
                      <div style={{ fontSize: 12, color: 'var(--neutral-600)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.description_erreur}</div>
                    </td>
                    <td style={{ fontSize: 13 }}>{d.demandeur ? `${d.demandeur.prenom} ${d.demandeur.nom}` : '—'}</td>
                    <td><span className={`badge ${st.badge}`}>{st.label}</span></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Link href={`/demandes-modification/${d.id}`} className={`btn btn-sm ${action ? 'btn-primary' : 'btn-ghost'}`}>
                        {action ? <><PenLine size={14} /> Traiter</> : <><Eye size={14} /> Voir</>}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} pageCount={pageCount} total={total} onPageChange={setPage} label="demandes" />
        </div>
      )}
    </div>
  );
}
