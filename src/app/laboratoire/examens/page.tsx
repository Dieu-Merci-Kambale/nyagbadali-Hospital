'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Search, Loader2, Edit, AlertTriangle, Save, Inbox, FlaskConical, Lock, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import Pagination from '@/components/ui/Pagination';
import { usePagination } from '@/lib/usePagination';
import { useConfirm } from '@/context/ConfirmContext';
import { useAuth } from '@/contexts/AuthContext';
import Modal from '@/components/ui/Modal';
import { formatMoney, explainDbError } from '@/lib/format';
import { canManageTarifs } from '@/lib/role-permissions';
import { FAMILLES_EXAMENS, fetchExamensLabo } from '@/lib/lab-catalogue';
import type { ActeTarif } from '@/types';

type Parametre = { nom: string; unite: string; reference: string };
type FormState = { id?: string; code: string; libelle: string; famille: string; prix: number; actif: boolean; parametres: Parametre[] };

const emptyParam = (): Parametre => ({ nom: '', unite: '', reference: '' });
const EMPTY: FormState = { code: 'LAB-', libelle: '', famille: 'Hématologie', prix: 0, actif: true, parametres: [emptyParam()] };

const toForm = (e: ActeTarif): FormState => ({
  id: e.id,
  code: e.code,
  libelle: e.libelle,
  famille: e.famille || 'Autre',
  prix: Number(e.prix),
  actif: e.actif,
  parametres: (e.parametres || []).length
    ? (e.parametres || []).map((p) => ({ nom: p.nom, unite: p.unite || '', reference: p.reference || '' }))
    : [emptyParam()],
});

