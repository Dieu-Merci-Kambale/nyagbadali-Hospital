'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  Save, 
  User, 
  Mail, 
  Phone, 
  Lock, 
  Briefcase,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';
import { roleLabels } from '@/lib/role-permissions';
import { createPersonnelAction } from '@/app/actions/personnel';

export default function NouveauPersonnelPage() {
  const router = useRouter();
  const { confirm } = useConfirm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [departements, setDepartements] = useState<any[]>([]);

  // Champs du formulaire
  const [formData, setFormData] = useState({
    prenom: '',
    nom: '',
    sexe: 'M',
    telephone: '',
    email: '',
    password: '',
    role: 'medecin',
    specialite: '',
    departement_id: '',
  });

  useEffect(() => {
    async function fetchDepartements() {
      const { data } = await supabase.from('departements').select('id, nom').order('nom');
      if (data) setDepartements(data);
    }
    fetchDepartements();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (formData.password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    const isConfirmed = await confirm({
      title: 'Ajouter un membre du personnel',
      message: 'Voulez-vous vraiment enregistrer ce nouveau profil ?',
      confirmText: 'Oui, ajouter',
      type: 'info'
    });

    if (!isConfirmed) return;

    setLoading(true);

    const formDataObj = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      formDataObj.append(key, value);
    });

    const result = await createPersonnelAction(formDataObj);

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      router.push('/personnel');
      router.refresh();
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <button 
          onClick={() => router.back()} 
          className="btn btn-outline"
          style={{ padding: '8px', borderRadius: '50%' }}
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>Ajouter un membre</h1>
          <p className="page-subtitle">Créer un nouveau profil personnel et accès système</p>
        </div>
      </div>

      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          color: 'var(--danger)',
          padding: '12px 16px',
          borderRadius: 8,
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 14,
          fontWeight: 500,
        }}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card">
        <div className="card-header">
          <span className="card-title">
            <User size={18} className="text-primary-500" /> Informations Personnelles
          </span>
        </div>
        <div className="card-body">
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Prénom <span className="text-danger">*</span></label>
              <input 
                type="text" 
                name="prenom" 
                className="form-input" 
                required 
                value={formData.prenom} 
                onChange={handleChange} 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Nom <span className="text-danger">*</span></label>
              <input 
                type="text" 
                name="nom" 
                className="form-input" 
                required 
                value={formData.nom} 
                onChange={handleChange} 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Sexe <span className="text-danger">*</span></label>
              <select 
                name="sexe" 
                className="form-select" 
                required 
                value={formData.sexe} 
                onChange={handleChange}
              >
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Téléphone</label>
              <div style={{ position: 'relative' }}>
                <Phone size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--neutral-400)' }} />
                <input 
                  type="tel" 
                  name="telephone" 
                  className="form-input" 
                  style={{ paddingLeft: 36 }}
                  value={formData.telephone} 
                  onChange={handleChange} 
                />
              </div>
            </div>
          </div>
        </div>

        <div className="card-header" style={{ borderTop: '1px solid var(--neutral-100)' }}>
          <span className="card-title">
            <Briefcase size={18} className="text-primary-500" /> Informations Professionnelles
          </span>
        </div>
        <div className="card-body">
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Rôle (Accès Système) <span className="text-danger">*</span></label>
              <select 
                name="role" 
                className="form-select" 
                required 
                value={formData.role} 
                onChange={handleChange}
              >
                {Object.entries(roleLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Département</label>
              <select 
                name="departement_id" 
                className="form-select" 
                value={formData.departement_id} 
                onChange={handleChange}
              >
                <option value="">-- Aucun département --</option>
                {departements.map(d => (
                  <option key={d.id} value={d.id}>{d.nom}</option>
                ))}
              </select>
            </div>
            {(formData.role.includes('medecin') || formData.role === 'infirmier_chef') && (
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Spécialité</label>
                <select 
                  name="specialite" 
                  className="form-select" 
                  value={formData.specialite} 
                  onChange={handleChange} 
                >
                  <option value="">-- Sélectionnez une spécialité --</option>
                  <option value="Médecine Générale">Médecine Générale</option>
                  <option value="Cardiologie">Cardiologie</option>
                  <option value="Pédiatrie">Pédiatrie</option>
                  <option value="Gynécologie">Gynécologie</option>
                  <option value="Chirurgie">Chirurgie</option>
                  <option value="Neurologie">Neurologie</option>
                  <option value="Ophtalmologie">Ophtalmologie</option>
                  <option value="Dentisterie">Dentisterie</option>
                  <option value="Urgences">Urgences</option>
                  <option value="Anesthésiologie">Anesthésiologie</option>
                  <option value="Dermatologie">Dermatologie</option>
                  <option value="Orthopédie">Orthopédie</option>
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="card-header" style={{ borderTop: '1px solid var(--neutral-100)' }}>
          <span className="card-title">
            <Lock size={18} className="text-primary-500" /> Identifiants de Connexion
          </span>
        </div>
        <div className="card-body">
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Email professionnel <span className="text-danger">*</span></label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--neutral-400)' }} />
                <input 
                  type="email" 
                  name="email" 
                  className="form-input" 
                  required 
                  style={{ paddingLeft: 36 }}
                  value={formData.email} 
                  onChange={handleChange} 
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Mot de passe provisoire <span className="text-danger">*</span></label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--neutral-400)' }} />
                <input 
                  type="password" 
                  name="password" 
                  className="form-input" 
                  required 
                  minLength={6}
                  style={{ paddingLeft: 36 }}
                  value={formData.password} 
                  onChange={handleChange} 
                />
              </div>
              <span style={{ fontSize: 11, color: 'var(--neutral-400)', marginTop: 4, display: 'block' }}>
                L&apos;utilisateur pourra le modifier plus tard (min 6 caractères)
              </span>
            </div>
          </div>

          <div style={{ marginTop: 30, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button 
              type="button" 
              className="btn btn-outline" 
              onClick={() => router.back()}
              disabled={loading}
            >
              Annuler
            </button>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /> Création en cours...</>
              ) : (
                <><Save size={16} /> Enregistrer le membre</>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
