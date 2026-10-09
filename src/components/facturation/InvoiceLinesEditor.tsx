'use client';

import { Plus, Trash2, BookOpen } from 'lucide-react';
import type { ActeTarif } from '@/types';
import { formatMoney, CATEGORIES_ACTES } from '@/lib/format';
import { newLine, type InvoiceLine } from '@/lib/invoice';

type Props = {
  lines: InvoiceLine[];
  onChange: (lines: InvoiceLine[]) => void;
  actes: ActeTarif[];
  disabled?: boolean;
};

/** Tableau éditable des prestations d'une facture, avec choix dans le catalogue des tarifs. */
export default function InvoiceLinesEditor({ lines, onChange, actes, disabled = false }: Props) {
  const update = (key: string, patch: Partial<InvoiceLine>) => {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const pickActe = (key: string, acteId: string) => {
    const acte = actes.find((a) => a.id === acteId);
    if (acte) update(key, { description: acte.libelle, code_acte: acte.code, prix_unitaire: Number(acte.prix) });
  };

  const remove = (key: string) => {
    if (lines.length > 1) onChange(lines.filter((l) => l.key !== key));
  };

  const grouped = Object.entries(CATEGORIES_ACTES)
    .map(([cat, label]) => ({ label, items: actes.filter((a) => a.categorie === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <table className="data-table" style={{ margin: 0, border: 'none' }}>
        <thead style={{ background: 'var(--neutral-50)' }}>
          <tr>
            <th style={{ width: '46%' }}>Prestation</th>
            <th style={{ width: '11%' }}>Quantité</th>
            <th style={{ width: '18%' }}>Prix unitaire (FC)</th>
            <th style={{ width: '18%', textAlign: 'right' }}>Montant</th>
            <th style={{ width: '7%' }}></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((ligne) => (
            <tr key={ligne.key}>
              <td>
                {actes.length > 0 && !disabled && (
                  <div style={{ position: 'relative', marginBottom: 6 }}>
                    <BookOpen size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--neutral-400)', pointerEvents: 'none' }} />
                    <select
                      className="form-select"
                      style={{ paddingLeft: 30, fontSize: 13, color: 'var(--neutral-600)' }}
                      value=""
                      onChange={(e) => pickActe(ligne.key, e.target.value)}
                    >
                      <option value="">Choisir dans le catalogue des tarifs…</option>
                      {grouped.map((g) => (
                        <optgroup key={g.label} label={g.label}>
                          {g.items.map((a) => (
                            <option key={a.id} value={a.id}>{a.libelle} — {formatMoney(a.prix)}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                )}
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ex : Consultation, échographie..."
                  value={ligne.description}
                  onChange={(e) => update(ligne.key, { description: e.target.value, code_acte: '' })}
                  disabled={disabled}
                  required
                />
                {ligne.code_acte && <div style={{ fontSize: 11, color: 'var(--neutral-400)', marginTop: 4, fontFamily: 'monospace' }}>{ligne.code_acte}</div>}
              </td>
              <td>
                <input
                  type="number"
                  className="form-input"
                  min="1"
                  value={ligne.quantite}
                  onChange={(e) => update(ligne.key, { quantite: Math.max(1, parseInt(e.target.value) || 1) })}
                  disabled={disabled}
                  required
                />
              </td>
              <td>
                <input
                  type="number"
                  className="form-input"
                  min="0"
                  step="50"
                  value={ligne.prix_unitaire}
                  onChange={(e) => update(ligne.key, { prix_unitaire: Math.max(0, parseFloat(e.target.value) || 0) })}
                  disabled={disabled}
                  required
                />
              </td>
              <td style={{ fontWeight: 600, verticalAlign: 'middle', textAlign: 'right' }}>
                {formatMoney(ligne.quantite * ligne.prix_unitaire)}
              </td>
              <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                {!disabled && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ color: 'var(--danger)', padding: 4 }}
                    onClick={() => remove(ligne.key)}
                    disabled={lines.length === 1}
                    title="Supprimer la ligne"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!disabled && (
        <div style={{ padding: '12px 16px' }}>
          <button type="button" onClick={() => onChange([...lines, newLine()])} className="btn btn-outline btn-sm">
            <Plus size={16} /> Ajouter une ligne
          </button>
        </div>
      )}
    </>
  );
}

/** Récapitulatif des montants (sous-total, assurance, net patient). */
export function InvoiceTotals({ total, tauxAssurance, montantAssurance }: { total: number; tauxAssurance: number; montantAssurance: number }) {
  return (
    <div style={{ padding: '20px 24px', background: 'var(--neutral-50)', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--neutral-200)' }}>
      <div style={{ width: 340 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14 }}>
          <span style={{ color: 'var(--neutral-600)' }}>Total brut</span>
          <span>{formatMoney(total)}</span>
        </div>
        {montantAssurance > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 14, color: 'var(--primary-600)' }}>
            <span>Prise en charge assurance ({tauxAssurance}%)</span>
            <span>- {formatMoney(montantAssurance)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 16, borderTop: '1px solid var(--neutral-200)', fontSize: 18, fontWeight: 700 }}>
          <span>Net à payer (patient)</span>
          <span style={{ color: 'var(--primary-600)' }}>{formatMoney(total - montantAssurance)}</span>
        </div>
      </div>
    </div>
  );
}
