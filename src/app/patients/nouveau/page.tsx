'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';
import AdminGuard from '@/components/AdminGuard';
import { canManagePatients } from '@/lib/role-permissions';
import type { RolePersonnel } from '@/types';
import { ETATS_CIVILS } from '@/lib/format';
import AssureurSelect from '@/components/assurances/AssureurSelect';

export default function NouveauPatientPage() {
  return (
    <AdminGuard
      allowed={(r) => canManagePatients(r as RolePersonnel)}
      reservedTo="au personnel d'accueil, au personnel soignant et à l'administration"
      operations="l'enregistrement et la modification des dossiers patients"
      backHref="/patients"
      backLabel="Retour aux patients"
    >
      <NouveauPatientForm />
    </AdminGuard>
  );
}

function NouveauPatientForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  // Assureur enregistré par l'administration (seuls ceux-ci sont proposés)
  const [assureurId, setAssureurId] = useState('');
  const { confirm } = useConfirm();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const isConfirmed = await confirm({
      title: 'Enregistrer le patient',
      message: 'Voulez-vous vraiment enregistrer ce nouveau dossier patient ?',
      confirmText: 'Oui, enregistrer',
      type: 'info'
    });

    if (!isConfirmed) return;

    setSaving(true);
    setErrorMsg('');
    
    try {
      
      const data = {
        code_patient: `PAT-${Date.now().toString().slice(-6)}`,
        nom: formData.get('nom') as string,
        prenom: formData.get('prenom') as string,
        date_naissance: formData.get('date_naissance') as string,
        sexe: formData.get('sexe') as 'M' | 'F',
        groupe_sanguin: (formData.get('groupe_sanguin') as string) || null,
        telephone: (formData.get('telephone') as string) || null,
        email: (formData.get('email') as string) || null,
        adresse: (formData.get('adresse') as string) || null,
        numero_assurance: assureurId ? ((formData.get('numero_assurance') as string) || null) : null,
        contact_urgence_nom: (formData.get('contact_urgence_nom') as string) || null,
        contact_urgence_tel: (formData.get('contact_urgence_tel') as string) || null,
        statut: 'actif'
      } as Record<string, unknown>;

      // Rubriques facultatives : envoyées seulement si renseignées
      const profession = ((formData.get('profession') as string) || '').trim();
      const etatCivil = (formData.get('etat_civil') as string) || '';
      if (profession) data.profession = profession;
      if (etatCivil) data.etat_civil = etatCivil;
      // Le nom de l'assureur est repris automatiquement par la base
      if (assureurId) data.assureur_id = assureurId;

      const { data: created, error } = await supabase.from('patients').insert([data]).select('id').single();

      if (error) {
        throw error;
      }

      router.push(created ? `/patients/${created.id}` : '/patients');
    } catch (err: any) {
      console.error('Error saving patient:', err);
      setErrorMsg(err.message || 'Une erreur inattendue est survenue.');
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/patients" className="btn btn-ghost" title="Retour">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="page-title">Nouveau Patient</h1>
            <p className="page-subtitle">Enregistrement d&apos;un nouveau dossier patient</p>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div style={{ 
          background: '#fee2e2', 
          color: '#b91c1c', 
          padding: '12px 16px', 
          borderRadius: 'var(--radius-sm)', 
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
          <AlertCircle size={18} />
          <span style={{ fontWeight: 500 }}>Erreur:</span> {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Informations Personnelles */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">👤 Informations Personnelles</span>
          </div>
          <div className="card-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="nom">Nom *</label>
                <input type="text" name="nom" className="form-input" id="nom" placeholder="Nom de famille" required />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="prenom">Prénom *</label>
                <input type="text" name="prenom" className="form-input" id="prenom" placeholder="Prénom" required />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="date_naissance">Date de Naissance *</label>
                <input type="date" name="date_naissance" className="form-input" id="date_naissance" required />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="sexe">Sexe *</label>
                <select className="form-select" name="sexe" id="sexe" required>
                  <option value="">Sélectionner...</option>
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="groupe_sanguin">Groupe Sanguin</label>
                <select className="form-select" name="groupe_sanguin" id="groupe_sanguin">
                  <option value="">Inconnu</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="profession">Profession</label>
                <input type="text" name="profession" className="form-input" id="profession" maxLength={100} placeholder="Ex : Enseignant, commerçante..." />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="etat_civil">État civil</label>
                <select className="form-select" name="etat_civil" id="etat_civil" defaultValue="">
                  <option value="">Non renseigné</option>
                  {Object.entries(ETATS_CIVILS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Coordonnées */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">📞 Coordonnées</span>
          </div>
          <div className="card-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="telephone">Téléphone</label>
                <input type="tel" name="telephone" className="form-input" id="telephone" placeholder="+243 XX XXX XXXX" />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="email">Email</label>
                <input type="email" name="email" className="form-input" id="email" placeholder="email@example.com" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="adresse">Adresse</label>
              <textarea name="adresse" className="form-textarea" id="adresse" placeholder="Adresse complète..." rows={2} />
            </div>
          </div>
        </div>

        {/* Assurance */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">🛡️ Assurance Maladie</span>
          </div>
          <div className="card-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="assureur_id">Assureur</label>
                <AssureurSelect value={assureurId} onChange={(id) => setAssureurId(id)} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="numero_assurance">Numéro de Police</label>
                <input type="text" name="numero_assurance" className="form-input" id="numero_assurance" placeholder="ASS-XXXXXX" disabled={!assureurId} />
              </div>
            </div>
          </div>
        </div>

        {/* Contact d'urgence */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title">🚨 Contact d&apos;Urgence</span>
          </div>
          <div className="card-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="contact_urgence_nom">Nom du Contact</label>
                <input type="text" name="contact_urgence_nom" className="form-input" id="contact_urgence_nom" placeholder="Nom complet" />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="contact_urgence_tel">Téléphone</label>
                <input type="tel" name="contact_urgence_tel" className="form-input" id="contact_urgence_tel" placeholder="+243 XX XXX XXXX" />
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Link href="/patients" className="btn btn-outline">
            Annuler
          </Link>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving} id="btn-save-patient">
            {saving ? (
              <>Enregistrement en cours...</>
            ) : (
              <><Save size={18} /> Enregistrer le Patient</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
