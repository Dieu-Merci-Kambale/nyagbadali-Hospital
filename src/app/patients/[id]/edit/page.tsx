'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';
import type { Patient } from '@/types';

export default function EditPatientPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [patient, setPatient] = useState<Partial<Patient>>({});
  const { confirm } = useConfirm();

  // Charger les données du patient
  useEffect(() => {
    async function fetchPatient() {
      if (!id) return;
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('id', id)
        .single();
        
      if (error) {
        console.error('Erreur lors du chargement:', error);
        setErrorMsg('Impossible de charger le dossier du patient.');
      } else if (data) {
        setPatient(data);
      }
      setLoading(false);
    }
    
    fetchPatient();
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setPatient(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const isConfirmed = await confirm({
      title: 'Modifier le patient',
      message: 'Confirmez-vous la modification de ce dossier patient ?',
      confirmText: 'Oui, modifier',
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
      statut: formData.get('statut') as string || 'actif'
    };

    const { error } = await supabase
      .from('patients')
      .update(data)
      .eq('id', id);

    if (error) {
      console.error('Error updating patient:', error);
      setErrorMsg(error.message);
      setSaving(false);
    } else {
      // Redirection vers la liste
      router.push('/patients');
      router.refresh();
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, gap: 12 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
        <span style={{ fontWeight: 500, color: 'var(--neutral-500)' }}>Chargement des données du patient...</span>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/patients" className="btn btn-ghost" title="Retour">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="page-title">Modifier le Patient</h1>
            <p className="page-subtitle">Mise à jour du dossier {patient.code_patient}</p>
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
                <input type="text" name="nom" className="form-input" id="nom" required value={patient.nom || ''} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="prenom">Prénom *</label>
                <input type="text" name="prenom" className="form-input" id="prenom" required value={patient.prenom || ''} onChange={handleChange} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="date_naissance">Date de Naissance *</label>
                <input type="date" name="date_naissance" className="form-input" id="date_naissance" required value={patient.date_naissance || ''} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="sexe">Sexe *</label>
                <select className="form-select" name="sexe" id="sexe" required value={patient.sexe || ''} onChange={handleChange}>
                  <option value="">Sélectionner...</option>
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="groupe_sanguin">Groupe Sanguin</label>
                <select className="form-select" name="groupe_sanguin" id="groupe_sanguin" value={patient.groupe_sanguin || ''} onChange={handleChange}>
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
                <input type="tel" name="telephone" className="form-input" id="telephone" value={patient.telephone || ''} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="email">Email</label>
                <input type="email" name="email" className="form-input" id="email" value={patient.email || ''} onChange={handleChange} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="adresse">Adresse</label>
              <textarea name="adresse" className="form-textarea" id="adresse" rows={2} value={patient.adresse || ''} onChange={handleChange} />
            </div>
          </div>
        </div>

        {/* Assurance */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">🛡️ Assurance Maladie & Statut</span>
          </div>
          <div className="card-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="assureur">Assureur</label>
                <select className="form-select" name="assureur" id="assureur" value={patient.assureur || ''} onChange={handleChange}>
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
                <input type="text" name="numero_assurance" className="form-input" id="numero_assurance" value={patient.numero_assurance || ''} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="statut">Statut du dossier</label>
                <select className="form-select" name="statut" id="statut" value={patient.statut || ''} onChange={handleChange}>
                  <option value="actif">Actif</option>
                  <option value="inactif">Inactif</option>
                  <option value="décédé">Décédé</option>
                </select>
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
                <input type="text" name="contact_urgence_nom" className="form-input" id="contact_urgence_nom" value={patient.contact_urgence_nom || ''} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="contact_urgence_tel">Téléphone</label>
                <input type="tel" name="contact_urgence_tel" className="form-input" id="contact_urgence_tel" value={patient.contact_urgence_tel || ''} onChange={handleChange} />
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Link href="/patients" className="btn btn-outline">
            Annuler
          </Link>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? (
              <><Loader2 size={18} className="animate-spin" style={{ marginRight: 8 }} /> Enregistrement...</>
            ) : (
              <><Save size={18} style={{ marginRight: 8 }} /> Mettre à jour le Patient</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
