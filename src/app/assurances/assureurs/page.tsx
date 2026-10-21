'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Loader2, Edit, AlertTriangle, Save, Inbox, Building2, Lock, Trash2, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import Pagination from '@/components/ui/Pagination';
import { usePagination } from '@/lib/usePagination';
import { useConfirm } from '@/context/ConfirmContext';
import { useAuth } from '@/contexts/AuthContext';
import Modal from '@/components/ui/Modal';
import AssuranceHeader from '@/components/assurances/AssuranceHeader';
import { formatMoney, formatDate, explainDbError } from '@/lib/format';
import { canManageAssureurs } from '@/lib/role-permissions';
import { TYPES_ASSUREURS, contratEchu, type Assureur, type TypeAssureur } from '@/lib/assurances';

type FormState = {
  id?: string;
  code: string;
  nom: string;
  type: TypeAssureur;
  taux_couverture: string;
  plafond_facture: string;
  delai_paiement_jours: string;
  numero_contrat: string;
  date_debut_contrat: string;
  date_fin_contrat: string;
  contact_nom: string;
  telephone: string;
  email: string;
  adresse: string;
  notes: string;
  actif: boolean;
};

const EMPTY: FormState = {
  code: '', nom: '', type: 'assurance', taux_couverture: '80', plafond_facture: '', delai_paiement_jours: '30',
  numero_contrat: '', date_debut_contrat: '', date_fin_contrat: '', contact_nom: '', telephone: '', email: '', adresse: '', notes: '', actif: true,
};

const toForm = (a: Assureur): FormState => ({
  id: a.id,
  code: a.code,
  nom: a.nom,
  type: a.type,
  taux_couverture: String(Number(a.taux_couverture)),
  plafond_facture: a.plafond_facture ? String(Number(a.plafond_facture)) : '',
  delai_paiement_jours: String(a.delai_paiement_jours),
  numero_contrat: a.numero_contrat || '',
  date_debut_contrat: a.date_debut_contrat || '',
  date_fin_contrat: a.date_fin_contrat || '',
  contact_nom: a.contact_nom || '',
  telephone: a.telephone || '',
  email: a.email || '',
  adresse: a.adresse || '',
  notes: a.notes || '',
  actif: a.actif,
});

