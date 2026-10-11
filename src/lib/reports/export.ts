import { buildReportPdf } from '@/lib/document-models';
import type { ColType, Period, ReportCell, ReportDefinition, ReportResult } from './types';
import { formatCell } from './helpers';
import { CATEGORIES } from './index';

type PrintedBy = { prenom?: string; nom?: string; role?: string };

export type ExportContext = {
  def: ReportDefinition;
  result: ReportResult;
  period: Period | null;
  filtersLabel?: string;
  printedBy?: PrintedBy;
};

const periodLabel = (period: Period | null) => period?.label || `Situation au ${new Date().toLocaleDateString('fr-FR')}`;

export function fileBaseName(def: ReportDefinition, period: Period | null) {
  const slug = def.title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const now = new Date();
  const stamp = period?.key || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `rapport-${slug}-${stamp}`;
}

// =====================================================
// PDF
// =====================================================

async function buildPdf(ctx: ExportContext) {
  const { def, result, period } = ctx;
  const service = CATEGORIES.find((c) => c.key === def.category)?.label || 'Direction';
  return buildReportPdf({
    title: def.title,
    periodLabel: periodLabel(period),
    service: `Rapport — ${service}`,
    orientation: def.orientation || 'portrait',
    filtersLabel: ctx.filtersLabel,
    kpis: (result.kpis || []).map((k) => {
      const v = typeof k.value === 'number' ? formatCell(k.value, k.type || 'number') : String(k.value);
      return { label: k.label, value: v.length > 24 ? `${v.slice(0, 23)}…` : v };
    }),
    sections: result.sections.map((s) => ({
      title: s.title,
      columns: s.columns.map((c) => ({
        header: c.header,
        width: c.width || 10,
        align: c.align || (c.type && ['money', 'number', 'percent'].includes(c.type) ? 'right' : 'left'),
      })),
      rows: s.rows.map((r) => r.map((v, i) => formatCell(v, s.columns[i]?.type))),
      totals: s.totals?.map((v, i) => formatCell(v, typeof v === 'number' ? s.columns[i]?.type : 'text')),
      highlightRows: s.highlightRows,
      emptyText: s.emptyText,
    })),
    notes: result.notes,
    signatures: def.signatures,
    printedBy: ctx.printedBy,
    printedAt: new Date(),
  });
}

export async function downloadReportPdf(ctx: ExportContext) {
  const pdf = await buildPdf(ctx);
  pdf.save(`${fileBaseName(ctx.def, ctx.period)}.pdf`);
}

/** Ouvre le PDF dans un nouvel onglet avec la boîte d'impression du navigateur. */
export async function printReport(ctx: ExportContext) {
  const pdf = await buildPdf(ctx);
  pdf.autoPrint();
  const url = pdf.output('bloburl');
  const win = window.open(String(url), '_blank');
  if (!win) pdf.save(`${fileBaseName(ctx.def, ctx.period)}.pdf`);
}

// =====================================================
// Excel (.xlsx)
// =====================================================

const NAVY = '#0F2854';
const SOFT = '#E2ECF5';
const WARN = '#FEF3E2';
const BORDER = '#CBD5E1';

const EXCEL_FORMATS: Partial<Record<ColType, string>> = {
  money: '#,##0" FC"',
  number: '#,##0.##',
  percent: '0.0%',
  date: 'dd/mm/yyyy',
  datetime: 'dd/mm/yyyy hh:mm',
};

function excelCell(value: ReportCell, type: ColType = 'text', style: Record<string, unknown> = {}) {
  if (value === null || value === undefined || value === '') return { value: '', type: String, ...style };
  if (type === 'money' || type === 'number' || type === 'percent') {
    const n = Number(value);
    if (Number.isFinite(n)) return { value: n, type: Number, format: EXCEL_FORMATS[type], ...style };
  }
  if (type === 'date' || type === 'datetime') {
    const d = new Date(String(value));
    if (!Number.isNaN(d.getTime())) return { value: d, type: Date, format: EXCEL_FORMATS[type], ...style };
  }
  return { value: String(value), type: String, ...style };
}

/** Nom de feuille Excel valide et unique (31 caractères, sans caractères interdits). */
function sheetName(title: string, used: Set<string>) {
  const clean = title.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim();
  // Coupe au dernier mot entier pour rester sous la limite Excel de 31 caractères
  const cut = clean.length > 28 ? clean.slice(0, 28).replace(/\s+\S*$/, '') : clean;
  const base = cut || 'Feuille';
  let name = base;
  let i = 2;
  while (used.has(name.toLowerCase())) name = `${base.slice(0, 26)} ${i++}`;
  used.add(name.toLowerCase());
  return name;
}

