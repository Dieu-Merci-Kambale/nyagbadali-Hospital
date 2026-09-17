'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2, BedDouble, User, FileText, Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function EditHospitalisationPage() {
  const router = useRouter();
  const { id } = useParams();
  const { confirm } = useConfirm();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [hosp, setHosp] = useState<any>(null);
  const [medecins, setMedecins] = useState<any[]>([]);

  useEffect(() => {
    async function fetchData() {
      if (!id) return;

      const { data: hospData, error } = await supabase
        .from('hospitalisations')
        .select(`
          *,
          patients(*),
          lits(id, numero, type_lit, chambres(numero, etage, type)),
          medecin:personnel(id, nom, prenom)
        `)
        .eq('id', id)
        .single();

      const { data: mData } = await supabase
        .from('personnel')
        .select('id, nom, prenom')
        .in('role', ['medecin', 'medecin_chef'])
        .order('nom');

      if (error) {
        setErrorMsg('Dossier d\'hospitalisation introuvable.');
      } else {
        setHosp(hospData);
        setMedecins(mData || []);
      }
      setLoading(false);
    }
    fetchData();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const formData = new FormData(e.currentTarget);
    const newStatut = formData.get('statut') as string;
    const isSortie = newStatut !== 'actif'; // Si ce n'est plus actif, le lit sera libéré

    let confirmMsg = 'Confirmez-vous la mise à jour de ce dossier d\'hospitalisation ?';
    if (isSortie && hosp.statut === 'actif') {
      confirmMsg = `Vous êtes sur le point de marquer ce patient comme "${newStatut}". Son lit (${hosp.lits?.numero}) sera automatiquement libéré. Continuer ?`;
    }

    const isConfirmed = await confirm({
      title: isSortie ? 'Décharge / Sortie du patient' : 'Mettre à jour le dossier',
      message: confirmMsg,
      confirmText: 'Oui, confirmer',
      type: isSortie ? 'warning' : 'info'
    });

    if (!isConfirmed) return;

    setSaving(true);
    setErrorMsg('');

    const data: any = {
      medecin_responsable_id: formData.get('medecin_responsable_id') as string || null,
      motif_admission: formData.get('motif_admission') as string,
      diagnostic_entree: formData.get('diagnostic_entree') as string || null,
      diagnostic_sortie: formData.get('diagnostic_sortie') as string || null,
      resume_sortie: formData.get('resume_sortie') as string || null,
      statut: newStatut
    };

    if (isSortie && !hosp.date_sortie) {
      data.date_sortie = new Date().toISOString();
    }

    // 1. Mettre à jour l'hospitalisation
    const { error: hospError } = await supabase
      .from('hospitalisations')
      .update(data)
      .eq('id', id);

    if (hospError) {
      console.error(hospError);
      setErrorMsg(hospError.message);
      setSaving(false);
      return;
    }

    // 2. Si sortie, libérer le lit
    if (isSortie && hosp.statut === 'actif' && hosp.lit_id) {
      const { error: litError } = await supabase
        .from('lits')
        .update({ statut: 'disponible' })
        .eq('id', hosp.lit_id);
        
      if (litError) {
        console.error("Erreur lors de la libération du lit", litError);
        // On ne bloque pas pour ça, mais en prod on loggerait ça
      }
    }

    router.push('/hospitalisation');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Loader2 size={24} className="animate-spin text-primary-500" />
      </div>
    );
  }

  if (!hosp) {
    return (
      <div className="empty-state">
        <AlertCircle style={{ color: 'var(--danger)' }} />
        <h3>Dossier introuvable</h3>
        <p>{errorMsg}</p>
        <button className="btn btn-outline" onClick={() => router.push('/hospitalisation')}>Retour</button>
      </div>
    );
  }

  const isReadOnly = hosp.statut !== 'actif';

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.back()} className="btn btn-ghost" title="Retour">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">Dossier d'Hospitalisation</h1>
            <p className="page-subtitle">
              {hosp.patients?.prenom} {hosp.patients?.nom} • {hosp.patients?.code_patient}
            </p>
          </div>
        </div>
        {hosp.statut === 'actif' ? (
          <span className="badge badge-success">Interné (Actif)</span>
        ) : (
          <span className="badge badge-neutral">Archivé ({hosp.statut})</span>
        )}
      </div>

      {errorMsg && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <AlertCircle size={18} /> {errorMsg}
        </div>
      )}

      {/* Résumé d'en-tête */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 24 }}>
        <div className="stat-card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ padding: 10, backgroundColor: 'var(--primary-50)', color: 'var(--primary-600)', borderRadius: 8 }}>
              <User size={20} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>Patient</div>
              <div style={{ fontWeight: 600 }}>{hosp.patients?.prenom} {hosp.patients?.nom}</div>
              <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>Sexe: {hosp.patients?.sexe} • Grp: {hosp.patients?.groupe_sanguin || '?'}</div>
            </div>
          </div>
        </div>
        <div className="stat-card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ padding: 10, backgroundColor: 'var(--warning-50)', color: 'var(--warning-600)', borderRadius: 8 }}>
              <BedDouble size={20} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>Assignation du Lit</div>
              {hosp.lits ? (
                <>
                  <div style={{ fontWeight: 600 }}>Ch. {hosp.lits?.chambres?.numero} - Lit {hosp.lits?.numero}</div>
                  <div style={{ fontSize: 12, color: 'var(--neutral-500)', textTransform: 'capitalize' }}>{hosp.lits?.type_lit?.replace('_', ' ')}</div>
                </>
              ) : (
                <div style={{ fontWeight: 600, color: 'var(--danger)' }}>Aucun lit assigné</div>
              )}
            </div>
          </div>
        </div>
        <div className="stat-card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ padding: 10, backgroundColor: 'var(--success-50)', color: 'var(--success-600)', borderRadius: 8 }}>
              <Calendar size={20} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>Admission</div>
              <div style={{ fontWeight: 600 }}>{format(new Date(hosp.date_admission), 'dd MMM yyyy', { locale: fr })}</div>
              <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>
                {hosp.type_admission}
              </div>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ maxWidth: 800 }}>
        {/* INFOS MEDICALES */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">Détails Médicaux</span></div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Motif de l'admission *</label>
              <textarea name="motif_admission" className="form-textarea" rows={2} required defaultValue={hosp.motif_admission} disabled={isReadOnly}></textarea>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Médecin Traitant Responsable</label>
                <select name="medecin_responsable_id" className="form-select" defaultValue={hosp.medecin_responsable_id || ''} disabled={isReadOnly}>
                  <option value="">Sélectionner un médecin</option>
                  {medecins.map(m => (
                    <option key={m.id} value={m.id}>Dr. {m.prenom} {m.nom}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Diagnostic d'entrée</label>
                <input type="text" name="diagnostic_entree" className="form-input" defaultValue={hosp.diagnostic_entree || ''} disabled={isReadOnly} />
              </div>
            </div>
          </div>
        </div>

        {/* SORTIE */}
        <div className="card" style={{ marginBottom: 24, border: '1px solid var(--primary-200)' }}>
          <div className="card-header" style={{ backgroundColor: 'var(--primary-50)' }}>
            <span className="card-title" style={{ color: 'var(--primary-700)' }}>Statut et Décharge</span>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Statut Actuel du Dossier *</label>
              <select name="statut" className="form-select" defaultValue={hosp.statut} disabled={isReadOnly} style={{ fontSize: 16, fontWeight: 600, padding: 12 }}>
                <option value="actif">Actif (Patient interné)</option>
                <option value="sorti">Sorti (Guéri / Décharge standard)</option>
                <option value="transféré">Transféré (Vers un autre hôpital)</option>
                <option value="décédé">Décédé</option>
              </select>
              <p className="form-help" style={{ marginTop: 8 }}>
                Si vous changez le statut sur autre chose que "Actif", le lit du patient sera libéré pour le prochain patient.
              </p>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Diagnostic de sortie (Si décharge)</label>
                <input type="text" name="diagnostic_sortie" className="form-input" defaultValue={hosp.diagnostic_sortie || ''} disabled={isReadOnly} />
              </div>
            </div>
            
            <div className="form-group">
              <label className="form-label">Résumé de sortie / Notes de décharge</label>
              <textarea name="resume_sortie" className="form-textarea" rows={4} defaultValue={hosp.resume_sortie || ''} disabled={isReadOnly} placeholder="Instructions de sortie, traitement prescrit, recommandations..."></textarea>
            </div>
          </div>
        </div>

        {!isReadOnly && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button type="button" onClick={() => router.back()} className="btn btn-outline">Annuler</button>
            <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Mettre à jour et Sauvegarder
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
