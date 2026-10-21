'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { formatMoney, explainDbError } from '@/lib/format';
import { fetchAssureurs, contratEchu, type Assureur } from '@/lib/assurances';

type Props = {
  /** Identifiant de l'assureur choisi ('' = pas d'assurance) */
  value: string;
  onChange: (id: string, assureur: Assureur | null) => void;
  /** Ancien assureur saisi en texte libre, non rattaché à un assureur enregistré */
  ancienNom?: string | null;
  id?: string;
};

/** Choix de l'assureur du patient parmi les assureurs enregistrés par l'administration. */
export default function AssureurSelect({ value, onChange, ancienNom, id = 'assureur_id' }: Props) {
  const [assureurs, setAssureurs] = useState<Assureur[]>([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Assureurs actifs, plus l'assureur actuel du patient s'il a été désactivé depuis
    fetchAssureurs({ inclureInactifs: true }).then(({ assureurs: list, error: e }) => {
      if (e) setError(explainDbError(e));
      setAssureurs(list);
      setLoaded(true);
    });
  }, []);

  const proposes = assureurs.filter((a) => a.actif || a.id === value);
  const choisi = assureurs.find((a) => a.id === value) || null;

  return (
    <>
      <select
        className="form-select"
        id={id}
        value={value}
        disabled={!!error}
        onChange={(e) => onChange(e.target.value, assureurs.find((a) => a.id === e.target.value) || null)}
      >
        <option value="">Pas d&apos;assurance</option>
        {proposes.map((a) => <option key={a.id} value={a.id}>{a.nom}{a.actif ? '' : ' (désactivé)'}</option>)}
      </select>
      {error && <p className="form-help" style={{ color: 'var(--danger)' }}><AlertTriangle size={12} /> {error}</p>}
      {!error && ancienNom && !value && (
        <p className="form-help" style={{ color: 'var(--warning-600, #b45309)' }}>
          <AlertTriangle size={12} /> Assureur actuel « {ancienNom} » non enregistré : choisissez l&apos;assureur dans la liste.
        </p>
      )}
      {!error && loaded && !proposes.length && (
        <p className="form-help">Aucun assureur enregistré : l&apos;administration les ajoute dans Assurances › Assureurs.</p>
      )}
      {choisi && (
        <p className="form-help" style={{ display: 'flex', alignItems: 'center', gap: 4, color: contratEchu(choisi) ? 'var(--danger)' : 'var(--primary-700)' }}>
          <ShieldCheck size={12} /> Couverture {Number(choisi.taux_couverture)} %
          {choisi.plafond_facture ? `, plafond ${formatMoney(choisi.plafond_facture)} par facture` : ''}
          {contratEchu(choisi) ? ' — contrat échu' : ''}
        </p>
      )}
    </>
  );
}