/** Construit les feuilles du classeur (synthèse + une feuille par tableau). */
export function buildExcelSheets(ctx: ExportContext): any[] {
  const { def, result, period } = ctx;
  const used = new Set<string>();
  const titre = def.title.toUpperCase();
  const sousTitre = `${periodLabel(period)}${ctx.filtersLabel ? ` • ${ctx.filtersLabel}` : ''}`;
  const edition = `Édité le ${new Date().toLocaleString('fr-FR')}${ctx.printedBy?.nom ? ` par ${[ctx.printedBy.prenom, ctx.printedBy.nom].filter(Boolean).join(' ')}` : ''} — Nyagbadali`;

  // Feuille de synthèse
  const synthese: any[][] = [
    [{ value: 'NYAGBADALI — ÉTABLISSEMENT HOSPITALIER', fontWeight: 'bold', textColor: NAVY, fontSize: 14, columnSpan: 3 }, null, null],
    [{ value: titre, fontWeight: 'bold', fontSize: 13, columnSpan: 3 }, null, null],
    [{ value: sousTitre, fontStyle: 'italic', columnSpan: 3 }, null, null],
    [{ value: edition, textColor: '#64748B', columnSpan: 3 }, null, null],
    [null, null, null],
  ];
  if (result.kpis?.length) {
    synthese.push([
      { value: 'Indicateur', fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: NAVY },
      { value: 'Valeur', fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: NAVY, align: 'right' },
      { value: 'Précision', fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: NAVY },
    ]);
    result.kpis.forEach((k) => synthese.push([
      { value: k.label, borderColor: BORDER, borderStyle: 'thin' },
      typeof k.value === 'number'
        ? excelCell(k.value, k.type || 'number', { fontWeight: 'bold', align: 'right', borderColor: BORDER, borderStyle: 'thin' })
        : { value: String(k.value), fontWeight: 'bold', align: 'right', borderColor: BORDER, borderStyle: 'thin' },
      { value: k.hint || '', textColor: '#64748B', borderColor: BORDER, borderStyle: 'thin' },
    ]));
  }
  if (result.sections.length) {
    synthese.push([null, null, null]);
    synthese.push([{ value: 'Contenu du classeur', fontWeight: 'bold', columnSpan: 3 }, null, null]);
    result.sections.forEach((s) => synthese.push([{ value: `• ${s.title} (${s.rows.length} ligne(s))`, columnSpan: 3 }, null, null]));
  }
  if (result.notes?.length) {
    synthese.push([null, null, null]);
    result.notes.forEach((n) => synthese.push([{ value: n, fontStyle: 'italic', textColor: '#64748B', columnSpan: 3, wrap: true }, null, null]));
  }

  const sheets: any[] = [{
    data: synthese,
    sheet: sheetName('Synthèse', used),
    columns: [{ width: 42 }, { width: 22 }, { width: 40 }],
    showGridLines: false,
  }];

  // Une feuille par tableau
  result.sections.forEach((s) => {
    const n = s.columns.length;
    const span = (value: string, style: Record<string, unknown>) => [{ value, columnSpan: n, ...style }, ...Array(n - 1).fill(null)];
    const data: any[][] = [
      span(`${titre} — ${s.title}`, { fontWeight: 'bold', fontSize: 12, textColor: NAVY }),
      span(sousTitre, { fontStyle: 'italic', textColor: '#64748B' }),
      Array(n).fill(null),
      s.columns.map((c) => ({
        value: c.header,
        fontWeight: 'bold',
        textColor: '#FFFFFF',
        backgroundColor: NAVY,
        align: c.type && ['money', 'number', 'percent'].includes(c.type) ? 'right' : 'left',
        wrap: true,
        alignVertical: 'center',
        height: 30,
      })),
    ];
    s.rows.forEach((row, r) => {
      const highlight = s.highlightRows?.includes(r);
      data.push(row.map((v, i) => excelCell(v, s.columns[i]?.type, {
        borderColor: BORDER,
        borderStyle: 'thin',
        ...(highlight ? { backgroundColor: WARN } : {}),
        ...(s.columns[i]?.align ? { align: s.columns[i].align } : {}),
      })));
    });
    if (!s.rows.length) data.push(span(s.emptyText || 'Aucune donnée.', { fontStyle: 'italic', textColor: '#64748B' }));
    if (s.totals) {
      data.push(s.totals.map((v, i) => excelCell(v, typeof v === 'number' ? s.columns[i]?.type : 'text', {
        fontWeight: 'bold', backgroundColor: SOFT, textColor: NAVY, topBorderColor: NAVY, topBorderStyle: 'medium',
      })));
    }
    sheets.push({
      data,
      sheet: sheetName(s.title, used),
      columns: s.columns.map((c) => ({ width: Math.max(10, Math.min(60, Math.round((c.width || 10) * 1.6))) })),
      stickyRowsCount: 4,
      orientation: def.orientation === 'landscape' ? 'landscape' : 'portrait',
    });
  });

  return sheets;
}

export async function downloadReportExcel(ctx: ExportContext) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  await writeXlsxFile(buildExcelSheets(ctx), { fontFamily: 'Calibri', fontSize: 11 }).toFile(`${fileBaseName(ctx.def, ctx.period)}.xlsx`);
}
