import type { RolePersonnel } from '@/types';
import type { ReportCategory, ReportDefinition } from './types';
import { FINANCE_REPORTS } from './finances';
import { DEPENSE_REPORTS } from './depenses';
import { ASSURANCE_REPORTS } from './assurances';
import { PATIENT_REPORTS } from './patients';
import { MEDICAL_REPORTS } from './medical';
import { PHARMACIE_REPORTS } from './pharmacie';
import { LAB_REPORTS, ADMIN_REPORTS } from './laboratoire';

export const REPORTS: ReportDefinition[] = [
  ...FINANCE_REPORTS,
  ...DEPENSE_REPORTS,
  ...ASSURANCE_REPORTS,
  ...PATIENT_REPORTS,
  ...MEDICAL_REPORTS,
  ...PHARMACIE_REPORTS,
  ...LAB_REPORTS,
  ...ADMIN_REPORTS,
];

export const CATEGORIES: { key: ReportCategory; label: string; description: string }[] = [
  { key: 'finances', label: 'Finances', description: 'Caisse, facturation, dépenses et créances' },
  { key: 'assurances', label: 'Assurances', description: 'Relevés des assureurs, balance âgée, règlements, bordereaux et litiges' },
  { key: 'patients', label: 'Patients', description: 'Registres et nouveaux patients' },
  { key: 'hospitalisation', label: 'Hospitalisation', description: 'Internés, admissions, sorties et lits' },
  { key: 'medical', label: 'Activité médicale', description: 'Consultations, morbidité et rendez-vous' },
  { key: 'pharmacie', label: 'Pharmacie', description: 'Stocks, péremptions et consommation' },
  { key: 'laboratoire', label: 'Laboratoire', description: 'Examens, délais et résultats' },
  { key: 'administration', label: 'Administration', description: 'Personnel et traçabilité' },
];

export const reportsForRole = (role?: RolePersonnel | null) =>
  role ? REPORTS.filter((r) => r.roles.includes(role)) : [];

export type { ReportDefinition, ReportResult, ReportSection, ReportKpi, Period, PeriodMode } from './types';
