'use client';

import { useEffect, useState } from 'react';
import { Search, Check, Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export type PatientOption = {
  id: string;
  nom: string;
  prenom: string;
  code_patient: string;
  date_naissance?: string;
  sexe?: string;
  allergies?: string | null;
};

type Props = {
  value: string;
  onChange: (patientId: string, patient: PatientOption | null) => void;
  /** Patient présélectionné (ex. ?patient_id=… dans l'URL) */
  initialPatientId?: string | null;
  label?: string;
  required?: boolean;
  disabled?: boolean;
};

const SELECT_FIELDS = 'id, nom, prenom, code_patient, date_naissance, sexe';

/** Champ de recherche de patient avec liste déroulante (nom, prénom, code ou téléphone). */
export default function PatientSearch({ value, onChange, initialPatientId, label = 'Patient', required = true, disabled = false }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PatientOption[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  // Présélection
  useEffect(() => {
    if (!initialPatientId) return;
    let ignore = false;
    supabase.from('patients').select(SELECT_FIELDS).eq('id', initialPatientId).single().then(({ data }) => {
      if (!ignore && data) {
        setQuery(`${data.prenom} ${data.nom} (${data.code_patient})`);
        onChange(data.id, data as PatientOption);
      }
    });
    return () => { ignore = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPatientId]);

  // Recherche (avec temporisation)
  useEffect(() => {
    if (value || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let ignore = false;
    setSearching(true);
    const q = query.trim().replace(/[%,()]/g, ' ');
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('patients')
        .select(SELECT_FIELDS)
        .or(`nom.ilike.%${q}%,prenom.ilike.%${q}%,code_patient.ilike.%${q}%,telephone.ilike.%${q}%`)
        .order('nom')
        .limit(10);
      if (!ignore) {
        setResults((data || []) as PatientOption[]);
        setSearching(false);
      }
    }, 250);
    return () => { ignore = true; clearTimeout(timer); };
  }, [query, value]);

  const select = (p: PatientOption) => {
    setQuery(`${p.prenom} ${p.nom} (${p.code_patient})`);
    setOpen(false);
    onChange(p.id, p);
  };

  const clear = () => {
    setQuery('');
    onChange('', null);
  };

  return (
    <div className="form-group" style={{ position: 'relative' }}>
      <label className="form-label">{label}{required ? ' *' : ''}</label>
      <div style={{ position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--neutral-400)' }} />
        <input
          type="text"
          className="form-input"
          style={{ paddingLeft: 36, paddingRight: 36 }}
          placeholder="Nom, prénom, code patient ou téléphone…"
          value={query}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            if (value) onChange('', null);
            setOpen(true);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          required={required && !value}
        />
        {query && !disabled && (
          <button
            type="button"
            onClick={clear}
            title="Effacer"
            style={{ position: 'absolute', right: 8, top: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--neutral-400)', padding: 2 }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {open && !value && query.trim().length >= 2 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, backgroundColor: 'white', border: '1px solid var(--neutral-200)', borderRadius: 8, marginTop: 4, maxHeight: 240, overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
          {searching ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, color: 'var(--neutral-500)' }}>
              <Loader2 size={16} className="animate-spin" /> Recherche…
            </div>
          ) : results.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {results.map((p) => (
                <li
                  key={p.id}
                  onMouseDown={() => select(p)}
                  style={{ padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid var(--neutral-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div>
                    <div style={{ fontWeight: 500 }}>{p.prenom} {p.nom}</div>
                    <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>ID : {p.code_patient}</div>
                  </div>
                  {value === p.id && <Check size={16} className="text-primary-600" />}
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--neutral-500)' }}>Aucun patient trouvé.</div>
          )}
        </div>
      )}
    </div>
  );
}
