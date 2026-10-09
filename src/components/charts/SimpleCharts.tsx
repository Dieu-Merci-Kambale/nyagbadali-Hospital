'use client';

import { useState } from 'react';

// =====================================================
// Graphiques légers à une seule série (HTML/CSS, sans dépendance).
// Une seule teinte (couleur primaire de l'application), barres fines
// arrondies côté données, grille discrète, infobulle au survol.
// =====================================================

export type Datum = { label: string; value: number; hint?: string };

/** Histogramme vertical (évolution dans le temps). */
export function ColumnChart({
  data,
  height = 180,
  format = (v: number) => String(v),
  emptyText = 'Aucune donnée sur la période.',
}: {
  data: Datum[];
  height?: number;
  format?: (v: number) => string;
  emptyText?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 0);
  if (data.length === 0 || max === 0) {
    return <p style={{ textAlign: 'center', color: 'var(--neutral-400)', padding: '40px 0', fontSize: 13 }}>{emptyText}</p>;
  }
  // Graduation « ronde » de l'axe
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => max / s <= 4) || pow * 10;
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const labelEvery = Math.ceil(data.length / 10);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {/* Axe Y */}
        <div style={{ position: 'relative', width: 56, height, flexShrink: 0 }}>
          {ticks.map((t) => (
            <span key={t} style={{ position: 'absolute', right: 0, bottom: `${(t / top) * 100}%`, transform: 'translateY(50%)', fontSize: 10, color: 'var(--neutral-400)', whiteSpace: 'nowrap' }}>
              {format(t)}
            </span>
          ))}
        </div>
        {/* Zone de tracé */}
        <div style={{ position: 'relative', flex: 1, height }}>
          {ticks.map((t) => (
            <div key={t} style={{ position: 'absolute', left: 0, right: 0, bottom: `${(t / top) * 100}%`, borderTop: `1px solid ${t === 0 ? 'var(--neutral-300)' : 'var(--neutral-100)'}` }} />
          ))}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: 2 }}>
            {data.map((d, i) => (
              <div
                key={d.label + i}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', cursor: 'default' }}
              >
                <div style={{
                  width: '70%',
                  maxWidth: 28,
                  height: `${(d.value / top) * 100}%`,
                  minHeight: d.value > 0 ? 2 : 0,
                  background: hover === i ? 'var(--primary-600)' : 'var(--primary-500)',
                  borderRadius: '4px 4px 0 0',
                  transition: 'background 0.15s',
                }} />
              </div>
            ))}
          </div>
          {hover !== null && (
            <div style={{
              position: 'absolute', bottom: `calc(${(data[hover].value / top) * 100}% + 8px)`,
              left: `${((hover + 0.5) / data.length) * 100}%`, transform: 'translateX(-50%)',
              background: 'var(--neutral-900)', color: 'white', padding: '6px 10px', borderRadius: 6, fontSize: 12,
              whiteSpace: 'nowrap', pointerEvents: 'none', boxShadow: 'var(--shadow-md)', zIndex: 2,
            }}>
              <div style={{ opacity: 0.7 }}>{data[hover].hint || data[hover].label}</div>
              <div style={{ fontWeight: 700 }}>{format(data[hover].value)}</div>
            </div>
          )}
        </div>
      </div>
      {/* Axe X */}
      <div style={{ display: 'flex', gap: 2, marginLeft: 64, marginTop: 6 }}>
        {data.map((d, i) => (
          <div key={d.label + i} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: 'var(--neutral-400)', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {i % labelEvery === 0 ? d.label : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Classement en barres horizontales (comparaison de catégories). */
export function BarList({
  data,
  format = (v: number) => String(v),
  emptyText = 'Aucune donnée sur la période.',
  max: maxItems = 8,
}: {
  data: Datum[];
  format?: (v: number) => string;
  emptyText?: string;
  max?: number;
}) {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const shown = sorted.slice(0, maxItems);
  const rest = sorted.slice(maxItems);
  if (rest.length) shown.push({ label: `Autres (${rest.length})`, value: rest.reduce((s, d) => s + d.value, 0) });
  const max = Math.max(...shown.map((d) => d.value), 0);
  const total = sorted.reduce((s, d) => s + d.value, 0);
  if (shown.length === 0 || max === 0) {
    return <p style={{ textAlign: 'center', color: 'var(--neutral-400)', padding: '24px 0', fontSize: 13 }}>{emptyText}</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {shown.map((d) => (
        <div key={d.label} title={`${d.label} : ${format(d.value)} (${Math.round((d.value / total) * 100)} %)`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4, gap: 12 }}>
            <span style={{ color: 'var(--neutral-700)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
            <span style={{ fontWeight: 700, color: 'var(--neutral-900)', whiteSpace: 'nowrap' }}>
              {format(d.value)} <span style={{ fontWeight: 400, color: 'var(--neutral-400)', fontSize: 11 }}>{Math.round((d.value / total) * 100)} %</span>
            </span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(d.value / max) * 100}%`, borderRadius: '0 4px 4px 0' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