export default function CatalogueExamensPage() {
  const router = useRouter();
  const { confirm } = useConfirm();
  const { profile } = useAuth();
  // Seuls les administrateurs enregistrent les examens et leurs prix ; les autres les consultent
  const canEdit = canManageTarifs(profile?.role);

  const [examens, setExamens] = useState<ActeTarif[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState('');
  const [search, setSearch] = useState('');
  const [famille, setFamille] = useState('toutes');
  const [showInactifs, setShowInactifs] = useState(false);

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { examens: data, error } = await fetchExamensLabo({ inclureInactifs: true });
    if (error) {
      setDbError(explainDbError(error));
    } else {
      setDbError('');
      setExamens(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setParam = (i: number, patch: Partial<Parametre>) => {
    if (!form) return;
    setForm({ ...form, parametres: form.parametres.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  };

  const handleSave = async () => {
    if (!form || !canEdit) return;
    if (!form.code.trim() || !form.libelle.trim()) {
      toast.error('Le code et le nom de l’examen sont obligatoires.');
      return;
    }
    if (form.libelle.trim().length > 100) {
      toast.error('Le nom de l’examen ne doit pas dépasser 100 caractères.');
      return;
    }
    if (form.actif && !(Number(form.prix) > 0)) {
      const ok = await confirm({
        title: 'Examen sans prix',
        message: 'Cet examen sera proposé aux médecins avec un prix de 0 FC. Continuer ?',
        confirmText: 'Oui, enregistrer',
        type: 'warning',
      });
      if (!ok) return;
    }
    setSaving(true);
    const payload = {
      code: form.code.trim().toUpperCase(),
      libelle: form.libelle.trim(),
      categorie: 'laboratoire' as const,
      famille: form.famille,
      prix: Math.max(0, Number(form.prix) || 0),
      actif: form.actif,
      parametres: form.parametres
        .filter((p) => p.nom.trim())
        .map((p) => ({ nom: p.nom.trim(), unite: p.unite.trim(), reference: p.reference.trim() })),
    };
    const { error } = form.id
      ? await supabase.from('actes_tarifs').update(payload).eq('id', form.id)
      : await supabase.from('actes_tarifs').insert([payload]);
    setSaving(false);
    if (error) {
      toast.error(error.code === '23505' ? 'Ce code est déjà utilisé par un autre acte.' : explainDbError(error));
      return;
    }
    toast.success(form.id ? 'Examen mis à jour.' : 'Examen ajouté au catalogue.');
    setForm(null);
    load();
  };

  const toggleActif = async (examen: ActeTarif) => {
    if (!canEdit) return;
    if (examen.actif) {
      const ok = await confirm({
        title: 'Désactiver cet examen',
        message: `« ${examen.libelle} » ne pourra plus être demandé (les demandes et factures existantes ne changent pas).`,
        confirmText: 'Désactiver',
        type: 'warning',
      });
      if (!ok) return;
    }
    const { error } = await supabase.from('actes_tarifs').update({ actif: !examen.actif }).eq('id', examen.id);
    if (error) {
      toast.error(explainDbError(error));
      return;
    }
    setExamens((prev) => prev.map((e) => (e.id === examen.id ? { ...e, actif: !e.actif } : e)));
  };

  const familles = Array.from(new Set([...FAMILLES_EXAMENS, ...examens.map((e) => e.famille || 'Autre')]));
  const filtered = examens.filter((e) => {
    const q = search.toLowerCase();
    return (showInactifs || e.actif) &&
      (famille === 'toutes' || (e.famille || 'Autre') === famille) &&
      (q === '' || e.libelle.toLowerCase().includes(q) || e.code.toLowerCase().includes(q));
  });
  const { pageItems, page, pageCount, total, setPage } = usePagination(filtered, [search, famille, showInactifs]);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.push('/laboratoire')} className="btn btn-ghost" title="Retour">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">Catalogue des examens</h1>
            <p className="page-subtitle">Examens proposés aux prescripteurs, avec leur prix et leurs paramètres de résultat</p>
          </div>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setForm({ ...EMPTY, parametres: [emptyParam()] })} disabled={!!dbError}>
            <Plus size={16} /> Nouvel examen
          </button>
        )}
      </div>

      {!canEdit && (
        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          <Lock size={18} /> Consultation seule : l&apos;ajout des examens et de leurs prix est réservé à l&apos;administration (super administrateur et administrateur).
        </div>
      )}

      {dbError && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <AlertTriangle size={18} /> {dbError}
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '14px 22px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="header-search" style={{ flex: 1, minWidth: 250 }}>
            <Search className="header-search-icon" />
            <input type="text" placeholder="Rechercher un examen ou un code..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="form-select" style={{ width: 200 }} value={famille} onChange={(e) => setFamille(e.target.value)}>
            <option value="toutes">Toutes les familles</option>
            {familles.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={showInactifs} onChange={(e) => setShowInactifs(e.target.checked)} />
            Afficher les examens désactivés
          </label>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="card"><div className="card-body"><div className="empty-state">
          <Inbox className="empty-state-icon" />
          <h3>Aucun examen</h3>
          <p>{canEdit ? 'Ajoutez les examens réalisés par le laboratoire et leur prix.' : 'L’administration n’a encore enregistré aucun examen.'}</p>
        </div></div></div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Examen</th>
                <th>Famille</th>
                <th>Paramètres</th>
                <th style={{ textAlign: 'right' }}>Prix</th>
                <th>Statut</th>
                {canEdit && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((e) => (
                <tr key={e.id} style={{ opacity: e.actif ? 1 : 0.5 }}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12 }}>{e.code}</td>
                  <td style={{ fontWeight: 600 }}>{e.libelle}</td>
                  <td><span className="badge badge-info">{e.famille || 'Autre'}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--neutral-500)', maxWidth: 280 }}>
                    {(e.parametres || []).length ? (e.parametres || []).map((p) => p.nom).join(', ') : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(e.prix)}</td>
                  <td>
                    {canEdit ? (
                      <button className={`badge ${e.actif ? 'badge-success' : 'badge-neutral'}`} style={{ border: 'none', cursor: 'pointer' }} onClick={() => toggleActif(e)} title="Activer / désactiver">
                        {e.actif ? 'Actif' : 'Désactivé'}
                      </button>
                    ) : (
                      <span className={`badge ${e.actif ? 'badge-success' : 'badge-neutral'}`}>{e.actif ? 'Actif' : 'Désactivé'}</span>
                    )}
                  </td>
                  {canEdit && (
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setForm(toForm(e))}>
                        <Edit size={14} /> Modifier
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageCount={pageCount} total={total} onPageChange={setPage} label="examens" />
        </div>
      )}

      <Modal
        open={!!form && canEdit}
        maxWidth={760}
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FlaskConical size={18} /> {form?.id ? 'Modifier un examen' : 'Nouvel examen'}</span>}
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
                <label className="form-label">Code *</label>
                <input className="form-input" value={form.code} maxLength={20} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Ex : LAB-IONO" style={{ fontFamily: 'monospace' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Famille</label>
                <select className="form-select" value={form.famille} onChange={(e) => setForm({ ...form, famille: e.target.value })}>
                  {familles.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Nom de l&apos;examen *</label>
              <input className="form-input" value={form.libelle} maxLength={100} onChange={(e) => setForm({ ...form, libelle: e.target.value })} placeholder="Ex : Ionogramme sanguin" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Prix (FC) *</label>
                <input type="number" min="0" step="50" className="form-input" value={form.prix} onChange={(e) => setForm({ ...form, prix: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, paddingBottom: 12 }}>
                  <input type="checkbox" checked={form.actif} onChange={(e) => setForm({ ...form, actif: e.target.checked })} />
                  Proposé aux prescripteurs
                </label>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Paramètres de résultat</label>
              <p className="form-help" style={{ marginTop: 0 }}>Pré-remplis pour le laboratoire lors de la saisie des résultats (valeurs de référence adulte).</p>
              <div style={{ display: 'grid', gap: 8 }}>
                {form.parametres.map((p, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1.5fr) auto', gap: 8 }}>
                    <input className="form-input" placeholder="Paramètre (ex : Sodium)" value={p.nom} onChange={(e) => setParam(i, { nom: e.target.value })} />
                    <input className="form-input" placeholder="Unité" value={p.unite} onChange={(e) => setParam(i, { unite: e.target.value })} />
                    <input className="form-input" placeholder="Référence" value={p.reference} onChange={(e) => setParam(i, { reference: e.target.value })} />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      title="Retirer ce paramètre"
                      onClick={() => setForm({ ...form, parametres: form.parametres.length > 1 ? form.parametres.filter((_, j) => j !== i) : [emptyParam()] })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={() => setForm({ ...form, parametres: [...form.parametres, emptyParam()] })}>
                <Plus size={14} /> Ajouter un paramètre
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
