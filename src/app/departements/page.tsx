'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2, Plus, Loader2, Edit, Users, BedDouble, Phone, Layers, Save, Trash2, Inbox, Crown } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';
import Modal from '@/components/ui/Modal';
import { explainDbError } from '@/lib/format';

type DeptForm = {
  id?: string;
  nom: string;
  code: string;
  description: string;
  etage: string;
  telephone: string;
  chef_departement_id: string;
  statut: 'actif' | 'inactif';
};

const EMPTY: DeptForm = { nom: '', code: '', description: '', etage: '', telephone: '', chef_departement_id: '', statut: 'actif' };

export default function DepartementsPage() {
  const { confirm } = useConfirm();
  const [departements, setDepartements] = useState<any[]>([]);
  const [personnel, setPersonnel] = useState<any[]>([]);
  const [chambres, setChambres] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<DeptForm | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: d, error }, { data: p }, { data: c }] = await Promise.all([
      supabase.from('departements').select('*').order('nom'),
      supabase.from('personnel').select('id, nom, prenom, role, departement_id, statut').order('nom'),
      supabase.from('chambres').select('id, departement_id'),
    ]);
    if (error) toast.error(explainDbError(error));
    setDepartements(d || []);
    setPersonnel(p || []);
    setChambres(c || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!form) return;
    if (!form.nom.trim() || !form.code.trim()) {
      toast.error('Le nom et le code sont obligatoires.');
      return;
    }
    setSaving(true);
    const payload = {
      nom: form.nom.trim(),
      code: form.code.trim().toUpperCase().slice(0, 10),
      description: form.description.trim() || null,
      etage: form.etage.trim() || null,
      telephone: form.telephone.trim() || null,
      chef_departement_id: form.chef_departement_id || null,
      statut: form.statut,
    };
    const { error } = form.id
      ? await supabase.from('departements').update(payload).eq('id', form.id)
      : await supabase.from('departements').insert([payload]);
    setSaving(false);
    if (error) {
      toast.error(error.code === '23505' ? 'Ce code de département existe déjà.' : explainDbError(error));
      return;
    }
    toast.success(form.id ? 'Département mis à jour.' : 'Département créé.');
    setForm(null);
    load();
  };

  const handleDelete = async (d: any) => {
    const ok = await confirm({
      title: 'Supprimer le département',
      message: `Supprimer définitivement « ${d.nom} » ?`,
      confirmText: 'Supprimer',
      type: 'danger',
    });
    if (!ok) return;
    const { error } = await supabase.from('departements').delete().eq('id', d.id);
    if (error) {
      toast.error(`Suppression impossible : ${error.message}`);
      return;
    }
    toast.success('Département supprimé.');
    load();
  };

  const actifs = personnel.filter((p) => p.statut === 'actif');

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Départements & services</h1>
          <p className="page-subtitle">{departements.length} département(s) • organisation de l&apos;hôpital</p>
        </div>
        <button className="btn btn-primary" onClick={() => setForm({ ...EMPTY })}>
          <Plus size={16} /> Nouveau département
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>
      ) : departements.length === 0 ? (
        <div className="card"><div className="card-body"><div className="empty-state">
          <Inbox className="empty-state-icon" />
          <h3>Aucun département</h3>
          <p>Créez les services de l&apos;hôpital (médecine interne, pédiatrie, maternité, urgences...).</p>
        </div></div></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
          {departements.map((d) => {
            const membres = personnel.filter((p) => p.departement_id === d.id);
            const medecins = membres.filter((p) => p.role?.startsWith('medecin')).length;
            const nbChambres = chambres.filter((c) => c.departement_id === d.id).length;
            const chef = personnel.find((p) => p.id === d.chef_departement_id);
            const canDelete = membres.length === 0 && nbChambres === 0;
            return (
              <div key={d.id} className="card" style={{ opacity: d.statut === 'inactif' ? 0.6 : 1 }}>
                <div className="card-body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--primary-50)', color: 'var(--primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Building2 size={22} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: 16, fontWeight: 700 }}>{d.nom}</h3>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--neutral-500)' }}>{d.code}</span>
                      </div>
                    </div>
                    <span className={`badge ${d.statut === 'actif' ? 'badge-success' : 'badge-neutral'}`}>{d.statut}</span>
                  </div>
                  {d.description && <p style={{ fontSize: 13, color: 'var(--neutral-600)', marginBottom: 12 }}>{d.description}</p>}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                    {[
                      { icon: <Users size={14} />, label: 'Personnel', value: membres.length },
                      { icon: <Users size={14} />, label: 'Médecins', value: medecins },
                      { icon: <BedDouble size={14} />, label: 'Chambres', value: nbChambres },
                    ].map((s) => (
                      <div key={s.label} style={{ background: 'var(--neutral-50)', borderRadius: 8, padding: '8px 10px' }}>
                        <div style={{ fontSize: 10, color: 'var(--neutral-400)', textTransform: 'uppercase', fontWeight: 600, display: 'flex', gap: 4, alignItems: 'center' }}>{s.icon} {s.label}</div>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--neutral-600)' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Crown size={13} /> Chef : {chef ? `${chef.role?.startsWith('medecin') ? 'Dr. ' : ''}${chef.prenom} ${chef.nom}` : 'Non désigné'}</div>
                    {d.etage && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Layers size={13} /> {d.etage}</div>}
                    {d.telephone && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Phone size={13} /> {d.telephone}</div>}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, borderTop: '1px solid var(--neutral-100)', marginTop: 14, paddingTop: 12 }}>
                    {canDelete && (
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(d)} title="Supprimer (département vide)">
                        <Trash2 size={14} />
                      </button>
                    )}
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => setForm({
                        id: d.id, nom: d.nom, code: d.code, description: d.description || '', etage: d.etage || '',
                        telephone: d.telephone || '', chef_departement_id: d.chef_departement_id || '', statut: d.statut || 'actif',
                      })}
                    >
                      <Edit size={14} /> Modifier
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={!!form}
        title={form?.id ? 'Modifier le département' : 'Nouveau département'}
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
                <label className="form-label">Nom *</label>
                <input className="form-input" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="Ex : Pédiatrie" />
              </div>
              <div className="form-group">
                <label className="form-label">Code * (10 car. max)</label>
                <input className="form-input" value={form.code} maxLength={10} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Ex : PED" style={{ fontFamily: 'monospace' }} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-textarea" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Étage / localisation</label>
                <input className="form-input" value={form.etage} onChange={(e) => setForm({ ...form, etage: e.target.value })} placeholder="Ex : 1er étage, bâtiment B" />
              </div>
              <div className="form-group">
                <label className="form-label">Téléphone du service</label>
                <input className="form-input" value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Chef de département</label>
                <select className="form-select" value={form.chef_departement_id} onChange={(e) => setForm({ ...form, chef_departement_id: e.target.value })}>
                  <option value="">— Non désigné —</option>
                  {actifs.map((p) => <option key={p.id} value={p.id}>{p.role?.startsWith('medecin') ? 'Dr. ' : ''}{p.prenom} {p.nom}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Statut</label>
                <select className="form-select" value={form.statut} onChange={(e) => setForm({ ...form, statut: e.target.value as DeptForm['statut'] })}>
                  <option value="actif">Actif</option>
                  <option value="inactif">Inactif</option>
                </select>
              </div>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
