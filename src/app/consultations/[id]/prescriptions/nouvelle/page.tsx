'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, Loader2, Pill, Search, X, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/context/ConfirmContext';
import type { Medicament, Prescription } from '@/types';
import { explainDbError } from '@/lib/format';
import { estPrescriptible } from '@/lib/medicaments';

// Une ligne de l'ordonnance en cours de saisie
interface LigneOrdonnance {
  key: string;
  medicament: Medicament;
  dosage: string;
  voie_administration: Prescription['voie_administration'];
  frequence: string;
  duree: string;
  instructions: string;
}

const VOIES: { value: Prescription['voie_administration']; label: string }[] = [
  { value: 'orale', label: 'Orale' },
  { value: 'iv', label: 'Intraveineuse (IV)' },
  { value: 'im', label: 'Intramusculaire (IM)' },
  { value: 'sc', label: 'Sous-cutanée (SC)' },
  { value: 'rectale', label: 'Rectale' },
  { value: 'topique', label: 'Topique' },
  { value: 'inhalation', label: 'Inhalation' },
];

// Suggestions proposées dans les champs (saisie libre toujours possible)
const FREQUENCES = ['1 fois par jour', '2 fois par jour', '3 fois par jour', '4 fois par jour', 'Toutes les 6h', 'Toutes les 8h', 'Toutes les 12h', 'Le soir au coucher', 'Si douleur ou fièvre'];
const DUREES = ['Dose unique', '3 jours', '5 jours', '7 jours', '10 jours', '14 jours', '1 mois'];

