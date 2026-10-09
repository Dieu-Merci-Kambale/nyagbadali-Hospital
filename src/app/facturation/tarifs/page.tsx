'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Search, Loader2, Edit, AlertTriangle, Save, Inbox, BookOpen } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';
import Modal from '@/components/ui/Modal';
import { CATEGORIES_ACTES, formatMoney, explainDbError } from '@/lib/format';
import type { ActeTarif } from '@/types';

type FormState = { id?: string; code: string; libelle: string; categorie: ActeTarif['categorie']; prix: number; actif: boolean };

const EMPTY: FormState = { code: '', libelle: '', categorie: 'consultation', prix: 0, actif: true };

export default function TarifsPage() {
  const router = useRouter();
  const { confirm } = useConfirm();

  const [actes, setActes] = useState<ActeTarif[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState('');
  const [search, setSearch] = useState('');
  const [categorie, setCategorie] = useState('toutes');
  const [showInactifs, setShowInactifs] = useState(false);

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('actes_tarifs').select('*').order('categorie').order('libelle');
    if (error) {
      setDbError(explainDbError(error));
    } else {
      setDbError('');
      setActes((data || []) as ActeTarif[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!form) return;
    if (!form.code.trim() || !form.libelle.trim()) {
      toast.error('Le code et le libellé sont obligatoires.');
      return;
    }
    setSaving(true);
    const payload = {
      code: form.code.trim().toUpperCase(),
      libelle: form.libelle.trim(),
      categorie: form.categorie,
      prix: Math.max(0, Number(form.prix) || 0),
      actif: form.actif,
    };
    const { error } = form.id
      ? await supabase.from('actes_tarifs').update(payload).eq('id', form.id)
      : await supabase.from('actes_tarifs').insert([payload]);
    setSaving(false);
    if (error) {
      toast.error(error.code === '23505' ? 'Ce code est déjà utilisé par un autre acte.' : explainDbError(error));
      return;
    }
    toast.success(form.id ? 'Tarif mis à jour.' : 'Acte ajouté au catalogue.');
    setForm(null);
    load();
  };

  const toggleActif = async (acte: ActeTarif) => {
    if (acte.actif) {
      const ok = await confirm({
        title: 'Désactiver cet acte',
        message: `« ${acte.libelle} » ne sera plus proposé dans les nouvelles factures (les factures existantes ne changent pas).`,
        confirmText: 'Désactiver',
        type: 'warning',
      });
      if (!ok) return;
    }
    const { error } = await supabase.from('actes_tarifs').update({ actif: !acte.actif }).eq('id', acte.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setActes((prev) => prev.map((a) => (a.id === acte.id ? { ...a, actif: !a.actif } : a)));
  };

  const filtered = actes.filter((a) => {
    const q = search.toLowerCase();
    return (showInactifs || a.actif) &&
      (categorie === 'toutes' || a.categorie === categorie) &&
      (q === '' || a.libelle.toLowerCase().includes(q) || a.code.toLowerCase().includes(q));
  });

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.push('/facturation')} className="btn btn-ghost" title="Retour">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">Catalogue des actes & tarifs</h1>
            <p className="page-subtitle">Prix de référence utilisés pour composer les factures</p>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setForm({ ...EMPTY })} disabled={!!dbError}>
          <Plus size={16} /> Nouvel acte
        </button>
      </div>

      {dbError && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <AlertTriangle size={18} /> {dbError}
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '14px 22px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="header-search" style={{ flex: 1, minWidth: 250 }}>
            <Search className="header-search-icon" />
            <input type="text" placeholder="Rechercher un acte ou un code..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="form-select" style={{ width: 200 }} value={categorie} onChange={(e) => setCategorie(e.target.value)}>
            <option value="toutes">Toutes les catégories</option>
            {Object.entries(CATEGORIES_ACTES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={showInactifs} onChange={(e) => setShowInactifs(e.target.checked)} />
            Afficher les actes désactivés
          </label>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="card"><div className="card-body"><div className="empty-state">
          <Inbox className="empty-state-icon" />
          <h3>Aucun acte</h3>
          <p>Ajoutez vos actes et leurs tarifs pour accélérer la facturation.</p>
        </div></div></div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Libellé</th>
                <th>Catégorie</th>
                <th style={{ textAlign: 'right' }}>Tarif</th>
                <th>Statut</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} style={{ opacity: a.actif ? 1 : 0.5 }}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12 }}>{a.code}</td>
                  <td style={{ fontWeight: 600 }}>{a.libelle}</td>
                  <td><span className="badge badge-info">{CATEGORIES_ACTES[a.categorie] || a.categorie}</span></td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(a.prix)}</td>
                  <td>
                    <button className={`badge ${a.actif ? 'badge-success' : 'badge-neutral'}`} style={{ border: 'none', cursor: 'pointer' }} onClick={() => toggleActif(a)} title="Activer / désactiver">
                      {a.actif ? 'Actif' : 'Désactivé'}
                    </button>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setForm({ id: a.id, code: a.code, libelle: a.libelle, categorie: a.categorie, prix: Number(a.prix), actif: a.actif })}>
                      <Edit size={14} /> Modifier
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!form}
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BookOpen size={18} /> {form?.id ? 'Modifier un acte' : 'Nouvel acte'}</span>}
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
                <input className="form-input" value={form.code} maxLength={20} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Ex : IMG-ECHO" style={{ fontFamily: 'monospace' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Catégorie</label>
                <select className="form-select" value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value as ActeTarif['categorie'] })}>
                  {Object.entries(CATEGORIES_ACTES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Libellé *</label>
              <input className="form-input" value={form.libelle} onChange={(e) => setForm({ ...form, libelle: e.target.value })} placeholder="Ex : Échographie abdominale" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Tarif (FC) *</label>
                <input type="number" min="0" step="50" className="form-input" value={form.prix} onChange={(e) => setForm({ ...form, prix: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, paddingBottom: 12 }}>
                  <input type="checkbox" checked={form.actif} onChange={(e) => setForm({ ...form, actif: e.target.checked })} />
                  Proposé dans les factures
                </label>
              </div>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
