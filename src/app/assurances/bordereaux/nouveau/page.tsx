'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, AlertCircle, Save, Send, Inbox, Info } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';
import { formatMoney, formatDate, explainDbError } from '@/lib/format';
import AssuranceHeader from '@/components/assurances/AssuranceHeader';
import { fetchAssureurs, type Assureur, type CreanceAssurance } from '@/lib/assurances';

function NouveauBordereauForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { confirm } = useConfirm();
  const [assureurs, setAssureurs] = useState<Assureur[]>([]);
  const [assureur, setAssureur] = useState(params.get('assureur') || '');
  const [creances, setCreances] = useState<CreanceAssurance[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAssureurs({ inclureInactifs: true }).then(({ assureurs: list, error: e }) => {
      if (e) setError(explainDbError(e));
      setAssureurs(list);
    });
  }, []);

  // Factures de l'assureur pas encore réclamées (hors bordereau) avec un reste dû
  useEffect(() => {
    if (!assureur) {
      setCreances([]);
      return;
    }
    let ignore = false;
    setLoading(true);
    supabase.from('v_creances_assurance').select('*')
      .eq('assureur_id', assureur).is('bordereau_id', null).gt('reste', 0).neq('statut_facture', 'annulée')
      .order('date_facture')
      .then(({ data, error: e }) => {
        if (ignore) return;
        setLoading(false);
        if (e) return setError(explainDbError(e));
        const rows = (data || []) as CreanceAssurance[];
        setCreances(rows);
        setSelection(new Set(rows.map((r) => r.facture_id)));
      });
    return () => { ignore = true; };
  }, [assureur]);

  const visibles = useMemo(() => creances.filter((c) => {
    const d = c.date_facture.slice(0, 10);
    return (!du || d >= du) && (!au || d <= au);
  }), [creances, du, au]);
  const choisies = visibles.filter((c) => selection.has(c.facture_id));
  const total = choisies.reduce((s, c) => s + Number(c.reste), 0);
  const info = assureurs.find((a) => a.id === assureur);

  const toggle = (id: string) => setSelection((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const toutes = (on: boolean) => setSelection(new Set(on ? visibles.map((c) => c.facture_id) : []));

  const creer = async (envoyer: boolean) => {
    setError('');
    if (!assureur) return setError('Choisissez l’assureur.');
    if (!choisies.length) return setError('Cochez au moins une facture à réclamer.');
    const ok = await confirm({
      title: envoyer ? 'Créer et envoyer le bordereau' : 'Créer le bordereau',
      message: `${choisies.length} facture(s) pour ${formatMoney(total)} seront réclamées à ${info?.nom}.${envoyer ? ` Échéance de paiement : ${info?.delai_paiement_jours} jours.` : ' Le bordereau restera modifiable jusqu’à son envoi.'}`,
      confirmText: envoyer ? 'Oui, envoyer' : 'Oui, créer',
      type: 'info',
    });
    if (!ok) return;
    setSaving(true);
    const dates = choisies.map((c) => c.date_facture.slice(0, 10)).sort();
    const { data, error: e } = await supabase.rpc('creer_bordereau_assurance', {
      p_assureur_id: assureur,
      p_factures: choisies.map((c) => c.facture_id),
      p_periode_debut: du || dates[0],
      p_periode_fin: au || dates[dates.length - 1],
      p_notes: notes || null,
      p_envoyer: envoyer,
    });
    setSaving(false);
    if (e) return setError(explainDbError(e));
    toast.success(envoyer ? 'Bordereau créé et envoyé.' : 'Bordereau créé (en préparation).');
    router.push(`/assurances/bordereaux/${data}`);
  };

  return (
    <div className="animate-fade-in">
      <AssuranceHeader title="Nouveau bordereau" subtitle="Réclamer à un assureur sa part sur les factures de ses assurés" backHref="/assurances/bordereaux" />

      {error && <div className="alert alert-danger" style={{ marginBottom: 20 }}><AlertCircle size={18} /> {error}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Assureur *</label>
              <select className="form-select" value={assureur} onChange={(e) => setAssureur(e.target.value)}>
                <option value="">Choisir l’assureur…</option>
                {assureurs.map((a) => <option key={a.id} value={a.id}>{a.nom}{a.actif ? '' : ' (désactivé)'}</option>)}
              </select>
              {info && <p className="form-help">Couverture {Number(info.taux_couverture)} % • paiement à {info.delai_paiement_jours} jours{info.numero_contrat ? ` • convention ${info.numero_contrat}` : ''}</p>}
            </div>
            <div className="form-group">
              <label className="form-label">Factures du</label>
              <input type="date" className="form-input" value={du} onChange={(e) => setDu(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">au</label>
              <input type="date" className="form-input" value={au} onChange={(e) => setAu(e.target.value)} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Observations (imprimées sur le dossier, pas sur le bordereau)</label>
            <textarea className="form-textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">Factures à réclamer</span>
          {visibles.length > 0 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => toutes(true)}>Tout cocher</button>
              <button className="btn btn-ghost btn-sm" onClick={() => toutes(false)}>Tout décocher</button>
            </div>
          )}
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader2 size={20} className="animate-spin" /></div>
        ) : !assureur ? (
          <div className="card-body"><p className="form-help"><Info size={13} /> Choisissez l’assureur pour afficher ses factures non encore réclamées.</p></div>
        ) : visibles.length === 0 ? (
          <div className="card-body"><div className="empty-state">
            <Inbox className="empty-state-icon" />
            <h3>Rien à réclamer</h3>
            <p>Toutes les factures de cet assureur figurent déjà sur un bordereau ou sont soldées.</p>
          </div></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 40 }} />
                <th>Date</th>
                <th>Facture</th>
                <th>Patient</th>
                <th>N° assuré</th>
                <th style={{ textAlign: 'right' }}>Total facture</th>
                <th style={{ textAlign: 'right' }}>À réclamer</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((c) => (
                <tr key={c.facture_id} onClick={() => toggle(c.facture_id)} style={{ cursor: 'pointer', background: selection.has(c.facture_id) ? 'var(--primary-50)' : undefined }}>
                  <td><input type="checkbox" checked={selection.has(c.facture_id)} onChange={() => toggle(c.facture_id)} onClick={(e) => e.stopPropagation()} /></td>
                  <td>{formatDate(c.date_facture)}</td>
                  <td style={{ fontWeight: 600 }}>{c.numero_facture}{c.litiges_ouverts > 0 && <span className="badge badge-danger" style={{ marginLeft: 6 }}>litige</span>}</td>
                  <td>{c.patient_prenom} {c.patient_nom}</td>
                  <td>{c.numero_assurance || <span style={{ color: 'var(--warning-600, #b45309)' }}>Non renseigné</span>}</td>
                  <td style={{ textAlign: 'right' }}>{formatMoney(c.montant_total)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(c.reste)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={6}>{choisies.length} facture(s) sélectionnée(s)</td>
                <td style={{ textAlign: 'right' }}>{formatMoney(total)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-outline" onClick={() => router.push('/assurances/bordereaux')}>Annuler</button>
        <button className="btn btn-outline" onClick={() => creer(false)} disabled={saving || !choisies.length}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Enregistrer en préparation
        </button>
        <button className="btn btn-primary" onClick={() => creer(true)} disabled={saving || !choisies.length}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Créer et envoyer
        </button>
      </div>
    </div>
  );
}

export default function NouveauBordereauPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>}>
      <NouveauBordereauForm />
    </Suspense>
  );
}
