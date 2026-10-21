'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Loader2, AlertTriangle, FileStack, Banknote, Printer, Phone, Mail, MapPin, FileText, Scale, CalendarX } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import { roleLabels } from '@/lib/role-permissions';
import { buildReleveAssureurPdf } from '@/lib/document-models';
import { formatMoney, formatDate, statusBadge, MODES_PAIEMENT, explainDbError } from '@/lib/format';
import AssuranceHeader from '@/components/assurances/AssuranceHeader';
import ReglementModal from '@/components/assurances/ReglementModal';
import { OuvrirLitigeModal } from '@/components/assurances/LitigeModals';
import {
  TYPES_ASSUREURS, CREANCE_STATUTS, BORDEREAU_STATUTS, LITIGE_STATUTS, MOTIFS_LITIGE, STATUTS_OUVERTS, contratEchu, totalReglements,
  type Assureur, type BordereauAssurance, type CreanceAssurance, type LitigeAssurance, type PaiementAssurance,
} from '@/lib/assurances';

type Onglet = 'creances' | 'bordereaux' | 'reglements' | 'litiges';

export default function FicheAssureurPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const [assureur, setAssureur] = useState<Assureur | null>(null);
  const [creances, setCreances] = useState<CreanceAssurance[]>([]);
  const [bordereaux, setBordereaux] = useState<BordereauAssurance[]>([]);
  const [reglements, setReglements] = useState<PaiementAssurance[]>([]);
  const [litiges, setLitiges] = useState<(LitigeAssurance & { factures?: { numero_facture: string } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState('');
  const [onglet, setOnglet] = useState<Onglet>('creances');
  const [showReglement, setShowReglement] = useState(false);
  const [litigeSur, setLitigeSur] = useState<CreanceAssurance | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [a, c, b, r, l] = await Promise.all([
      supabase.from('assureurs').select('*').eq('id', id).single(),
      supabase.from('v_creances_assurance').select('*').eq('assureur_id', id).order('date_facture', { ascending: false }),
      supabase.from('v_bordereaux_assurance').select('*').eq('assureur_id', id).order('date_emission', { ascending: false }),
      supabase.from('paiements_assurance').select('*').eq('assureur_id', id).order('date_paiement', { ascending: false }),
      supabase.from('litiges_assurance').select('*, factures(numero_facture)').eq('assureur_id', id).order('date_ouverture', { ascending: false }),
    ]);
    const err = a.error || c.error || b.error || r.error || l.error;
    if (err) setDbError(explainDbError(err));
    else setDbError('');
    setAssureur((a.data || null) as Assureur | null);
    setCreances((c.data || []) as CreanceAssurance[]);
    setBordereaux((b.data || []) as BordereauAssurance[]);
    setReglements((r.data || []) as PaiementAssurance[]);
    setLitiges((l.data || []) as typeof litiges);
    setLoading(false);
  }, [id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load, ['paiements_assurance', 'litiges_assurance', 'bordereaux_assurance', 'factures']);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>;
  if (!assureur) {
    return (
      <div className="animate-fade-in">
        <AssuranceHeader title="Assureur introuvable" backHref="/assurances/assureurs" />
        {dbError && <div className="alert alert-danger"><AlertTriangle size={18} /> {dbError}</div>}
      </div>
    );
  }

  const ouvertes = creances.filter((c) => STATUTS_OUVERTS.includes(c.statut_assurance));
  const reste = ouvertes.reduce((s, c) => s + Number(c.reste), 0);
  const retard = ouvertes.filter((c) => c.en_retard).reduce((s, c) => s + Number(c.reste), 0);
  const paye = creances.reduce((s, c) => s + Number(c.paye), 0);
  const pris = creances.filter((c) => c.statut_facture !== 'annulée').reduce((s, c) => s + Number(c.montant_assurance) + Number(c.transfere), 0);
  const litigesOuverts = litiges.filter((l) => l.statut === 'ouvert' || l.statut === 'en_cours');
  const echu = contratEchu(assureur);

  const imprimerReleve = async () => {
    try {
      const pdf = await buildReleveAssureurPdf({
        assureur,
        creances: ouvertes.slice().sort((x, y) => new Date(x.date_facture).getTime() - new Date(y.date_facture).getTime()),
        reglements: reglements.filter((r) => r.statut === 'validé').slice(0, 30),
        printedBy: profile ? { prenom: profile.prenom, nom: profile.nom, role: roleLabels[profile.role] } : undefined,
        printedAt: new Date(),
      });
      pdf.save(`releve-${assureur.code}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      console.error(e);
      toast.error('Le relevé n’a pas pu être généré.');
    }
  };

  const ONGLETS: { key: Onglet; label: string; count: number }[] = [
    { key: 'creances', label: 'Créances ouvertes', count: ouvertes.length },
    { key: 'bordereaux', label: 'Bordereaux', count: bordereaux.length },
    { key: 'reglements', label: 'Règlements', count: reglements.length },
    { key: 'litiges', label: 'Litiges', count: litigesOuverts.length },
  ];

  return (
    <div className="animate-fade-in">
      <AssuranceHeader
        title={assureur.nom}
        subtitle={`${TYPES_ASSUREURS[assureur.type] || assureur.type} • Code ${assureur.code}${assureur.actif ? '' : ' • Désactivé'}`}
        backHref="/assurances/assureurs"
        actions={(
          <>
            <button className="btn btn-outline" onClick={imprimerReleve}><Printer size={16} /> Relevé de compte</button>
            <button className="btn btn-outline" onClick={() => setShowReglement(true)}><Banknote size={16} /> Règlement reçu</button>
            <Link href={`/assurances/bordereaux/nouveau?assureur=${assureur.id}`} className="btn btn-primary"><FileStack size={16} /> Nouveau bordereau</Link>
          </>
        )}
      />

      {dbError && <div className="alert alert-danger" style={{ marginBottom: 20 }}><AlertTriangle size={18} /> {dbError}</div>}
      {echu && (
        <div className="alert alert-warning" style={{ marginBottom: 20 }}>
          <CalendarX size={18} /> Le contrat de cet assureur est échu depuis le {formatDate(assureur.date_fin_contrat)} : vérifiez le renouvellement avant toute nouvelle prise en charge.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 20 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Conditions de prise en charge</span></div>
          <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: 13 }}>
            <div><div className="info-label">Taux de couverture</div><div style={{ fontSize: 20, fontWeight: 700 }}>{Number(assureur.taux_couverture)} %</div></div>
            <div><div className="info-label">Plafond par facture</div><div style={{ fontSize: 15, fontWeight: 600 }}>{assureur.plafond_facture ? formatMoney(assureur.plafond_facture) : 'Aucun'}</div></div>
            <div><div className="info-label">Délai de paiement</div><div style={{ fontWeight: 600 }}>{assureur.delai_paiement_jours} jours après envoi</div></div>
            <div>
              <div className="info-label">Contrat</div>
              <div style={{ fontWeight: 600 }}>{assureur.numero_contrat || '—'}</div>
              {(assureur.date_debut_contrat || assureur.date_fin_contrat) && (
                <div style={{ color: echu ? 'var(--danger)' : 'var(--neutral-500)' }}>
                  {formatDate(assureur.date_debut_contrat)} → {formatDate(assureur.date_fin_contrat)}
                </div>
              )}
            </div>
            {assureur.notes && <div style={{ gridColumn: '1 / -1', color: 'var(--neutral-600)', whiteSpace: 'pre-wrap' }}><FileText size={13} /> {assureur.notes}</div>}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Contact</span></div>
          <div className="card-body info-list">
            <div className="info-row"><div className="info-icon"><FileText size={16} /></div><div className="info-copy"><div className="info-label">Interlocuteur</div><div className="info-value">{assureur.contact_nom || 'Non renseigné'}</div></div></div>
            <div className="info-row"><div className="info-icon"><Phone size={16} /></div><div className="info-copy"><div className="info-label">Téléphone</div><div className="info-value">{assureur.telephone || 'Non renseigné'}</div></div></div>
            <div className="info-row"><div className="info-icon"><Mail size={16} /></div><div className="info-copy"><div className="info-label">Email</div><div className="info-value">{assureur.email || 'Non renseigné'}</div></div></div>
            <div className="info-row"><div className="info-icon"><MapPin size={16} /></div><div className="info-copy"><div className="info-label">Adresse</div><div className="info-value">{assureur.adresse || 'Non renseignée'}</div></div></div>
          </div>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Pris en charge', value: pris, color: 'blue' },
          { label: 'Réglé par l’assureur', value: paye, color: 'green' },
          { label: 'Reste dû', value: reste, color: 'orange' },
          { label: 'Échéance dépassée', value: retard, color: 'red' },
          { label: 'Encaissé au total', value: totalReglements(reglements), color: 'teal' },
        ].map((k) => (
          <div key={k.label} className="stat-card">
            <div className={`stat-card-icon ${k.color}`}><Banknote size={22} /></div>
            <div className="stat-card-info"><h3>{k.label}</h3><div className="stat-value">{formatMoney(k.value)}</div></div>
          </div>
        ))}
      </div>

      <div className="tabs" style={{ overflowX: 'auto' }}>
        {ONGLETS.map((o) => (
          <button key={o.key} className={`tab ${onglet === o.key ? 'active' : ''}`} onClick={() => setOnglet(o.key)} style={{ whiteSpace: 'nowrap' }}>
            {o.label} {o.count > 0 && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>{o.count}</span>}
          </button>
        ))}
      </div>

      <div className="card">
        {onglet === 'creances' && (
          <table className="data-table">
            <thead><tr><th>Facture</th><th>Patient</th><th>Statut</th><th>Bordereau</th><th style={{ textAlign: 'right' }}>Part assurance</th><th style={{ textAlign: 'right' }}>Réglé</th><th style={{ textAlign: 'right' }}>Reste dû</th><th /></tr></thead>
            <tbody>
              {ouvertes.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--neutral-400)', padding: 24 }}>Aucune créance ouverte.</td></tr>}
              {ouvertes.map((c) => {
                const st = statusBadge(CREANCE_STATUTS, c.statut_assurance);
                return (
                  <tr key={c.facture_id} style={{ background: c.en_retard ? 'var(--danger-50, #fef2f2)' : undefined }}>
                    <td><Link href={`/facturation/${c.facture_id}`} style={{ fontWeight: 600 }}>{c.numero_facture}</Link><div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{formatDate(c.date_facture)}</div></td>
                    <td>{c.patient_prenom} {c.patient_nom}<div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{c.numero_assurance || c.code_patient}</div></td>
                    <td><span className={`badge ${st.badge}`}>{st.label}</span>{c.en_retard && <div style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>Échue le {formatDate(c.date_echeance)}</div>}</td>
                    <td>{c.bordereau_id ? <Link href={`/assurances/bordereaux/${c.bordereau_id}`}>{c.bordereau_numero}</Link> : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(c.montant_assurance)}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(c.paye)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(c.reste)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-ghost btn-sm" title="Ouvrir un litige" onClick={() => setLitigeSur(c)} disabled={Number(c.reste) - Number(c.montant_conteste) <= 0}><Scale size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {onglet === 'bordereaux' && (
          <table className="data-table">
            <thead><tr><th>Bordereau</th><th>Émis le</th><th>Statut</th><th style={{ textAlign: 'right' }}>Factures</th><th style={{ textAlign: 'right' }}>Réclamé</th><th style={{ textAlign: 'right' }}>Réglé</th><th style={{ textAlign: 'right' }}>Reste</th><th>Échéance</th></tr></thead>
            <tbody>
              {bordereaux.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--neutral-400)', padding: 24 }}>Aucun bordereau.</td></tr>}
              {bordereaux.map((b) => {
                const st = statusBadge(BORDEREAU_STATUTS, b.statut_calcule);
                return (
                  <tr key={b.id}>
                    <td><Link href={`/assurances/bordereaux/${b.id}`} style={{ fontWeight: 600 }}>{b.numero}</Link></td>
                    <td>{formatDate(b.date_emission)}</td>
                    <td><span className={`badge ${st.badge}`}>{st.label}</span>{b.en_retard && <div style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>En retard</div>}</td>
                    <td style={{ textAlign: 'right' }}>{b.nb_factures}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(b.montant)}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(b.paye)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{b.statut === 'annulé' ? '—' : formatMoney(b.reste)}</td>
                    <td>{b.date_echeance ? formatDate(b.date_echeance) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {onglet === 'reglements' && (
          <table className="data-table">
            <thead><tr><th>Date</th><th>N° règlement</th><th>Mode</th><th>Référence</th><th>Statut</th><th style={{ textAlign: 'right' }}>Montant</th></tr></thead>
            <tbody>
              {reglements.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--neutral-400)', padding: 24 }}>Aucun règlement reçu.</td></tr>}
              {reglements.map((r) => (
                <tr key={r.id} style={{ opacity: r.statut === 'annulé' ? 0.5 : 1 }}>
                  <td>{formatDate(r.date_paiement)}</td>
                  <td style={{ fontWeight: 600 }}>{r.numero}</td>
                  <td>{MODES_PAIEMENT[r.mode_paiement] || r.mode_paiement}</td>
                  <td>{r.reference || '—'}</td>
                  <td><span className={`badge ${r.statut === 'annulé' ? 'badge-danger' : 'badge-success'}`}>{r.statut === 'annulé' ? 'Annulé' : 'Validé'}</span></td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(r.montant)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {onglet === 'litiges' && (
          <table className="data-table">
            <thead><tr><th>Litige</th><th>Facture</th><th>Motif</th><th>Statut</th><th style={{ textAlign: 'right' }}>Contesté</th><th>Décision</th></tr></thead>
            <tbody>
              {litiges.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--neutral-400)', padding: 24 }}>Aucun litige.</td></tr>}
              {litiges.map((l) => {
                const st = statusBadge(LITIGE_STATUTS, l.statut);
                return (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 600 }}>{l.numero}<div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{formatDate(l.date_ouverture)}</div></td>
                    <td><Link href={`/facturation/${l.facture_id}`}>{l.factures?.numero_facture || '—'}</Link></td>
                    <td style={{ fontSize: 13 }}>{MOTIFS_LITIGE[l.motif] || l.motif}</td>
                    <td><span className={`badge ${st.badge}`}>{st.label}</span></td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(l.montant_conteste)}</td>
                    <td style={{ fontSize: 12 }}>
                      {l.statut === 'résolu'
                        ? [Number(l.montant_accepte) > 0 && `Assureur ${formatMoney(l.montant_accepte)}`, Number(l.montant_transfere) > 0 && `Patient ${formatMoney(l.montant_transfere)}`, Number(l.montant_abandonne) > 0 && `Perte ${formatMoney(l.montant_abandonne)}`].filter(Boolean).join(' • ')
                        : <Link href="/assurances/litiges">Traiter →</Link>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <ReglementModal open={showReglement} onClose={() => setShowReglement(false)} onSaved={load} assureurId={assureur.id} />
      <OuvrirLitigeModal creance={litigeSur} onClose={() => setLitigeSur(null)} onSaved={load} />
    </div>
  );
}