export default function NouvellePrescriptionPage() {
  const router = useRouter();
  const { id: consultation_id } = useParams();
  const { confirm } = useConfirm();
  const searchRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [medicaments, setMedicaments] = useState<Medicament[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [lignes, setLignes] = useState<LigneOrdonnance[]>([]);

  // Médicaments disponibles à la pharmacie (seuls ceux-ci peuvent être prescrits)
  useEffect(() => {
    async function fetchMedicaments() {
      const { data, error } = await supabase
        .from('medicaments')
        .select('*')
        .order('nom_commercial', { ascending: true });

      if (!error && data) {
        setMedicaments((data as Medicament[]).filter((m) => estPrescriptible(m)));
      }
      setLoading(false);
    }
    fetchMedicaments();
  }, []);

  const dejaAjoutes = new Set(lignes.map((l) => l.medicament.id));

  const filteredMedicaments = medicaments.filter(m => {
    if (dejaAjoutes.has(m.id)) return false;
    const q = searchQuery.toLowerCase();
    return (m.nom_commercial || '').toLowerCase().includes(q) ||
           (m.nom_generique || '').toLowerCase().includes(q) ||
           (m.code || '').toLowerCase().includes(q) ||
           (m.dosage || '').toLowerCase().includes(q);
  });

  const handleAddMedicament = (med: Medicament) => {
    setLignes((prev) => [
      ...prev,
      {
        key: `${med.id}-${Date.now()}`,
        medicament: med,
        dosage: med.dosage || '',
        voie_administration: 'orale',
        frequence: '',
        duree: '',
        instructions: '',
      },
    ]);
    setErrorMsg('');
    // Prêt pour rechercher le médicament suivant
    setSearchQuery('');
    setIsDropdownOpen(false);
    searchRef.current?.focus();
  };

  const updateLigne = (key: string, champs: Partial<LigneOrdonnance>) => {
    setLignes((prev) => prev.map((l) => (l.key === key ? { ...l, ...champs } : l)));
  };

  const removeLigne = (key: string) => {
    setLignes((prev) => prev.filter((l) => l.key !== key));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (lignes.length === 0) {
      setErrorMsg('Ajoutez au moins un médicament disponible à la pharmacie.');
      return;
    }

    const noms = lignes.map((l) => l.medicament.nom_commercial).join(', ');
    const isConfirmed = await confirm({
      title: 'Valider l\'ordonnance',
      message: `Voulez-vous prescrire ${lignes.length} médicament${lignes.length > 1 ? 's' : ''} (${noms}) pour cette consultation ? L'ordonnance sera envoyée directement à la pharmacie.`,
      confirmText: 'Oui, prescrire',
      type: 'info'
    });

    if (!isConfirmed) return;

    setSaving(true);
    setErrorMsg('');

    const dataToInsert = lignes.map((l) => ({
      consultation_id,
      medicament_id: l.medicament.id,
      nom_medicament: l.medicament.nom_commercial,
      dosage: l.dosage.trim(),
      voie_administration: l.voie_administration,
      frequence: l.frequence.trim(),
      duree: l.duree.trim(),
      instructions: l.instructions.trim() || null,
      statut: 'active'
    }));

    try {
      // Une seule insertion : toutes les lignes sont enregistrées, ou aucune
      const { error } = await supabase.from('prescriptions').insert(dataToInsert);

      if (error) {
        throw error;
      }
      router.push(`/consultations/${consultation_id}`);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(explainDbError(err) || 'Une erreur inattendue est survenue.');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Loader2 size={24} className="animate-spin text-primary-500" />
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
            <h1 className="page-title">Nouvelle Ordonnance</h1>
            <p className="page-subtitle">Ajoutez un ou plusieurs médicaments, puis validez en une fois</p>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <AlertCircle size={18} /> {errorMsg}
        </div>
      )}

      <datalist id="frequences-suggestions">
        {FREQUENCES.map((f) => <option key={f} value={f} />)}
      </datalist>
      <datalist id="durees-suggestions">
        {DUREES.map((d) => <option key={d} value={d} />)}
      </datalist>

      <form onSubmit={handleSubmit} style={{ maxWidth: 1000 }}>
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">Ajouter un médicament</span></div>
          <div className="card-body">
            <div className="form-group" style={{ position: 'relative', marginBottom: 0 }}>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--neutral-400)' }} />
                <input
                  ref={searchRef}
                  type="text"
                  className="form-input"
                  style={{ paddingLeft: 36, paddingRight: 36 }}
                  placeholder="Nom commercial, générique, code ou dosage... (Entrée pour ajouter le premier résultat)"
                  value={searchQuery}
                  onFocus={() => setIsDropdownOpen(true)}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      // Ne pas valider l'ordonnance : ajouter le premier résultat
                      e.preventDefault();
                      if (searchQuery.trim() && filteredMedicaments.length > 0) {
                        handleAddMedicament(filteredMedicaments[0]);
                      }
                    } else if (e.key === 'Escape') {
                      setIsDropdownOpen(false);
                    }
                  }}
                  onBlur={() => {
                    // Timeout pour permettre au clic sur l'option de s'enregistrer
                    setTimeout(() => setIsDropdownOpen(false), 200);
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    title="Effacer"
                    style={{ position: 'absolute', right: 8, top: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--neutral-400)', padding: 2 }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Résultats dans le flux de la page : ils poussent la liste au lieu de la recouvrir */}
              {isDropdownOpen && searchQuery.trim() !== '' && (
                <div style={{
                  border: '1px solid var(--neutral-200)',
                  borderRadius: 8,
                  marginTop: 4,
                  maxHeight: 280,
                  overflowY: 'auto',
                  backgroundColor: 'white'
                }}>
                  {filteredMedicaments.length > 0 ? (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {filteredMedicaments.map(med => {
                        const isLow = med.stock_actuel <= med.stock_minimum;
                        return (
                          <li
                            key={med.id}
                            style={{
                              padding: '10px 16px',
                              cursor: 'pointer',
                              borderBottom: '1px solid var(--neutral-100)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                            onMouseDown={() => handleAddMedicament(med)}
                          >
                            <div>
                              <div style={{ fontWeight: 500 }}>
                                {med.nom_commercial} {med.dosage ? `(${med.dosage})` : ''}
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>
                                {med.nom_generique ? `${med.nom_generique} • ` : ''}Stock: {med.stock_actuel}
                                {isLow ? (
                                  <span style={{ color: 'var(--warning-600, #d97706)', fontWeight: 500 }}> (Faible)</span>
                                ) : null}
                              </div>
                            </div>
                            <span style={{ fontSize: 12, color: 'var(--primary-600)', fontWeight: 600 }}>+ Ajouter</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--neutral-500)' }}>
                      Aucun médicament disponible à la pharmacie ne correspond à cette recherche.
                    </div>
                  )}
                </div>
              )}
              <p style={{ fontSize: 12, color: 'var(--neutral-500)', marginTop: 4 }}>
                Seuls les médicaments disponibles à la pharmacie (en stock et non périmés) peuvent être prescrits.
              </p>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">Médicaments de l'ordonnance ({lignes.length})</span>
          </div>
          <div className="card-body">
            {lignes.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--neutral-500)' }}>
                <Pill size={28} style={{ color: 'var(--neutral-300)', marginBottom: 8 }} />
                <div>Aucun médicament pour l'instant. Recherchez-en un ci-dessus pour l'ajouter.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {lignes.map((l, index) => (
                  <div key={l.key} style={{ border: '1px solid var(--neutral-200)', borderRadius: 8, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ fontWeight: 600 }}>
                        {index + 1}. {l.medicament.nom_commercial}
                        <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--neutral-500)', marginLeft: 8 }}>
                          {l.medicament.nom_generique ? `${l.medicament.nom_generique} • ` : ''}Stock: {l.medicament.stock_actuel}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => removeLigne(l.key)}
                        title="Retirer de l'ordonnance"
                        style={{ color: 'var(--danger-600, #dc2626)' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Dosage</label>
                        <input
                          type="text"
                          className="form-input"
                          value={l.dosage}
                          onChange={(e) => updateLigne(l.key, { dosage: e.target.value })}
                          placeholder="Ex: 500mg, 1 cuillère..."
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Voie *</label>
                        <select
                          className="form-select"
                          required
                          value={l.voie_administration}
                          onChange={(e) => updateLigne(l.key, { voie_administration: e.target.value as Prescription['voie_administration'] })}
                        >
                          {VOIES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Fréquence *</label>
                        <input
                          type="text"
                          className="form-input"
                          list="frequences-suggestions"
                          required
                          value={l.frequence}
                          onChange={(e) => updateLigne(l.key, { frequence: e.target.value })}
                          placeholder="Ex: 3 fois par jour"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Durée *</label>
                        <input
                          type="text"
                          className="form-input"
                          list="durees-suggestions"
                          required
                          value={l.duree}
                          onChange={(e) => updateLigne(l.key, { duree: e.target.value })}
                          placeholder="Ex: 5 jours"
                        />
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <input
                        type="text"
                        className="form-input"
                        value={l.instructions}
                        onChange={(e) => updateLigne(l.key, { instructions: e.target.value })}
                        placeholder="Instructions spéciales (optionnel) — Ex: Prendre au cours des repas..."
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" onClick={() => router.back()} className="btn btn-outline">Annuler</button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving || lignes.length === 0}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {' '}Valider l'ordonnance{lignes.length > 0 ? ` (${lignes.length})` : ''}
          </button>
        </div>
      </form>
    </div>
  );
}
