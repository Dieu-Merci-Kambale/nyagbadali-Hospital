'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Loader2, AlertTriangle, Wallet, FileWarning, Clock, Scale, TrendingUp, FileStack, Banknote, ChevronRight, CalendarX, Inbox,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import { fetchAll } from '@/lib/reports/helpers';
import { formatMoney, formatDate, explainDbError } from '@/lib/format';
import AssuranceHeader from '@/components/assurances/AssuranceHeader';
import ReglementModal from '@/components/assurances/ReglementModal';
import {
  syntheseParAssureur, trancheAnciennete, totalReglements, contratEchu, STATUTS_OUVERTS, TRANCHES_ANCIENNETE,
  type Assureur, type BordereauAssurance, type CreanceAssurance, type PaiementAssurance,
} from '@/lib/assurances';

const pct = (v: number) => `${Math.round(v * 100)} %`;

export default function AssurancesPage() {
  const [creances, setCreances] = useState<CreanceAssurance[]>([]);
  const [assureurs, setAssureurs] = useState<Assureur[]>([]);
  const [reglementsMois, setReglementsMois] = useState<PaiementAssurance[]>([]);
  const [retards, setRetards] = useState<BordereauAssurance[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState('');
  const [showReglement, setShowReglement] = useState(false);
  // Date de référence des alertes de contrat (fixée à l'ouverture de la page)
  const [maintenant] = useState(() => Date.now());

  const load = useCallback(async () => {
    const debutMois = new Date();
    debutMois.setDate(1);
    debutMois.setHours(0, 0, 0, 0);
    try {
      const [c, a, r, b] = await Promise.all([
        fetchAll<CreanceAssurance>((x, y) => supabase.from('v_creances_assurance').select('*').order('date_facture', { ascending: false }).range(x, y)),
        supabase.from('assureurs').select('*').order('nom'),
        supabase.from('paiements_assurance').select('*').gte('date_paiement', debutMois.toISOString()),
        supabase.from('v_bordereaux_assurance').select('*').eq('en_retard', true).order('date_echeance').limit(6),
      ]);
      const err = a.error || r.error || b.error;
      if (err) throw new Error(explainDbError(err));
      setCreances(c);
      setAssureurs((a.data || []) as Assureur[]);
      setReglementsMois((r.data || []) as PaiementAssurance[]);
      setRetards((b.data || []) as BordereauAssurance[]);
      setDbError('');
    } catch (e) {
      setDbError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load, ['paiements_assurance', 'litiges_assurance', 'bordereaux_assurance', 'factures', 'assureurs']);

  const synthese = useMemo(() => syntheseParAssureur(creances), [creances]);
  const ouvertes = creances.filter((c) => STATUTS_OUVERTS.includes(c.statut_assurance));
  const totalReste = ouvertes.reduce((s, c) => s + Number(c.reste), 0);
  const aReclamer = creances.filter((c) => c.statut_assurance === 'à_réclamer');
  const enRetard = creances.filter((c) => c.en_retard);
  const enLitige = creances.filter((c) => c.litiges_ouverts > 0);
  const encaisseMois = totalReglements(reglementsMois);

  const balance = TRANCHES_ANCIENNETE.map((t) => {
    const lignes = ouvertes.filter((c) => trancheAnciennete(c.date_facture) === t);
    return { tranche: t, nombre: lignes.length, montant: lignes.reduce((s, c) => s + Number(c.reste), 0) };
  });
  const maxBalance = Math.max(1, ...balance.map((b) => b.montant));

  const dans30j = new Date(maintenant + 30 * 86400000);
  const contrats = assureurs.filter((a) => a.actif && a.date_fin_contrat && (contratEchu(a) || contratEchu(a, dans30j)));

  const kpis = [
    { label: 'Créances à recouvrer', value: formatMoney(totalReste), sub: `${ouvertes.length} facture(s)`, icon: <Wallet size={22} />, color: 'blue', href: '/assurances/creances' },
    { label: 'À réclamer', value: formatMoney(aReclamer.reduce((s, c) => s + Number(c.reste), 0)), sub: `${aReclamer.length} facture(s) hors bordereau`, icon: <FileWarning size={22} />, color: 'orange', href: '/assurances/creances?statut=à_réclamer' },
    { label: 'Encaissé des assureurs (mois)', value: formatMoney(encaisseMois), sub: `${reglementsMois.filter((r) => r.statut !== 'annulé').length} règlement(s)`, icon: <TrendingUp size={22} />, color: 'green', href: '/assurances/reglements' },
    { label: 'Échéances dépassées', value: formatMoney(enRetard.reduce((s, c) => s + Number(c.reste), 0)), sub: `${enRetard.length} facture(s) en retard`, icon: <Clock size={22} />, color: 'red', href: '/assurances/creances?statut=retard' },
    { label: 'Litiges ouverts', value: formatMoney(enLitige.reduce((s, c) => s + Number(c.montant_conteste), 0)), sub: `${enLitige.length} facture(s) contestée(s)`, icon: <Scale size={22} />, color: 'purple', href: '/assurances/litiges' },
  ];

  return (
    <div className="animate-fade-in">
      <AssuranceHeader
        title="Assurances"
        subtitle="Prises en charge, réclamations aux assureurs, règlements et litiges"
        actions={(
          <>
            <button className="btn btn-outline" onClick={() => setShowReglement(true)} disabled={!!dbError}>
              <Banknote size={16} /> Enregistrer un règlement
            </button>
            <Link href="/assurances/bordereaux/nouveau" className="btn btn-primary">
              <FileStack size={16} /> Nouveau bordereau
            </Link>
          </>
        )}
      />

      {dbError && <div className="alert alert-danger" style={{ marginBottom: 20 }}><AlertTriangle size={18} /> {dbError}</div>}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>
      ) : (
        <>
          <div className="stats-grid" style={{ marginBottom: 20 }}>
            {kpis.map((k) => (
              <Link key={k.label} href={k.href} className="stat-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className={`stat-card-icon ${k.color}`}>{k.icon}</div>
                <div className="stat-card-info">
                  <h3>{k.label}</h3>
                  <div className="stat-value">{k.value}</div>
                  <div className="stat-change">{k.sub}</div>
                </div>
              </Link>
            ))}
          </div>

          {(contrats.length > 0 || retards.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
              {retards.length > 0 && (
                <div className="alert alert-danger" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={16} /> Bordereaux dont l’échéance est dépassée</strong>
                  {retards.map((b) => (
                    <Link key={b.id} href={`/assurances/bordereaux/${b.id}`} style={{ fontSize: 13, color: 'inherit' }}>
                      {b.numero} — {b.assureur_nom} : {formatMoney(b.reste)} dus depuis le {formatDate(b.date_echeance)}
                    </Link>
                  ))}
                </div>
              )}
              {contrats.length > 0 && (
                <div className="alert alert-warning" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CalendarX size={16} /> Contrats échus ou à renouveler</strong>
                  {contrats.map((a) => (
                    <Link key={a.id} href={`/assurances/assureurs/${a.id}`} style={{ fontSize: 13, color: 'inherit' }}>
                      {a.nom} — {contratEchu(a) ? 'échu le' : 'expire le'} {formatDate(a.date_fin_contrat)}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <span className="card-title">Situation par assureur</span>
              <Link href="/assurances/rapports" style={{ fontSize: 13, color: 'var(--primary-600)', fontWeight: 500 }}>Relevés détaillés →</Link>
            </div>
            {synthese.length === 0 ? (
              <div className="card-body"><div className="empty-state">
                <Inbox className="empty-state-icon" />
                <h3>Aucune prise en charge</h3>
                <p>Les parts assurance des factures apparaîtront ici dès qu’un patient assuré sera facturé.</p>
              </div></div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Assureur</th>
                    <th style={{ textAlign: 'right' }}>Factures</th>
                    <th style={{ textAlign: 'right' }}>Pris en charge</th>
                    <th style={{ textAlign: 'right' }}>Payé</th>
                    <th style={{ textAlign: 'right' }}>En litige</th>
                    <th style={{ textAlign: 'right' }}>Reste dû</th>
                    <th style={{ textAlign: 'right' }}>Dont en retard</th>
                    <th style={{ width: 150 }}>Recouvrement</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {synthese.map((s) => (
                    <tr key={s.assureur_id}>
                      <td style={{ fontWeight: 600 }}>{s.assureur_nom}</td>
                      <td style={{ textAlign: 'right' }}>{s.factures}</td>
                      <td style={{ textAlign: 'right' }}>{formatMoney(s.facture)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--success)' }}>{formatMoney(s.paye)}</td>
                      <td style={{ textAlign: 'right', color: s.conteste > 0 ? 'var(--danger)' : undefined }}>{formatMoney(s.conteste)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(s.reste)}</td>
                      <td style={{ textAlign: 'right', color: s.enRetard > 0 ? 'var(--danger)' : 'var(--neutral-400)' }}>{formatMoney(s.enRetard)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--neutral-200)', overflow: 'hidden' }}>
                            <div style={{ width: pct(s.tauxRecouvrement), height: '100%', background: 'var(--success)' }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, minWidth: 36, textAlign: 'right' }}>{pct(s.tauxRecouvrement)}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Link href={`/assurances/assureurs/${s.assureur_id}`} className="btn btn-ghost btn-sm" title="Fiche de l’assureur"><ChevronRight size={16} /></Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700 }}>
                    <td>TOTAL</td>
                    <td style={{ textAlign: 'right' }}>{synthese.reduce((s, x) => s + x.factures, 0)}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(synthese.reduce((s, x) => s + x.facture, 0))}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(synthese.reduce((s, x) => s + x.paye, 0))}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(synthese.reduce((s, x) => s + x.conteste, 0))}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(synthese.reduce((s, x) => s + x.reste, 0))}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(synthese.reduce((s, x) => s + x.enRetard, 0))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Ancienneté des créances</span>
              <span style={{ fontSize: 12, color: 'var(--neutral-500)' }}>Depuis la date de la facture</span>
            </div>
            <div className="card-body" style={{ display: 'grid', gap: 12 }}>
              {balance.map((b, i) => (
                <div key={b.tranche} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 150px', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{b.tranche}</span>
                  <div style={{ height: 10, borderRadius: 5, background: 'var(--neutral-100)', overflow: 'hidden' }}>
                    <div style={{ width: `${(b.montant / maxBalance) * 100}%`, height: '100%', background: ['var(--success)', 'var(--warning)', 'var(--danger)', 'var(--danger-600, #b91c1c)'][i] }} />
                  </div>
                  <span style={{ fontSize: 13, textAlign: 'right' }}><strong>{formatMoney(b.montant)}</strong> <span style={{ color: 'var(--neutral-500)' }}>({b.nombre})</span></span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <ReglementModal open={showReglement} onClose={() => setShowReglement(false)} onSaved={load} />
    </div>
  );
}
