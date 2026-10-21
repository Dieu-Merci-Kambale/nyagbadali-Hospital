'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Banknote, Users, BedDouble, Stethoscope, Pill, FlaskConical, Building2, FileText, FileSpreadsheet, Printer,
  Loader2, Play, AlertTriangle, ChevronRight, CalendarDays, Filter, Inbox, ArrowLeft, ShieldCheck,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { roleLabels } from '@/lib/role-permissions';
import { CATEGORIES, reportsForRole } from '@/lib/reports';
import type { Period, PeriodMode, ReportDefinition, ReportResult } from '@/lib/reports';
import type { ReportCategory } from '@/lib/reports/types';
import { buildPeriod, defaultPeriodValue, formatCell } from '@/lib/reports/helpers';
import { downloadReportPdf, downloadReportExcel, printReport } from '@/lib/reports/export';

const ICONS: Record<ReportCategory, React.ReactNode> = {
  finances: <Banknote size={18} />,
  assurances: <ShieldCheck size={18} />,
  patients: <Users size={18} />,
  hospitalisation: <BedDouble size={18} />,
  medical: <Stethoscope size={18} />,
  pharmacie: <Pill size={18} />,
  laboratoire: <FlaskConical size={18} />,
  administration: <Building2 size={18} />,
};

const MODES: { key: PeriodMode; label: string }[] = [
  { key: 'jour', label: 'Journée' },
  { key: 'mois', label: 'Mois' },
  { key: 'annee', label: 'Année' },
  { key: 'periode', label: 'Période' },
];

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const PREVIEW_ROWS = 200;

type Props = {
  title: string;
  subtitle?: string;
  /** Limite aux rapports d'un module (sinon : tous les rapports autorisés pour le rôle) */
  reportIds?: string[];
  /** Bouton de retour vers le module */
  backHref?: string;
};

