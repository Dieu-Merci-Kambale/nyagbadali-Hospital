'use client';

import { useEffect, useState } from 'react';
import { KeyRound, Loader2, Save, ShieldCheck, User, Mail, Phone, Building2, BadgeCheck, Eye, EyeOff } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { roleLabels, getAccessibleModules } from '@/lib/role-permissions';
import { formatDate } from '@/lib/format';

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Tableau de bord', patients: 'Patients', 'rendez-vous': 'Rendez-vous', consultations: 'Consultations',
  hospitalisation: 'Hospitalisation', chambres: 'Chambres & lits', pharmacie: 'Pharmacie', laboratoire: 'Laboratoire',
  personnel: 'Personnel', facturation: 'Facturation', departements: 'Départements', rapports: 'Rapports', audit: "Journal d'activité",
};

export default function ProfilPage() {
  const { profile, user } = useAuth();
  const [details, setDetails] = useState<any>(null);
  const [telephone, setTelephone] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);

  const [current, setCurrent] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    if (!profile) return;
    supabase.from('personnel').select('*').eq('id', profile.id).single().then(({ data }) => {
      if (data) {
        setDetails(data);
        setTelephone(data.telephone || '');
      }
    });
  }, [profile]);

  if (!profile) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>;
  }

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingInfo(true);
    const { error } = await supabase.from('personnel').update({ telephone: telephone.trim() || null }).eq('id', profile.id);
    setSavingInfo(false);
    if (error) toast.error(error.message);
    else toast.success('Coordonnées mises à jour.');
  };

  const strength = (() => {
    let s = 0;
    if (nouveau.length >= 8) s++;
    if (/[A-Z]/.test(nouveau) && /[a-z]/.test(nouveau)) s++;
    if (/\d/.test(nouveau)) s++;
    if (/[^A-Za-z0-9]/.test(nouveau)) s++;
    return s;
  })();
  const strengthLabel = ['Très faible', 'Faible', 'Moyen', 'Bon', 'Excellent'][strength];
  const strengthColor = ['var(--danger)', 'var(--danger)', 'var(--warning)', 'var(--success)', 'var(--success)'][strength];

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nouveau.length < 8) {
      toast.error('Le nouveau mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (nouveau !== confirmation) {
      toast.error('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }
    if (nouveau === current) {
      toast.error("Le nouveau mot de passe doit être différent de l'actuel.");
      return;
    }
    setSavingPwd(true);
    // Vérification du mot de passe actuel
    const { error: authError } = await supabase.auth.signInWithPassword({ email: user?.email || profile.email, password: current });
    if (authError) {
      setSavingPwd(false);
      toast.error('Mot de passe actuel incorrect.');
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: nouveau });
    setSavingPwd(false);
    if (error) {
      toast.error(`Échec du changement : ${error.message}`);
      return;
    }
    setCurrent('');
    setNouveau('');
    setConfirmation('');
    toast.success('Mot de passe modifié avec succès.');
  };

  const modules = getAccessibleModules(profile.role).filter((m) => m !== 'profil');

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Mon profil</h1>
          <p className="page-subtitle">Informations du compte et sécurité</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div className="avatar avatar-xl avatar-blue">{profile.prenom[0]}{profile.nom[0]}</div>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700 }}>{profile.role.startsWith('medecin') ? 'Dr. ' : ''}{profile.prenom} {profile.nom}</h2>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <span className="badge badge-info">{roleLabels[profile.role]}</span>
                  <span className="badge badge-neutral" style={{ fontFamily: 'monospace' }}>{profile.code_personnel}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title"><User size={16} /> Informations</span></div>
            <form className="card-body" onSubmit={handleSaveInfo}>
              <div className="info-list" style={{ marginBottom: 16 }}>
                <div className="info-row">
                  <div className="info-icon"><Mail size={16} /></div>
                  <div className="info-copy"><div className="info-label">Email (identifiant)</div><div className="info-value">{profile.email}</div></div>
                </div>
                <div className="info-row">
                  <div className="info-icon"><Building2 size={16} /></div>
                  <div className="info-copy"><div className="info-label">Département</div><div className="info-value">{profile.departement_nom || 'Non affecté'}</div></div>
                </div>
                {profile.specialite && (
                  <div className="info-row">
                    <div className="info-icon"><BadgeCheck size={16} /></div>
                    <div className="info-copy"><div className="info-label">Spécialité</div><div className="info-value">{profile.specialite}</div></div>
                  </div>
                )}
                {details?.date_embauche && (
                  <div className="info-row">
                    <div className="info-icon"><User size={16} /></div>
                    <div className="info-copy"><div className="info-label">Membre depuis</div><div className="info-value">{formatDate(details.date_embauche)}</div></div>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label"><Phone size={13} style={{ display: 'inline', verticalAlign: 'middle' }} /> Téléphone</label>
                <input className="form-input" value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="+243 XX XXX XXXX" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary" disabled={savingInfo}>
                  {savingInfo ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Enregistrer
                </button>
              </div>
            </form>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title"><ShieldCheck size={16} /> Mes accès</span></div>
            <div className="card-body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {modules.map((m) => <span key={m} className="badge badge-success">{MODULE_LABELS[m] || m}</span>)}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title"><KeyRound size={16} /> Changer mon mot de passe</span></div>
          <form className="card-body" onSubmit={handleChangePassword}>
            <div className="form-group">
              <label className="form-label">Mot de passe actuel *</label>
              <input type={showPwd ? 'text' : 'password'} className="form-input" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
            </div>
            <div className="form-group">
              <label className="form-label">Nouveau mot de passe *</label>
              <input type={showPwd ? 'text' : 'password'} className="form-input" value={nouveau} onChange={(e) => setNouveau(e.target.value)} required minLength={8} autoComplete="new-password" />
              {nouveau && (
                <div style={{ marginTop: 8 }}>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${(strength / 4) * 100}%`, background: strengthColor }} /></div>
                  <div style={{ fontSize: 12, marginTop: 4, color: strengthColor, fontWeight: 600 }}>{strengthLabel}</div>
                </div>
              )}
              <p className="form-help">Au moins 8 caractères. Mélangez majuscules, minuscules, chiffres et symboles.</p>
            </div>
            <div className="form-group">
              <label className="form-label">Confirmer le nouveau mot de passe *</label>
              <input type={showPwd ? 'text' : 'password'} className="form-input" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required autoComplete="new-password" />
              {confirmation && confirmation !== nouveau && <p className="form-help" style={{ color: 'var(--danger)' }}>Les mots de passe ne correspondent pas.</p>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPwd((v) => !v)}>
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />} {showPwd ? 'Masquer' : 'Afficher'}
              </button>
              <button type="submit" className="btn btn-primary" disabled={savingPwd}>
                {savingPwd ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} Mettre à jour
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
