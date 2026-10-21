'use client';

import Link from 'next/link';
import { ShieldCheck, Clock, Scale } from 'lucide-react';
import { formatMoney, formatDate, statusBadge } from '@/lib/format';
import { CREANCE_STATUTS, type CreanceAssurance } from '@/lib/assurances';

type Props = {
  creance: CreanceAssurance | null;
  /** Part assurance de la facture (si la vue du module n'est pas encore installée) */
  montant: number;
  /** L'utilisateur a accès au module Assurances */
  lienModule: boolean;
};

/** Situation de la part assurance d'une facture : assureur, réclamation, règlements et litiges. */
export default function PriseEnChargeCard({ creance, montant, lienModule }: Props) {
  if (!creance) {
    return (
      <div className="card">
        <div className="card-header"><span className="card-title"><ShieldCheck size={16} /> Prise en charge assurance</span></div>
        <div className="card-body" style={{ fontSize: 13 }}>Part assurance : <strong>{formatMoney(montant)}</strong></div>
      </div>
    );
  }
  const st = statusBadge(CREANCE_STATUTS, creance.statut_assurance);
  const ligne = (label: string, valeur: React.ReactNode, couleur?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
      <span style={{ color: 'var(--neutral-500)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: couleur }}>{valeur}</span>
    </div>
  );
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title"><ShieldCheck size={16} /> Prise en charge assurance</span>
        <span className={`badge ${st.badge}`}>{st.label}</span>
      </div>
      <div className="card-body" style={{ display: 'grid', gap: 8 }}>
        {ligne('Assureur', lienModule && creance.assureur_id
          ? <Link href={`/assurances/assureurs/${creance.assureur_id}`}>{creance.assureur_nom}</Link>
          : creance.assureur_nom || 'Non rattaché')}
        {creance.numero_assurance && ligne('N° assuré', creance.numero_assurance)}
        {ligne('Part assurance', formatMoney(creance.montant_assurance))}
        {Number(creance.paye) > 0 && ligne('Réglé par l’assureur', formatMoney(creance.paye), 'var(--success)')}
        {Number(creance.transfere) > 0 && ligne('Reporté au patient (litige)', formatMoney(creance.transfere))}
        {Number(creance.abandonne) > 0 && ligne('Abandonné (litige)', formatMoney(creance.abandonne), 'var(--danger)')}
        {ligne('Reste dû par l’assureur', formatMoney(creance.reste))}
        {creance.bordereau_id && ligne('Bordereau', lienModule
          ? <Link href={`/assurances/bordereaux/${creance.bordereau_id}`}>{creance.bordereau_numero}</Link>
          : creance.bordereau_numero)}
        {creance.en_retard && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}>
            <Clock size={13} /> Échéance dépassée depuis le {formatDate(creance.date_echeance)}
          </div>
        )}
        {creance.litiges_ouverts > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}>
            <Scale size={13} /> {formatMoney(creance.montant_conteste)} contestés par l’assureur
            {lienModule && <Link href="/assurances/litiges" style={{ marginLeft: 'auto' }}>Traiter →</Link>}
          </div>
        )}
      </div>
    </div>
  );
}
