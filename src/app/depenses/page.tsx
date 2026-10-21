'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Wallet, Plus, Search, Loader2, Edit, Ban, Trash2, Save, Inbox, AlertTriangle, Lock, FileSpreadsheet,
  TrendingUp, TrendingDown, Scale, CalendarDays,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import Pagination from '@/components/ui/Pagination';
import Modal from '@/components/ui/Modal';
import { usePagination } from '@/lib/usePagination';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import { useConfirm } from '@/context/ConfirmContext';
import { useAuth } from '@/contexts/AuthContext';
import { canEditDepense, canDeleteDepense } from '@/lib/role-permissions';
import { generateDepenseNumber, soldeCaisse, totalDepenses } from '@/lib/depenses';
import {
  CATEGORIES_DEPENSES, DEPENSE_STATUTS, MODES_PAIEMENT, formatMoney, formatDateTime, toDateTimeLocal, toDateKey,
  statusBadge, explainDbError,
} from '@/lib/format';
import type { Depense } from '@/types';

type DepenseRow = Depense & { enregistreur?: { nom: string; prenom: string } | null };

type FormState = {
  id?: string;
  date: string;
  categorie: Depense['categorie'];
  libelle: string;
  beneficiaire: string;
  montant: number;
  mode_paiement: Depense['mode_paiement'];
  reference: string;
  notes: string;
};

const emptyForm = (): FormState => ({
  date: toDateTimeLocal(new Date()), categorie: 'achat_materiel', libelle: '', beneficiaire: '',
  montant: 0, mode_paiement: 'cash', reference: '', notes: '',
});

