'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2, KeyRound, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';
import { toast } from 'react-hot-toast';
import { roleLabels } from '@/lib/role-permissions';
import { useAuth } from '@/contexts/AuthContext';
import { deletePersonnelAction, resetPasswordPersonnelAction } from '@/app/actions/personnel';

export default function EditPersonnelPage() {
  const router = useRouter();
  const { id } = useParams();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [personnel, setPersonnel] = useState<any>(null);
  const [departements, setDepartements] = useState<any[]>([]);
  const { confirm } = useConfirm();
  const { profile } = useAuth();
  const [actionEnCours, setActionEnCours] = useState<'reset' | 'delete' | null>(null);
  const estSuperAdmin = profile?.role === 'super_admin';
  const estSoiMeme = profile?.id === id;

  useEffect(() => {
    async function fetchData() {
      if (!id) return;
      
      const { data: pData, error } = await supabase
        .from('personnel')
        .select('*')
        .eq('id', id)
        .single();
        
      if (error) {
        setErrorMsg('Membre du personnel introuvable.');
        setLoading(false);
        return;
      }
      
      setPersonnel(pData);

      const { data: dData } = await supabase
        .from('departements')
        .select('id, nom')
        .order('nom');
        
      if (dData) setDepartements(dData);

      setLoading(false);
    }
    fetchData();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const isConfirmed = await confirm({
      title: 'Modifier le profil',
      message: 'Confirmez-vous la mise à jour des informations de ce membre du personnel ?',
      confirmText: 'Oui, modifier',
      type: 'info'
    });

    if (!isConfirmed) return;

    setSaving(true);
    setErrorMsg('');
    
    try {
    const data = {
      nom: formData.get('nom') as string,
      prenom: formData.get('prenom') as string,
      telephone: formData.get('telephone') as string,
      role: formData.get('role') as string,
      specialite: ((formData.get('specialite') as string) || '').trim() || null,
      departement_id: formData.get('departement_id') as string || null,
      statut: (formData.get('statut') as string) || 'actif',
    };

    const { error } = await supabase.from('personnel').update(data).eq('id', id);

    if (error) {
      throw error;
    }
    toast.success('Profil mis à jour.');
    router.push('/personnel');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Une erreur inattendue est survenue.');
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    const isConfirmed = await confirm({
      title: 'Réinitialiser le mot de passe',
      message: `Le mot de passe de ${personnel.prenom} ${personnel.nom} sera remplacé par le mot de passe par défaut. Continuer ?`,
      confirmText: 'Oui, réinitialiser',
      type: 'warning'
    });
    if (!isConfirmed) return;

    setActionEnCours('reset');
    const { data: { session } } = await supabase.auth.getSession();
    const result = await resetPasswordPersonnelAction(String(id), session?.access_token);
    setActionEnCours(null);

    if (result.error) toast.error(result.error);
    else toast.success(`Mot de passe réinitialisé : ${result.motDePasse}`, { duration: 10000 });
  };

  const handleDelete = async () => {
    const isConfirmed = await confirm({
      title: 'Supprimer ce membre du personnel',
      message: `${personnel.prenom} ${personnel.nom} et son compte de connexion seront définitivement supprimés. Cette action est irréversible.`,
      confirmText: 'Oui, supprimer',
      type: 'danger'
    });
    if (!isConfirmed) return;

    setActionEnCours('delete');
    const { data: { session } } = await supabase.auth.getSession();
    const result = await deletePersonnelAction(String(id), session?.access_token);
    setActionEnCours(null);

    if (result.error) {
      toast.error(result.error, { duration: 6000 });
    } else {
      toast.success('Membre du personnel supprimé.');
      router.push('/personnel');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Loader2 size={24} className="animate-spin text-primary-500" />
      </div>
    );
  }

  if (!personnel) {
    return (
      <div className="empty-state">
        <AlertCircle style={{ color: 'var(--danger)' }} />
        <h3>Erreur</h3>
        <p>{errorMsg}</p>
        <button className="btn btn-outline" onClick={() => router.push('/personnel')}>Retour</button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.back()} className="btn btn-ghost" title="Retour">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">Modifier Personnel</h1>
            <p className="page-subtitle">{personnel.prenom} {personnel.nom}</p>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <AlertCircle size={18} /> {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ maxWidth: 800 }}>
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body">
            
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Nom *</label>
                <input type="text" name="nom" className="form-input" required defaultValue={personnel.nom} />
              </div>
              <div className="form-group">
                <label className="form-label">Prénom *</label>
                <input type="text" name="prenom" className="form-input" required defaultValue={personnel.prenom} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Email (Connexion) *</label>
                <input type="email" name="email" className="form-input" defaultValue={personnel.email} disabled title="L'email sert d'identifiant de connexion et ne peut pas être modifié ici" />
              </div>
              <div className="form-group">
                <label className="form-label">Téléphone</label>
                <input type="tel" name="telephone" className="form-input" defaultValue={personnel.telephone || ''} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Rôle d'accès *</label>
                <select name="role" className="form-select" required defaultValue={personnel.role}>
                  {Object.entries(roleLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Spécialité (si médical)</label>
                <input name="specialite" className="form-input" list="specialites" defaultValue={personnel.specialite || ''} placeholder="Ex : Médecine générale" />
                <datalist id="specialites">
                  {['Médecine Générale', 'Médecine interne', 'Cardiologie', 'Pédiatrie', 'Gynécologie', 'Chirurgie', 'Neurologie', 'Ophtalmologie', 'Dentisterie', 'Urgences', 'Anesthésiologie', 'Dermatologie', 'Orthopédie'].map((s) => <option key={s} value={s} />)}
                </datalist>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Département</label>
              <select name="departement_id" className="form-select" defaultValue={personnel.departement_id || ''}>
                <option value="">-- Aucun département --</option>
                {departements.map(d => (
                  <option key={d.id} value={d.id}>{d.nom}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Statut du compte</label>
              <select name="statut" className="form-select" defaultValue={personnel.statut || 'actif'}>
                <option value="actif">Actif — peut se connecter</option>
                <option value="congé">En congé — connexion bloquée</option>
                <option value="inactif">Inactif (départ) — connexion bloquée</option>
              </select>
              <p className="form-help">Seuls les comptes « Actif » peuvent se connecter à l&apos;application.</p>
            </div>

          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" onClick={() => router.back()} className="btn btn-outline">Annuler</button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Mettre à jour
          </button>
        </div>
      </form>

      {estSuperAdmin && (
        <div className="card" style={{ maxWidth: 800, marginTop: 32, borderColor: 'var(--danger)' }}>
          <div className="card-body">
            <h3 style={{ marginBottom: 4, color: 'var(--danger)' }}>Actions sensibles</h3>
            <p className="form-help" style={{ marginBottom: 16 }}>Réservées au super administrateur.</p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 600 }}>Réinitialiser le mot de passe</div>
                <p className="form-help">Remplace le mot de passe actuel par le mot de passe par défaut de l&apos;établissement.</p>
              </div>
              <button type="button" className="btn btn-outline" onClick={handleResetPassword} disabled={actionEnCours !== null}>
                {actionEnCours === 'reset' ? <Loader2 size={18} className="animate-spin" /> : <KeyRound size={18} />} Réinitialiser
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 600 }}>Supprimer ce membre</div>
                <p className="form-help">
                  {estSoiMeme
                    ? 'Vous ne pouvez pas supprimer votre propre compte.'
                    : "Supprime définitivement la fiche et le compte de connexion. Impossible si le membre a un historique : passez-le alors en « Inactif »."}
                </p>
              </div>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={actionEnCours !== null || estSoiMeme}>
                {actionEnCours === 'delete' ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />} Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
