'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';

export default function NouveauPatientPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const { confirm } = useConfirm();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const isConfirmed = await confirm({
      title: 'Enregistrer le patient',
      message: 'Voulez-vous vraiment enregistrer ce nouveau dossier patient ?',
      confirmText: 'Oui, enregistrer',
      type: 'info'
    });

    if (!isConfirmed) return;

    setSaving(true);
    setErrorMsg('');
    
    const formData = new FormData(e.currentTarget);
    
    const data = {
      nom: formData.get('nom') as string,
      prenom: formData.get('prenom') as string,
      date_naissance: formData.get('date_naissance') as string,
      sexe: formData.get('sexe') as 'M' | 'F',
      groupe_sanguin: (formData.get('groupe_sanguin') as string) || null,
      telephone: (formData.get('telephone') as string) || null,
      email: (formData.get('email') as string) || null,
      adresse: (formData.get('adresse') as string) || null,
      assureur: (formData.get('assureur') as string) || null,
      numero_assurance: (formData.get('numero_assurance') as string) || null,
      contact_urgence_nom: (formData.get('contact_urgence_nom') as string) || null,
      contact_urgence_tel: (formData.get('contact_urgence_tel') as string) || null,
      statut: 'actif'
    };

    const { error } = await supabase.from('patients').insert([data]);

    if (error) {
      console.error('Error saving patient:', error);
      setErrorMsg(error.message);
      setSaving(false);
    } else {
      router.push('/patients');
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
                <label className="form-label" htmlFor="assureur">Assureur</label>
                <select className="form-select" name="assureur" id="assureur">
                  <option value="">Pas d&apos;assurance</option>
                  <option value="SONAS">SONAS</option>
                  <option value="Rawsur">Rawsur</option>
                  <option value="Activa">Activa</option>
                  <option value="SANLAM">SANLAM</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="numero_assurance">Numéro de Police</label>
                <input type="text" name="numero_assurance" className="form-input" id="numero_assurance" placeholder="ASS-XXXXXX" />
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