export default function DepensesPage() {
  const { profile } = useAuth();
  const { confirm } = useConfirm();
  const isAdmin = profile?.role === 'super_admin' || profile?.role === 'admin';

  const [depenses, setDepenses] = useState<DepenseRow[]>([]);
  const [encaisseMois, setEncaisseMois] = useState<{ montant: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState('');

  const [search, setSearch] = useState('');
  const [categorie, setCategorie] = useState('toutes');
  const [statut, setStatut] = useState('validée');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [annulation, setAnnulation] = useState<{ depense: DepenseRow; motif: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const now = new Date();
    const debutMois = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const [depRes, payRes] = await Promise.all([
      supabase.from('depenses').select('*, enregistreur:personnel!depenses_enregistre_par_fkey(nom, prenom)').order('date_depense', { ascending: false }),
      supabase.from('paiements').select('montant').gte('date_paiement', debutMois),
    ]);
    if (depRes.error) {
      setDbError(explainDbError(depRes.error));
    } else {
      setDbError('');
      setDepenses((depRes.data || []) as DepenseRow[]);
    }
    setEncaisseMois((payRes.data || []) as { montant: number }[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Mise à jour automatique (dépenses et encaissements saisis sur d'autres postes)
  useLiveRefresh(load, ['depenses', 'paiements']);

  const handleSave = async () => {
    if (!form || !profile) return;
    if (!form.libelle.trim()) {
      toast.error('Le libellé de la dépense est obligatoire.');
      return;
    }
    if (!(Number(form.montant) > 0)) {
      toast.error('Le montant doit être supérieur à zéro.');
      return;
    }
    if (!form.date || Number.isNaN(new Date(form.date).getTime())) {
      toast.error('La date de la dépense est invalide.');
      return;
    }
    setSaving(true);
    const payload = {
      date_depense: new Date(form.date).toISOString(),
      categorie: form.categorie,
      libelle: form.libelle.trim(),
      beneficiaire: form.beneficiaire.trim() || null,
      montant: Number(form.montant),
      mode_paiement: form.mode_paiement,
      reference: form.reference.trim() || null,
      notes: form.notes.trim() || null,
    };
    const { data, error } = form.id
      ? await supabase.from('depenses').update(payload).eq('id', form.id).select('id')
      : await supabase.from('depenses').insert([{ ...payload, numero: generateDepenseNumber(), statut: 'validée', enregistre_par: profile.id }]).select('id');
    setSaving(false);
    if (error || !data?.length) {
      toast.error(error ? explainDbError(error) : "Modification refusée : seule l'administration modifie une dépense enregistrée.");
      return;
    }
    toast.success(form.id ? 'Dépense mise à jour.' : 'Dépense enregistrée.');
    setForm(null);
    load();
  };

  const handleAnnuler = async () => {
    if (!annulation) return;
    if (!annulation.motif.trim()) {
      toast.error("Indiquez le motif de l'annulation.");
      return;
    }
    setBusy(annulation.depense.id);
    const { data, error } = await supabase.from('depenses')
      .update({ statut: 'annulée', motif_annulation: annulation.motif.trim() })
      .eq('id', annulation.depense.id).select('id');
    setBusy(null);
    if (error || !data?.length) {
      toast.error(error ? explainDbError(error) : "Annulation refusée : réservée à l'administration.");
      return;
    }
    toast.success('Dépense annulée : elle ne compte plus dans la caisse.');
    setAnnulation(null);
    load();
  };

  const handleDelete = async (d: DepenseRow) => {
    const ok = await confirm({
      title: 'Supprimer la dépense',
      message: `La dépense annulée ${d.numero} sera définitivement supprimée. Cette action est irréversible. Continuer ?`,
      confirmText: 'Oui, supprimer',
      type: 'danger',
    });
    if (!ok) return;
    setBusy(d.id);
    const { data, error } = await supabase.from('depenses').delete().eq('id', d.id).select('id');
    setBusy(null);
    if (error || !data?.length) {
      toast.error(error ? explainDbError(error) : 'Suppression refusée : seuls les administrateurs suppriment une dépense annulée.');
      return;
    }
    toast.success('Dépense supprimée.');
    setDepenses((prev) => prev.filter((x) => x.id !== d.id));
  };

  const openEdit = (d: DepenseRow) => setForm({
    id: d.id, date: toDateTimeLocal(d.date_depense), categorie: d.categorie, libelle: d.libelle,
    beneficiaire: d.beneficiaire || '', montant: Number(d.montant), mode_paiement: d.mode_paiement,
    reference: d.reference || '', notes: d.notes || '',
  });

  // Indicateurs : journée et mois en cours
  const now = new Date();
  const aujourdhui = toDateKey(now);
  const duMois = depenses.filter((d) => {
    const t = new Date(d.date_depense);
    return t.getFullYear() === now.getFullYear() && t.getMonth() === now.getMonth();
  });
  const depensesJour = totalDepenses(depenses.filter((d) => toDateKey(d.date_depense) === aujourdhui));
  const caisse = soldeCaisse(encaisseMois, duMois);

  const filtered = depenses.filter((d) => {
    const q = search.toLowerCase();
    const day = toDateKey(d.date_depense);
    return (categorie === 'toutes' || d.categorie === categorie) &&
      (statut === 'tous' || d.statut === statut) &&
      (!startDate || day >= startDate) &&
      (!endDate || day <= endDate) &&
      (q === '' || [d.numero, d.libelle, d.beneficiaire, d.reference].some((v) => (v || '').toLowerCase().includes(q)));
  });
  const totalFiltre = totalDepenses(filtered);
  const { pageItems, page, pageCount, total, setPage } = usePagination(filtered, [search, categorie, statut, startDate, endDate]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, gap: 12 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
        <span style={{ fontWeight: 500, color: 'var(--neutral-500)' }}>Chargement des dépenses...</span>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dépenses</h1>
          <p className="page-subtitle">Sorties de caisse : achats, loyer, salaires, charges et entretien</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/depenses/rapports" className="btn btn-outline">
            <FileSpreadsheet size={16} /> Rapports
          </Link>
          <button className="btn btn-primary" onClick={() => setForm(emptyForm())} disabled={!!dbError}>
            <Plus size={16} /> Nouvelle dépense
          </button>
        </div>
      </div>

      {dbError && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <AlertTriangle size={18} /> {dbError}
        </div>
      )}

      {!isAdmin && !dbError && (
        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          <Lock size={18} /> Une dépense enregistrée ne peut être modifiée ou annulée que par l&apos;administration (super administrateur et administrateur). Vérifiez bien le montant avant d&apos;enregistrer.
        </div>
      )}

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-card-icon orange"><CalendarDays size={22} /></div>
          <div className="stat-card-info">
            <h3>Dépenses du jour</h3>
            <div className="stat-value">{formatMoney(depensesJour)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon red"><TrendingDown size={22} /></div>
          <div className="stat-card-info">
            <h3>Dépenses du mois</h3>
            <div className="stat-value">{formatMoney(caisse.sorties)}</div>
            <div className="stat-change negative">{duMois.filter((d) => d.statut !== 'annulée').length} dépense(s)</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon green"><TrendingUp size={22} /></div>
          <div className="stat-card-info">
            <h3>Encaissements du mois</h3>
            <div className="stat-value">{formatMoney(caisse.entrees)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className={`stat-card-icon ${caisse.solde < 0 ? 'red' : 'blue'}`}><Scale size={22} /></div>
          <div className="stat-card-info">
            <h3>Solde de caisse du mois</h3>
            <div className="stat-value" style={{ color: caisse.solde < 0 ? 'var(--danger)' : undefined }}>{formatMoney(caisse.solde)}</div>
            <div className={`stat-change ${caisse.solde < 0 ? 'negative' : 'positive'}`}>Encaissements − dépenses</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '14px 22px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="header-search" style={{ flex: 1, minWidth: 250 }}>
            <Search className="header-search-icon" />
            <input type="text" placeholder="Rechercher un libellé, un bénéficiaire, un n° ou une référence..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--neutral-500)' }}>Du:</span>
            <input type="date" className="form-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: 150 }} />
            <span style={{ fontSize: 13, color: 'var(--neutral-500)' }}>Au:</span>
            <input type="date" className="form-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: 150 }} />
          </div>
          <select className="form-select" style={{ width: 220 }} value={categorie} onChange={(e) => setCategorie(e.target.value)}>
            <option value="toutes">Toutes les catégories</option>
            {Object.entries(CATEGORIES_DEPENSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="form-select" style={{ width: 160 }} value={statut} onChange={(e) => setStatut(e.target.value)}>
            <option value="validée">Validées</option>
            <option value="annulée">Annulées</option>
            <option value="tous">Tous les statuts</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><div className="card-body"><div className="empty-state">
          <Inbox className="empty-state-icon" />
          <h3>Aucune dépense</h3>
          <p>Aucune dépense ne correspond à cette sélection.</p>
        </div></div></div>
      ) : (
        <div className="card">
          <div className="card-header">
            <span className="card-title"><Wallet size={16} /> {filtered.length} dépense(s)</span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Total validé : {formatMoney(totalFiltre)}</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>N° / Date</th>
                <th>Catégorie</th>
                <th>Libellé</th>
                <th>Mode</th>
                <th style={{ textAlign: 'right' }}>Montant</th>
                <th>Enregistré par</th>
                <th>Statut</th>
                {isAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((d) => {
                const st = statusBadge(DEPENSE_STATUTS, d.statut);
                return (
                  <tr key={d.id} style={{ opacity: d.statut === 'annulée' ? 0.6 : 1 }}>
                    <td>
                      <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12 }}>{d.numero}</div>
                      <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{formatDateTime(d.date_depense)}</div>
                    </td>
                    <td><span className="badge badge-info">{CATEGORIES_DEPENSES[d.categorie] || d.categorie}</span></td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{d.libelle}</div>
                      <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>
                        {[d.beneficiaire, d.reference ? `Réf. ${d.reference}` : ''].filter(Boolean).join(' • ') || '—'}
                      </div>
                      {d.statut === 'annulée' && d.motif_annulation && (
                        <div style={{ fontSize: 11, color: 'var(--danger)' }}>Annulée : {d.motif_annulation}</div>
                      )}
                    </td>
                    <td>{MODES_PAIEMENT[d.mode_paiement] || d.mode_paiement}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, textDecoration: d.statut === 'annulée' ? 'line-through' : undefined }}>{formatMoney(d.montant)}</td>
                    <td style={{ fontSize: 13 }}>{d.enregistreur ? `${d.enregistreur.prenom} ${d.enregistreur.nom}` : '—'}</td>
                    <td><span className={`badge ${st.badge}`}>{st.label}</span></td>
                    {isAdmin && (
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {canEditDepense(profile?.role, d) && (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => openEdit(d)} title="Modifier">
                              <Edit size={14} />
                            </button>
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setAnnulation({ depense: d, motif: '' })} disabled={busy === d.id} title="Annuler">
                              <Ban size={14} />
                            </button>
                          </>
                        )}
                        {canDeleteDepense(profile?.role, d) && (
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(d)} disabled={busy === d.id} title="Supprimer">
                            {busy === d.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} pageCount={pageCount} total={total} onPageChange={setPage} label="dépenses" />
        </div>
      )}

      <Modal
        open={!!form}
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Wallet size={18} /> {form?.id ? 'Modifier une dépense' : 'Nouvelle dépense'}</span>}
        onClose={() => setForm(null)}
        footer={(
          <>
            <button className="btn btn-outline" onClick={() => setForm(null)}>Annuler</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Enregistrer
            </button>
          </>
        )}
      >
        {form && (
          <>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Date et heure *</label>
                <input type="datetime-local" className="form-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Catégorie *</label>
                <select className="form-select" value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value as Depense['categorie'] })}>
                  {Object.entries(CATEGORIES_DEPENSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Libellé *</label>
              <input className="form-input" value={form.libelle} maxLength={200} onChange={(e) => setForm({ ...form, libelle: e.target.value })} placeholder="Ex : Achat de 2 tensiomètres, loyer d'octobre, salaires du personnel..." />
            </div>
            <div className="form-group">
              <label className="form-label">Bénéficiaire / fournisseur</label>
              <input className="form-input" value={form.beneficiaire} maxLength={150} onChange={(e) => setForm({ ...form, beneficiaire: e.target.value })} placeholder="Ex : Pharmacie centrale, bailleur, REGIDESO..." />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Montant (FC) *</label>
                <input type="number" min="0" step="50" className="form-input" value={form.montant || ''} onChange={(e) => setForm({ ...form, montant: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="form-group">
                <label className="form-label">Mode de paiement</label>
                <select className="form-select" value={form.mode_paiement} onChange={(e) => setForm({ ...form, mode_paiement: e.target.value as Depense['mode_paiement'] })}>
                  {Object.entries(MODES_PAIEMENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Référence de la pièce justificative</label>
              <input className="form-input" value={form.reference} maxLength={100} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="N° de facture fournisseur, reçu, bon de commande..." />
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-textarea" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={!!annulation}
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Ban size={18} /> Annuler la dépense</span>}
        onClose={() => setAnnulation(null)}
        maxWidth={520}
        footer={(
          <>
            <button className="btn btn-outline" onClick={() => setAnnulation(null)}>Retour</button>
            <button className="btn btn-danger" onClick={handleAnnuler} disabled={!!busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />} Annuler la dépense
            </button>
          </>
        )}
      >
        {annulation && (
          <>
            <p style={{ marginTop: 0, fontSize: 14, color: 'var(--neutral-700)' }}>
              La dépense <strong>{annulation.depense.numero}</strong> ({annulation.depense.libelle}, {formatMoney(annulation.depense.montant)}) ne comptera plus dans la caisse. Elle reste visible dans l&apos;historique.
            </p>
            <div className="form-group">
              <label className="form-label">Motif de l&apos;annulation *</label>
              <textarea className="form-textarea" rows={3} value={annulation.motif} onChange={(e) => setAnnulation({ ...annulation, motif: e.target.value })} placeholder="Ex : saisie en double, montant erroné..." />
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
