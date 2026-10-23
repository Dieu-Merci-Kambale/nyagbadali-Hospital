'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// =====================================================
// Allergies et antécédents, demandés au patient pendant la consultation.
// Les valeurs sont conservées sur la fiche patient (patients.allergies /
// patients.antecedents) afin d'être reprises aux consultations suivantes
// et affichées en alerte (admissions, laboratoire...).
// =====================================================

/**
 * Lit les champs du formulaire et renvoie la mise à jour à appliquer à la fiche
 * patient, ou null si rien n'a changé (ou si les champs ne sont pas affichés).
 */
export function readMedicalHistoryForm(formData: FormData) {
  if (formData.get('allergies') === null) return null;
  const allergies = ((formData.get('allergies') as string) || '').trim();
  const antecedents = ((formData.get('antecedents') as string) || '').trim();
  const changed =
    allergies !== ((formData.get('allergies_initial') as string) || '') ||
    antecedents !== ((formData.get('antecedents_initial') as string) || '');
  return changed ? { allergies: allergies || null, antecedents: antecedents || null } : null;
}

export default function MedicalHistoryFields({ patientId }: { patientId?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [initial, setInitial] = useState({ allergies: '', antecedents: '' });
  const [allergies, setAllergies] = useState('');
  const [antecedents, setAntecedents] = useState('');

  useEffect(() => {
    if (!patientId) return;
    let ignore = false;
    supabase.from('patients').select('allergies, antecedents').eq('id', patientId).single().then(({ data, error }) => {
      if (ignore) return;
      // En cas d'échec de lecture, les champs restent saisissables (valeurs vides)
      if (error) console.error('Lecture allergies/antécédents :', error);
      const values = { allergies: (data?.allergies || '').trim(), antecedents: (data?.antecedents || '').trim() };
      setInitial(values);
      setAllergies(values.allergies);
      setAntecedents(values.antecedents);
      setLoaded(true);
    });
    return () => { ignore = true; };
  }, [patientId]);

  // Champs désactivés (donc non envoyés) tant que le patient n'est pas choisi et chargé
  const disabled = !patientId || !loaded;

  return (
    <div className="form-group">
      <input type="hidden" name="allergies_initial" value={initial.allergies} />
      <input type="hidden" name="antecedents_initial" value={initial.antecedents} />
      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="allergies">
            Allergies connues
            {allergies.trim() && (
              <span className="badge badge-danger" style={{ marginLeft: 8 }}><AlertTriangle size={12} /> Allergie signalée</span>
            )}
          </label>
          <textarea name="allergies" id="allergies" className="form-textarea" rows={2} placeholder={patientId ? 'Ex : Pénicilline, arachide, iode... (laisser vide si aucune)' : 'Choisissez d’abord le patient'} disabled={disabled} value={allergies} onChange={(e) => setAllergies(e.target.value)}></textarea>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="antecedents">Antécédents médicaux et chirurgicaux</label>
          <textarea name="antecedents" id="antecedents" className="form-textarea" rows={2} placeholder={patientId ? 'Ex : HTA, diabète de type 2, appendicectomie (2019)...' : 'Choisissez d’abord le patient'} disabled={disabled} value={antecedents} onChange={(e) => setAntecedents(e.target.value)}></textarea>
        </div>
      </div>
      <p className="form-help">Enregistrés dans le dossier du patient : repris aux consultations suivantes et affichés en alerte lors des admissions et examens.</p>
    </div>
  );
}
