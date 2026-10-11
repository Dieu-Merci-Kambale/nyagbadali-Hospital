import type { RolePersonnel } from '@/types';

// =====================================================
// Centre de rapports : structures communes
// Un rapport produit des indicateurs (KPI) et des sections tabulaires,
// affichées à l'écran puis exportées en PDF ou en Excel.
// =====================================================

export type ColType = 'text' | 'money' | 'number' | 'date' | 'datetime' | 'percent';

export type ReportColumn = {
  header: string;
  type?: ColType;
  /** Largeur relative (PDF) — en caractères pour Excel */
  width?: number;
  align?: 'left' | 'right' | 'center';
};

/** Valeur brute d'une cellule. Dates en ISO, pourcentages en fraction (0,25 = 25 %). */
export type ReportCell = string | number | null | undefined;

export type ReportSection = {
  title: string;
  columns: ReportColumn[];
  rows: ReportCell[][];
  /** Ligne de total (même nombre de colonnes) */
  totals?: ReportCell[];
  /** Lignes à mettre en évidence (ex. valeurs anormales, retards) */
  highlightRows?: number[];
  emptyText?: string;
  note?: string;
};

export type ReportKpi = {
  label: string;
  value: number | string;
  type?: ColType;
  hint?: string;
};

export type ReportResult = {
  kpis?: ReportKpi[];
  sections: ReportSection[];
  /** Remarques imprimées sous le rapport */
  notes?: string[];
};

export type PeriodMode = 'jour' | 'mois' | 'annee' | 'periode';

export type Period = {
  mode: PeriodMode;
  from: Date;
  to: Date;
  /** Libellé lisible, ex. « Mois d'octobre 2026 » */
  label: string;
  /** Pour les noms de fichiers, ex. 2026-10 */
  key: string;
};

export type ReportFilter = {
  key: string;
  label: string;
  /** Choix fixes (ex. « Tous ») */
  options: { value: string; label: string }[];
  /** Choix complémentaires chargés depuis la base (ex. liste du personnel) */
  loadOptions?: () => Promise<{ value: string; label: string }[]>;
  defaultValue: string;
};

export type ReportCategory = 'finances' | 'patients' | 'hospitalisation' | 'medical' | 'pharmacie' | 'laboratoire' | 'administration';

export type ReportContext = {
  period: Period | null;
  filters: Record<string, string>;
};

export type ReportDefinition = {
  id: string;
  category: ReportCategory;
  title: string;
  description: string;
  roles: RolePersonnel[];
  /** 'periode' : choix journée / mois / année / période ; 'aucune' : état à date */
  period: 'periode' | 'aucune';
  defaultMode?: PeriodMode;
  orientation?: 'portrait' | 'landscape';
  filters?: ReportFilter[];
  /** Cadres de signature du PDF (ex. « Le caissier ») */
  signatures?: string[];
  run: (ctx: ReportContext) => Promise<ReportResult>;
};
