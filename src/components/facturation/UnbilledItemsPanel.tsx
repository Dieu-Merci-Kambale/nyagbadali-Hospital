'use client';

import { Check, Stethoscope, Pill, FlaskConical, BedDouble, Inbox } from 'lucide-react';
import { formatDate, formatMoney } from '@/lib/format';
import { SOURCE_LABELS, type ElementAFacturer, type SourceType } from '@/lib/invoice';

const ICONS: Record<SourceType, React.ReactNode> = {
  consultation: <Stethoscope size={14} />,
  prescription: <Pill size={14} />,
  analyse: <FlaskConical size={14} />,
  hospitalisation: <BedDouble size={14} />,
};

type Props = {
  elements: ElementAFacturer[];
  selected: Set<string>;
  onToggle: (el: ElementAFacturer) => void;
  onToggleAll: (select: boolean) => void;
  /** Prix calculé pour l'affichage (catalogue appliqué) */
  priceOf: (el: ElementAFacturer) => number;
};

/** Liste des prestations non encore facturées d'un patient, à cocher pour les ajouter à la facture. */
export default function UnbilledItemsPanel({ elements, selected, onToggle, onToggleAll, priceOf }: Props) {
  if (elements.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 20px', color: 'var(--neutral-500)', fontSize: 14 }}>
        <Inbox size={18} /> Aucune prestation en attente de facturation pour ce patient.
      </div>
    );
  }

  const allSelected = elements.every((e) => selected.has(e.source_id));
  const groups = (Object.keys(SOURCE_LABELS) as SourceType[])
    .map((t) => ({ type: t, items: elements.filter((e) => e.source_type === t) }))
    .filter((g) => g.items.length > 0);
  const totalSelection = elements.filter((e) => selected.has(e.source_id)).reduce((s, e) => s + priceOf(e) * e.quantite, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', background: 'var(--neutral-50)', borderBottom: '1px solid var(--neutral-100)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={allSelected} onChange={(e) => onToggleAll(e.target.checked)} />
          Tout sélectionner ({elements.length} prestation{elements.length > 1 ? 's' : ''})
        </label>
        <span style={{ fontSize: 13, color: 'var(--neutral-600)' }}>
          Sélection : <strong>{formatMoney(totalSelection)}</strong>
        </span>
      </div>
      {groups.map((g) => (
        <div key={g.type}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px 6px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--neutral-400)' }}>
            {ICONS[g.type]} {SOURCE_LABELS[g.type]}
          </div>
          {g.items.map((el) => {
            const on = selected.has(el.source_id);
            const prix = priceOf(el);
            return (
              <label
                key={el.source_id}
                style={{
                  display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 12, alignItems: 'center',
                  padding: '10px 20px', cursor: 'pointer', borderBottom: '1px solid var(--neutral-100)',
                  background: on ? 'var(--primary-50)' : 'white',
                }}
              >
                <span style={{
                  width: 18, height: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `1.5px solid ${on ? 'var(--primary-500)' : 'var(--neutral-300)'}`, background: on ? 'var(--primary-500)' : 'white',
                }}>
                  {on && <Check size={12} color="white" />}
                </span>
                <input type="checkbox" checked={on} onChange={() => onToggle(el)} style={{ display: 'none' }} />
                <span>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>{el.libelle}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--neutral-500)' }}>
                    {formatDate(el.date_element)} • {el.details}
                  </span>
                </span>
                <span style={{ textAlign: 'right', fontSize: 13 }}>
                  <span style={{ display: 'block', fontWeight: 700 }}>{prix > 0 ? formatMoney(prix * el.quantite) : <span style={{ color: 'var(--warning-600)' }}>Prix à saisir</span>}</span>
                  {el.quantite > 1 && <span style={{ display: 'block', fontSize: 11, color: 'var(--neutral-500)' }}>{el.quantite} × {formatMoney(prix)}</span>}
                </span>
              </label>
            );
          })}
        </div>
      ))}
    </div>
  );
}