export default function AssureursPage() {
  const { confirm } = useConfirm();
  const { profile } = useAuth();
  // Seuls les administrateurs enregistrent et modifient les assureurs ; la caisse les consulte
  const canEdit = canManageAssureurs(profile?.role);

  const [assureurs, setAssureurs] = useState<Assureur[]>([]);
  const [assures, setAssures] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState('');
  const [search, setSearch] = useState('');
  const [showInactifs, setShowInactifs] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: pats }] = await Promise.all([
      supabase.from('assureurs').select('*').order('nom'),
      supabase.from('patients').select('assureur_id').not('assureur_id', 'is', null),
    ]);
    if (error) {
      setDbError(explainDbError(error));
    } else {
      setDbError('');
      setAssureurs((data || []) as Assureur[]);
      const counts: Record<string, number> = {};
      for (const p of (pats || []) as { assureur_id: string }[]) counts[p.assureur_id] = (counts[p.assureur_id] || 0) + 1;
      setAssures(counts);
    }
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form || !canEdit) return;
    const taux = Number(form.taux_couverture);
    const delai = Number(form.delai_paiement_jours);
    const plafond = form.plafond_facture.trim() ? Number(form.plafond_facture) : null;
    if (!form.code.trim() || !form.nom.trim()) return toast.error('Le code et le nom de l’assureur sont obligatoires.');
    if (!(taux >= 0 && taux <= 100)) return toast.error('Le taux de couverture doit être compris entre 0 et 100 %.');
    if (!(delai >= 0 && delai <= 365)) return toast.error('Le délai de paiement doit être compris entre 0 et 365 jours.');
    if (plafond !== null && !(plafond > 0)) return toast.error('Le plafond par facture doit être positif (laissez vide pour aucun plafond).');
    if (form.date_debut_contrat && form.date_fin_contrat && form.date_fin_contrat < form.date_debut_contrat) {
      return toast.error('La fin du contrat doit être postérieure à son début.');
    }
    setSaving(true);
    const opt = (v: string) => v.trim() || null;
    const payload = {
      code: form.code.trim().toUpperCase(),
      nom: form.nom.trim(),
      type: form.type,
      taux_couverture: taux,
      plafond_facture: plafond,
      delai_paiement_jours: delai,
      numero_contrat: opt(form.numero_contrat),
      date_debut_contrat: opt(form.date_debut_contrat),
      date_fin_contrat: opt(form.date_fin_contrat),
      contact_nom: opt(form.contact_nom),
      telephone: opt(form.telephone),
      email: opt(form.email),
      adresse: opt(form.adresse),
      notes: opt(form.notes),
      actif: form.actif,
    };
    const { error } = form.id
      ? await supabase.from('assureurs').update(payload).eq('id', form.id)
      : await supabase.from('assureurs').insert([payload]);
    setSaving(false);
    if (error) {
      toast.error(error.code === '23505' ? 'Ce code ou ce nom est déjà utilisé par un autre assureur.' : explainDbError(error));
      return;
    }
    toast.success(form.id ? 'Assureur mis à jour.' : 'Assureur enregistré : il est proposé à l’enregistrement des patients.');
    setForm(null);
    load();
  };

  const toggleActif = async (a: Assureur) => {
    if (!canEdit) return;
    if (a.actif) {
      const ok = await confirm({
        title: 'Désactiver cet assureur',
        message: `« ${a.nom} » ne sera plus proposé pour les nouveaux patients ni les nouvelles prises en charge. Ses factures, bordereaux et règlements restent consultables et recouvrables.`,
        confirmText: 'Désactiver',
        type: 'warning',
      });
      if (!ok) return;
    }
    const { error } = await supabase.from('assureurs').update({ actif: !a.actif }).eq('id', a.id);
    if (error) return toast.error(explainDbError(error));
    setAssureurs((prev) => prev.map((x) => (x.id === a.id ? { ...x, actif: !x.actif } : x)));
  };

  const handleDelete = async (a: Assureur) => {
    if (!canEdit) return;
    const ok = await confirm({
      title: 'Supprimer cet assureur',
      message: `« ${a.nom} » sera définitivement supprimé. Un assureur rattaché à des patients ou à des factures ne peut pas être supprimé : désactivez-le plutôt.`,
      confirmText: 'Supprimer',
      type: 'danger',
    });
    if (!ok) return;
    const { error } = await supabase.from('assureurs').delete().eq('id', a.id);
    if (error) {
      toast.error(error.code === '23503' ? 'Cet assureur a des patients, des factures ou des opérations : désactivez-le plutôt que de le supprimer.' : explainDbError(error));
      return;
    }
    toast.success('Assureur supprimé.');
    load();
  };

  const filtered = assureurs.filter((a) => {
    const q = search.toLowerCase();
    return (showInactifs || a.actif) && (q === '' || a.nom.toLowerCase().includes(q) || a.code.toLowerCase().includes(q));
  });
  const { pageItems, page, pageCount, total, setPage } = usePagination(filtered, [search, showInactifs]);
  const set = (patch: Partial<FormState>) => form && setForm({ ...form, ...patch });

  return (
    <div className="animate-fade-in">
      <AssuranceHeader
        title="Assureurs"
        subtitle="Compagnies, mutuelles et entreprises conventionnées : seuls ces assureurs sont proposés à l’enregistrement des patients"
        actions={canEdit && (
          <button className="btn btn-primary" onClick={() => setForm({ ...EMPTY })} disabled={!!dbError}>
            <Plus size={16} /> Nouvel assureur
          </button>
        )}
      />

      {!canEdit && (
        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          <Lock size={18} /> Consultation seule : l&apos;ajout et la modification des assureurs sont réservés à l&apos;administration (super administrateur et administrateur).
        </div>
      )}
      {dbError && <div className="alert alert-danger" style={{ marginBottom: 20 }}><AlertTriangle size={18} /> {dbError}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '14px 22px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="header-search" style={{ flex: 1, minWidth: 250 }}>
            <Search className="header-search-icon" />
            <input type="text" placeholder="Rechercher un assureur ou un code..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={showInactifs} onChange={(e) => setShowInactifs(e.target.checked)} />
            Afficher les assureurs désactivés
          </label>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="card"><div className="card-body"><div className="empty-state">
          <Inbox className="empty-state-icon" />
          <h3>Aucun assureur</h3>
          <p>{canEdit ? 'Enregistrez les assureurs avec lesquels l’hôpital travaille, leur taux de couverture et leur délai de paiement.' : 'L’administration n’a encore enregistré aucun assureur.'}</p>
        </div></div></div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Assureur</th>
                <th>Type</th>
                <th style={{ textAlign: 'right' }}>Couverture</th>
                <th style={{ textAlign: 'right' }}>Plafond / facture</th>
                <th style={{ textAlign: 'right' }}>Délai</th>
                <th>Contrat</th>
                <th style={{ textAlign: 'right' }}>Assurés</th>
                <th>Statut</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((a) => {
                const echu = contratEchu(a);
                return (
                  <tr key={a.id} style={{ opacity: a.actif ? 1 : 0.55 }}>
                    <td>
                      <Link href={`/assurances/assureurs/${a.id}`} style={{ fontWeight: 600, color: 'var(--neutral-800)' }}>{a.nom}</Link>
                      <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--neutral-500)' }}>{a.code}</div>
                    </td>
                    <td style={{ fontSize: 13 }}>{TYPES_ASSUREURS[a.type] || a.type}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{Number(a.taux_couverture)} %</td>
                    <td style={{ textAlign: 'right' }}>{a.plafond_facture ? formatMoney(a.plafond_facture) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{a.delai_paiement_jours} j</td>
                    <td style={{ fontSize: 12 }}>
                      {a.numero_contrat || '—'}
                      {a.date_fin_contrat && (
                        <div style={{ color: echu ? 'var(--danger)' : 'var(--neutral-500)', fontWeight: echu ? 600 : 400 }}>
                          {echu ? 'Échu le' : 'Jusqu’au'} {formatDate(a.date_fin_contrat)}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Users size={13} /> {assures[a.id] || 0}</span>
                    </td>
                    <td>
                      {canEdit ? (
                        <button className={`badge ${a.actif ? 'badge-success' : 'badge-neutral'}`} style={{ border: 'none', cursor: 'pointer' }} onClick={() => toggleActif(a)} title="Activer / désactiver">
                          {a.actif ? 'Actif' : 'Désactivé'}
                        </button>
                      ) : (
                        <span className={`badge ${a.actif ? 'badge-success' : 'badge-neutral'}`}>{a.actif ? 'Actif' : 'Désactivé'}</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Link href={`/assurances/assureurs/${a.id}`} className="btn btn-ghost btn-sm">Fiche</Link>
                      {canEdit && (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => setForm(toForm(a))} title="Modifier"><Edit size={14} /></button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(a)} title="Supprimer" style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} pageCount={pageCount} total={total} onPageChange={setPage} label="assureurs" />
        </div>
      )}

      <Modal
        open={!!form && canEdit}
        maxWidth={760}
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Building2 size={18} /> {form?.id ? 'Modifier un assureur' : 'Nouvel assureur'}</span>}
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
                <label className="form-label">Nom de l&apos;assureur *</label>
                <input className="form-input" value={form.nom} maxLength={150} onChange={(e) => set({ nom: e.target.value })} placeholder="Ex : SONAS" />
              </div>
              <div className="form-group">
                <label className="form-label">Code *</label>
                <input className="form-input" value={form.code} maxLength={20} onChange={(e) => set({ code: e.target.value })} placeholder="Ex : SONAS" style={{ fontFamily: 'monospace' }} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-select" value={form.type} onChange={(e) => set({ type: e.target.value as TypeAssureur })}>
                  {Object.entries(TYPES_ASSUREURS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, paddingBottom: 12 }}>
                  <input type="checkbox" checked={form.actif} onChange={(e) => set({ actif: e.target.checked })} />
                  Proposé à l&apos;enregistrement des patients
                </label>
              </div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--neutral-400)', margin: '6px 0 10px' }}>Conditions de prise en charge</div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Taux de couverture (%) *</label>
                <input type="number" min="0" max="100" step="1" className="form-input" value={form.taux_couverture} onChange={(e) => set({ taux_couverture: e.target.value })} />
                <p className="form-help">Proposé par défaut sur les factures de ses assurés</p>
              </div>
              <div className="form-group">
                <label className="form-label">Plafond par facture (FC)</label>
                <input type="number" min="0" step="1000" className="form-input" value={form.plafond_facture} onChange={(e) => set({ plafond_facture: e.target.value })} placeholder="Aucun plafond" />
              </div>
              <div className="form-group">
                <label className="form-label">Délai de paiement (jours) *</label>
                <input type="number" min="0" max="365" className="form-input" value={form.delai_paiement_jours} onChange={(e) => set({ delai_paiement_jours: e.target.value })} />
                <p className="form-help">Échéance après l&apos;envoi du bordereau</p>
              </div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--neutral-400)', margin: '6px 0 10px' }}>Contrat</div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">N° de convention / contrat</label>
                <input className="form-input" value={form.numero_contrat} maxLength={60} onChange={(e) => set({ numero_contrat: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Début</label>
                <input type="date" className="form-input" value={form.date_debut_contrat} onChange={(e) => set({ date_debut_contrat: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Fin</label>
                <input type="date" className="form-input" value={form.date_fin_contrat} onChange={(e) => set({ date_fin_contrat: e.target.value })} />
              </div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--neutral-400)', margin: '6px 0 10px' }}>Contact</div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Interlocuteur</label>
                <input className="form-input" value={form.contact_nom} maxLength={150} onChange={(e) => set({ contact_nom: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Téléphone</label>
                <input type="tel" className="form-input" value={form.telephone} maxLength={40} onChange={(e) => set({ telephone: e.target.value })} placeholder="+243 XX XXX XXXX" />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" className="form-input" value={form.email} maxLength={150} onChange={(e) => set({ email: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Adresse</label>
              <textarea className="form-textarea" rows={2} value={form.adresse} onChange={(e) => set({ adresse: e.target.value })} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Notes (actes exclus, pièces exigées…)</label>
              <textarea className="form-textarea" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
