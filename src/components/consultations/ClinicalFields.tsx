'use client';

import { useState } from 'react';

// =====================================================
// Champs cliniques partagés entre la création et la modification
// d'une consultation (constantes vitales + évaluation clinique).
// =====================================================

export type ClinicalDefaults = {
  constantes?: Record<string, any> | null;
  motif?: string;
  anamnese?: string | null;
  examen_physique?: { texte?: string } | null;
  diagnostic_principal?: string | null;
  plan_traitement?: string | null;
  notes_privees?: string | null;
  statut?: string;
};

const CONSTANTES = [
  { name: 'poids', label: 'Poids', unit: 'kg', placeholder: '72' },
  { name: 'taille', label: 'Taille', unit: 'cm', placeholder: '175' },
  { name: 'temperature', label: 'Température', unit: '°C', placeholder: '37,5' },
  { name: 'tension', label: 'Tension artérielle', unit: 'mmHg', placeholder: '120/80' },
  { name: 'pouls', label: 'Pouls', unit: 'bpm', placeholder: '80' },
  { name: 'saturation_o2', label: 'Saturation O₂', unit: '%', placeholder: '98' },
];

/** Lit les champs du formulaire et construit l'objet à enregistrer. */
export function readClinicalForm(formData: FormData) {
  const constantes: Record<string, string> = {};
  CONSTANTES.forEach((c) => {
    const v = ((formData.get(c.name) as string) || '').trim().replace(',', '.');
    if (v) constantes[c.name] = v;
  });
  const examen = ((formData.get('examen_physique') as string) || '').trim();
  return {
    constantes,
    motif: (formData.get('motif') as string).trim(),
    anamnese: ((formData.get('anamnese') as string) || '').trim() || null,
    examen_physique: examen ? { texte: examen } : null,
    diagnostic_principal: ((formData.get('diagnostic_principal') as string) || '').trim() || null,
    plan_traitement: ((formData.get('plan_traitement') as string) || '').trim() || null,
    notes_privees: ((formData.get('notes') as string) || '').trim() || null,
    statut: (formData.get('statut') as string) || 'terminée',
  };
}

export default function ClinicalFields({ defaults = {}, allowCancel = false }: { defaults?: ClinicalDefaults; allowCancel?: boolean }) {
  const c = defaults.constantes || {};
  const [poids, setPoids] = useState<string>(c.poids ? String(c.poids) : '');
  const [taille, setTaille] = useState<string>(c.taille ? String(c.taille) : '');

  const p = parseFloat(poids.replace(',', '.'));
  const t = parseFloat(taille.replace(',', '.')) / 100;
  const imc = p > 0 && t > 0 ? p / (t * t) : null;
  const imcLabel = imc === null ? '' : imc < 18.5 ? 'Maigreur' : imc < 25 ? 'Normal' : imc < 30 ? 'Surpoids' : 'Obésité';

  const tensionDefault = c.tension || (c.tension_systolique ? `${c.tension_systolique}/${c.tension_diastolique || ''}` : '');

  return (
    <>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">Constantes vitales</span>
          {imc !== null && (
            <span className={`badge ${imcLabel === 'Normal' ? 'badge-success' : 'badge-warning'}`}>
              IMC {imc.toFixed(1).replace('.', ',')} — {imcLabel}
            </span>
          )}
        </div>
        <div className="card-body">
          <div className="form-row">
            {CONSTANTES.map((k) => (
              <div className="form-group" key={k.name}>
                <label className="form-label">{k.label} ({k.unit})</label>
                <input
                  type="text"
                  name={k.name}
                  className="form-input"
                  placeholder={k.placeholder}
                  inputMode={k.name === 'tension' ? 'text' : 'decimal'}
                  defaultValue={k.name === 'tension' ? tensionDefault : (c[k.name] ?? '')}
                  onChange={k.name === 'poids' ? (e) => setPoids(e.target.value) : k.name === 'taille' ? (e) => setTaille(e.target.value) : undefined}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><span className="card-title">Évaluation clinique</span></div>
        <div className="card-body">
          <div className="form-group">
            <label className="form-label">Motif de consultation *</label>
            <input type="text" name="motif" className="form-input" required defaultValue={defaults.motif || ''} placeholder="Symptôme principal..." />
          </div>

          <div className="form-group">
            <label className="form-label">Anamnèse (histoire de la maladie, antécédents récents)</label>
            <textarea name="anamnese" className="form-textarea" rows={3} defaultValue={defaults.anamnese || ''} placeholder="Début des symptômes, évolution, traitements déjà pris..."></textarea>
          </div>

          <div className="form-group">
            <label className="form-label">Examen physique</label>
            <textarea name="examen_physique" className="form-textarea" rows={3} defaultValue={defaults.examen_physique?.texte || ''} placeholder="État général, examen cardio-pulmonaire, abdominal, neurologique..."></textarea>
          </div>

          <div className="form-group">
            <label className="form-label">Diagnostic principal</label>
            <input type="text" name="diagnostic_principal" className="form-input" defaultValue={defaults.diagnostic_principal || ''} placeholder="Maladie ou affection diagnostiquée (ou code CIM-10)" />
          </div>

          <div className="form-group">
            <label className="form-label">Conduite à tenir / plan de traitement</label>
            <textarea name="plan_traitement" className="form-textarea" rows={3} defaultValue={defaults.plan_traitement || ''} placeholder="Examens complémentaires, traitement, conseils, date de contrôle..."></textarea>
          </div>

          <div className="form-group">
            <label className="form-label">Notes privées du médecin</label>
            <textarea name="notes" className="form-textarea" rows={3} defaultValue={defaults.notes_privees || ''} placeholder="Notes visibles uniquement par l'équipe soignante"></textarea>
          </div>

          <div className="form-group">
            <label className="form-label">Statut de la consultation</label>
            <select name="statut" className="form-select" defaultValue={defaults.statut || 'terminée'}>
              <option value="en_cours">En cours (en attente d&apos;examens)</option>
              <option value="terminée">Terminée</option>
              {allowCancel && <option value="annulée">Annulée</option>}
            </select>
          </div>
        </div>
      </div>
    </>
  );
}