/** Centre de rapports : choix du rapport, période, aperçu et exports PDF / Excel / impression. */
export default function ReportsCenter({ title, subtitle, reportIds, backHref }: Props) {
  const router = useRouter();
  const { profile } = useAuth();
  const idsKey = (reportIds || []).join(",");
  const disponibles = useMemo(
    () => reportsForRole(profile?.role).filter((r) => !idsKey || idsKey.split(",").includes(r.id)),
    [profile?.role, idsKey]
  );
  const categories = CATEGORIES.filter((c) => disponibles.some((r) => r.category === c.key));

  const [categorie, setCategorie] = useState<ReportCategory | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const cat = categorie || categories[0]?.key || null;
  const liste = disponibles.filter((r) => r.category === cat);
  const report: ReportDefinition | undefined = disponibles.find((r) => r.id === reportId) || liste[0];

  // Période
  const now = new Date();
  const [mode, setMode] = useState<PeriodMode | null>(null);
  const [jour, setJour] = useState(defaultPeriodValue('jour'));
  const [mois, setMois] = useState(now.getMonth() + 1);
  const [annee, setAnnee] = useState(now.getFullYear());
  const [debut, setDebut] = useState(defaultPeriodValue('periode').split('|')[0]);
  const [fin, setFin] = useState(defaultPeriodValue('periode').split('|')[1]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  // Choix des filtres chargés depuis la base (par rapport puis par filtre)
  const [dynOptions, setDynOptions] = useState<Record<string, { value: string; label: string }[]>>({});

  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState<'' | 'pdf' | 'excel' | 'print'>('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ reportId: string; data: ReportResult; period: Period | null; filtersLabel: string } | null>(null);

  const effectiveMode: PeriodMode = mode || report?.defaultMode || 'mois';
  const years = Array.from({ length: 8 }, (_, i) => now.getFullYear() - i);

  // Chargement des choix dynamiques du rapport sélectionné
  const reportKey = report?.id;
  useEffect(() => {
    if (!report) return;
    let ignore = false;
    (report.filters || []).forEach((f) => {
      const k = `${report.id}:${f.key}`;
      if (!f.loadOptions || dynOptions[k]) return;
      f.loadOptions().then((opts) => { if (!ignore) setDynOptions((prev) => ({ ...prev, [k]: opts })); }).catch(() => {});
    });
    return () => { ignore = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportKey]);

  const optionsOf = (f: NonNullable<ReportDefinition['filters']>[number]) => [...f.options, ...(dynOptions[`${report?.id}:${f.key}`] || [])];

  const selectReport = (r: ReportDefinition) => {
    setReportId(r.id);
    setMode(null);
    setFilters({});
    setResult(null);
    setError('');
  };

  const currentPeriod = (): Period | null => {
    if (!report || report.period === 'aucune') return null;
    const value = effectiveMode === 'jour' ? jour
      : effectiveMode === 'mois' ? `${annee}-${String(mois).padStart(2, '0')}`
        : effectiveMode === 'annee' ? String(annee)
          : `${debut}|${fin}`;
    return buildPeriod(effectiveMode, value);
  };

  const filterValues = () => Object.fromEntries((report?.filters || []).map((f) => [f.key, filters[f.key] ?? f.defaultValue]));
  const filtersLabel = () => (report?.filters || [])
    .map((f) => {
      const v = filters[f.key] ?? f.defaultValue;
      const opt = optionsOf(f).find((o) => o.value === v);
      return v && v !== 'tous' ? `${f.label} : ${opt?.label || v}` : '';
    })
    .filter(Boolean)
    .join(' • ');

  const run = async () => {
    if (!report) return;
    const period = currentPeriod();
    if (period && period.from > period.to) {
      toast.error('La date de début doit précéder la date de fin.');
      return;
    }
    setRunning(true);
    setError('');
    try {
      const data = await report.run({ period, filters: filterValues() });
      setResult({ reportId: report.id, data, period, filtersLabel: filtersLabel() });
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Impossible de générer le rapport.');
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  const exporter = async (kind: 'pdf' | 'excel' | 'print') => {
    if (!report || !result) return;
    setExporting(kind);
    const ctx = {
      def: report,
      result: result.data,
      period: result.period,
      filtersLabel: result.filtersLabel,
      printedBy: profile ? { prenom: profile.prenom, nom: profile.nom, role: roleLabels[profile.role] } : undefined,
    };
    try {
      if (kind === 'pdf') await downloadReportPdf(ctx);
      else if (kind === 'excel') await downloadReportExcel(ctx);
      else await printReport(ctx);
    } catch (e) {
      console.error(e);
      toast.error("L'export n'a pas pu être généré.");
    } finally {
      setExporting('');
    }
  };

  if (!profile) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>;
  }

  if (!disponibles.length) {
    return (
      <div className="empty-state" style={{ marginTop: 40 }}>
        <Inbox className="empty-state-icon" />
        <h3>Aucun rapport disponible pour votre rôle</h3>
      </div>
    );
  }

  const shown = result && report && result.reportId === report.id ? result : null;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {backHref && (
            <button onClick={() => router.push(backHref)} className="btn btn-ghost" title="Retour"><ArrowLeft size={18} /></button>
          )}
          <div>
            <h1 className="page-title">{title}</h1>
            <p className="page-subtitle">{subtitle || `${disponibles.length} rapport(s) disponible(s) • aperçu à l'écran, export PDF et Excel, impression`}</p>
          </div>
        </div>
      </div>

      {/* Onglets par domaine (centre de rapports de la direction) */}
      {categories.length > 1 && (
      <div className="tabs" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
        {categories.map((c) => (
          <button
            key={c.key}
            className={`tab ${cat === c.key ? 'active' : ''}`}
            onClick={() => { setCategorie(c.key); setReportId(null); setResult(null); setMode(null); setFilters({}); setError(''); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {ICONS[c.key]} {c.label} ({disponibles.filter((r) => r.category === c.key).length})
          </button>
        ))}
      </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>
        {/* Liste des rapports du domaine */}
        <div className="card" style={{ position: 'sticky', top: 90 }}>
          <div className="card-header"><span className="card-title">{cat ? CATEGORIES.find((c) => c.key === cat)?.label : ''}</span></div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {liste.map((r) => {
              const active = report?.id === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => selectReport(r)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', border: 'none', textAlign: 'left', cursor: 'pointer',
                    borderLeft: `3px solid ${active ? 'var(--primary-500)' : 'transparent'}`, borderBottom: '1px solid var(--neutral-100)',
                    background: active ? 'var(--primary-50)' : 'white',
                  }}
                >
                  <FileText size={16} style={{ marginTop: 2, color: active ? 'var(--primary-600)' : 'var(--neutral-400)', flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontWeight: 600, fontSize: 14, color: 'var(--neutral-800)' }}>{r.title}</span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--neutral-500)', marginTop: 2 }}>
                      {r.period === 'aucune' ? 'État à date' : 'Par journée, mois, année ou période'}
                    </span>
                  </span>
                  <ChevronRight size={14} style={{ marginTop: 3, color: 'var(--neutral-300)' }} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Paramètres, aperçu et exports */}
        {report && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <div className="card">
              <div className="card-body">
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--neutral-900)' }}>{report.title}</h2>
                <p style={{ fontSize: 13, color: 'var(--neutral-500)', marginTop: 4, marginBottom: 16 }}>{report.description}</p>

                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  {report.period === 'periode' ? (
                    <>
                      <div>
                        <label className="form-label"><CalendarDays size={13} style={{ display: 'inline', verticalAlign: 'middle' }} /> Période</label>
                        <div style={{ display: 'flex', border: '1px solid var(--neutral-200)', borderRadius: 10, overflow: 'hidden' }}>
                          {MODES.map((m) => (
                            <button key={m.key} type="button" className={`btn btn-sm ${effectiveMode === m.key ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: 0 }} onClick={() => setMode(m.key)}>
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {effectiveMode === 'jour' && (
                        <div>
                          <label className="form-label">Date</label>
                          <input type="date" className="form-input" value={jour} onChange={(e) => e.target.value && setJour(e.target.value)} style={{ width: 170 }} />
                        </div>
                      )}
                      {effectiveMode === 'mois' && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <div>
                            <label className="form-label">Mois</label>
                            <select className="form-select" value={mois} onChange={(e) => setMois(Number(e.target.value))} style={{ width: 150 }}>
                              {MOIS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="form-label">Année</label>
                            <select className="form-select" value={annee} onChange={(e) => setAnnee(Number(e.target.value))} style={{ width: 110 }}>
                              {years.map((y) => <option key={y} value={y}>{y}</option>)}
                            </select>
                          </div>
                        </div>
                      )}
                      {effectiveMode === 'annee' && (
                        <div>
                          <label className="form-label">Année</label>
                          <select className="form-select" value={annee} onChange={(e) => setAnnee(Number(e.target.value))} style={{ width: 120 }}>
                            {years.map((y) => <option key={y} value={y}>{y}</option>)}
                          </select>
                        </div>
                      )}
                      {effectiveMode === 'periode' && (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                          <div>
                            <label className="form-label">Du</label>
                            <input type="date" className="form-input" value={debut} onChange={(e) => e.target.value && setDebut(e.target.value)} style={{ width: 165 }} />
                          </div>
                          <div>
                            <label className="form-label">Au</label>
                            <input type="date" className="form-input" value={fin} onChange={(e) => e.target.value && setFin(e.target.value)} style={{ width: 165 }} />
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="alert alert-info" style={{ padding: '8px 12px' }}>
                      <CalendarDays size={16} /> État à la date du jour ({now.toLocaleDateString('fr-FR')})
                    </div>
                  )}

                  {(report.filters || []).map((f) => (
                    <div key={f.key}>
                      <label className="form-label"><Filter size={13} style={{ display: 'inline', verticalAlign: 'middle' }} /> {f.label}</label>
                      <select className="form-select" value={filters[f.key] ?? f.defaultValue} onChange={(e) => setFilters({ ...filters, [f.key]: e.target.value })} style={{ width: 190 }}>
                        {optionsOf(f).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  ))}

                  <button className="btn btn-primary" onClick={run} disabled={running} style={{ marginLeft: 'auto' }}>
                    {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Générer le rapport
                  </button>
                </div>
              </div>
            </div>

            {error && <div className="alert alert-danger"><AlertTriangle size={18} /> {error}</div>}

            {shown && (
              <>
                {/* Barre d'export */}
                <div className="card" style={{ position: 'sticky', top: 74, zIndex: 5 }}>
                  <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 700, color: 'var(--neutral-800)' }}>{shown.period?.label || `Situation au ${now.toLocaleDateString('fr-FR')}`}</div>
                      {shown.filtersLabel && <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{shown.filtersLabel}</div>}
                    </div>
                    <button className="btn btn-outline" onClick={() => exporter('print')} disabled={!!exporting}>
                      {exporting === 'print' ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} Imprimer
                    </button>
                    <button className="btn btn-outline" onClick={() => exporter('excel')} disabled={!!exporting} style={{ color: '#047857', borderColor: '#a7f3d0' }}>
                      {exporting === 'excel' ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />} Excel
                    </button>
                    <button className="btn btn-primary" onClick={() => exporter('pdf')} disabled={!!exporting}>
                      {exporting === 'pdf' ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />} PDF
                    </button>
                  </div>
                </div>

                {/* Indicateurs */}
                {!!shown.data.kpis?.length && (
                  <div className="stats-grid" style={{ gridTemplateColumns: `repeat(${Math.min(4, shown.data.kpis.length)}, 1fr)` }}>
                    {shown.data.kpis.map((k) => (
                      <div key={k.label} className="stat-card" style={{ padding: 16 }}>
                        <div className="stat-card-info">
                          <h3>{k.label}</h3>
                          <div className="stat-value" style={{ fontSize: 20 }}>
                            {typeof k.value === 'number' ? formatCell(k.value, k.type || 'number') : k.value}
                          </div>
                          {k.hint && <div style={{ fontSize: 11, color: 'var(--neutral-500)', marginTop: 2 }}>{k.hint}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tableaux */}
                {shown.data.sections.map((s) => (
                  <div key={s.title} className="card">
                    <div className="card-header">
                      <span className="card-title">{s.title}</span>
                      <span style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{s.rows.length} ligne(s)</span>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="data-table" style={{ fontSize: 13 }}>
                        <thead>
                          <tr>
                            {s.columns.map((c) => (
                              <th key={c.header} style={{ textAlign: c.align || (c.type && ['money', 'number', 'percent'].includes(c.type) ? 'right' : 'left'), whiteSpace: 'nowrap' }}>{c.header}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {s.rows.length === 0 ? (
                            <tr><td colSpan={s.columns.length} style={{ textAlign: 'center', color: 'var(--neutral-400)', padding: 24 }}>{s.emptyText || 'Aucune donnée.'}</td></tr>
                          ) : s.rows.slice(0, PREVIEW_ROWS).map((row, r) => (
                            <tr key={r} style={{ background: s.highlightRows?.includes(r) ? 'var(--warning-50)' : undefined }}>
                              {row.map((v, i) => {
                                const t = s.columns[i]?.type;
                                return (
                                  <td key={i} style={{ textAlign: s.columns[i]?.align || (t && ['money', 'number', 'percent'].includes(t) ? 'right' : 'left'), whiteSpace: t && t !== 'text' ? 'nowrap' : undefined, fontWeight: i === 0 ? 600 : undefined }}>
                                    {formatCell(v, t)}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                          {s.totals && s.rows.length > 0 && (
                            <tr style={{ background: '#e2ecf5', fontWeight: 700, color: 'var(--primary-900)' }}>
                              {s.totals.map((v, i) => {
                                const t = typeof v === 'number' ? s.columns[i]?.type : 'text';
                                return <td key={i} style={{ textAlign: t && ['money', 'number', 'percent'].includes(t) ? 'right' : 'left', whiteSpace: 'nowrap', borderTop: '2px solid var(--primary-900)' }}>{formatCell(v, t)}</td>;
                              })}
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {s.rows.length > PREVIEW_ROWS && (
                      <p style={{ padding: '10px 16px', fontSize: 12, color: 'var(--neutral-500)', borderTop: '1px solid var(--neutral-100)' }}>
                        Aperçu limité aux {PREVIEW_ROWS} premières lignes sur {s.rows.length}. Les exports PDF et Excel contiennent toutes les lignes.
                      </p>
                    )}
                  </div>
                ))}

                {!!shown.data.notes?.length && (
                  <div className="card"><div className="card-body" style={{ fontSize: 12, color: 'var(--neutral-500)' }}>
                    {shown.data.notes.map((n) => <p key={n}>• {n}</p>)}
                  </div></div>
                )}
              </>
            )}

            {!shown && !running && !error && (
              <div className="card"><div className="card-body"><div className="empty-state" style={{ padding: 30 }}>
                <Play className="empty-state-icon" />
                <h3>Prêt à générer</h3>
                <p>Choisissez la période puis cliquez sur « Générer le rapport » pour afficher l&apos;aperçu et l&apos;exporter.</p>
              </div></div></div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
