// =====================================================
// Formatage et libellés communs à toute l'application
// =====================================================

/** Montant en francs congolais, séparateur de milliers « espace » (compatible PDF). */
export function formatMoney(value: number | string | null | undefined): string {
  const cleaned = typeof value === 'string' ? value.replace(/[^\d,.-]/g, '').replace(',', '.') : value;
  const n = Math.round(Number(cleaned || 0));
  const grouped = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0 ? '- ' : ''}${grouped} FC`;
}

export function formatDate(value?: string | Date | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
}

export function formatTime(value?: string | Date | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return '—';
  return `${formatDate(value)} à ${formatTime(value)}`;
}

/** Clé de date locale AAAA-MM-JJ (évite les décalages UTC de toISOString). */
export function toDateKey(value: string | Date = new Date()): string {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Début de la journée locale, en ISO (pour les filtres Supabase). */
export function startOfDayISO(value: string | Date = new Date()): string {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function endOfDayISO(value: string | Date = new Date()): string {
  const d = new Date(value);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/** Convertit une date ISO en valeur pour <input type="datetime-local">. */
export function toDateTimeLocal(value?: string | Date | null): string {
  if (!value) return '';
  const d = new Date(value);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

export function getAge(dateNaissance?: string | null): number | null {
  if (!dateNaissance) return null;
  const birth = new Date(dateNaissance);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function capitalize(text?: string | null): string {
  if (!text) return '';
  const t = String(text).replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Nombre de jours (entamés) entre deux dates, minimum 1. */
export function daysBetween(from: string | Date, to: string | Date = new Date()): number {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

/** Télécharge un tableau en CSV (séparateur « ; » pour Excel en français). */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const content = [headers, ...rows].map((r) => r.map(escape).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// =====================================================
// Libellés et couleurs des statuts
// =====================================================

type StatusStyle = { label: string; badge: string };

export const RDV_STATUTS: Record<string, StatusStyle> = {
  'planifié': { label: 'Planifié', badge: 'badge-info' },
  'confirmé': { label: 'Confirmé', badge: 'badge-success' },
  'en_cours': { label: 'En salle', badge: 'badge-warning' },
  'terminé': { label: 'Terminé', badge: 'badge-neutral' },
  'annulé': { label: 'Annulé', badge: 'badge-danger' },
  'absent': { label: 'Absent', badge: 'badge-danger' },
};

export const RDV_TYPES: Record<string, string> = {
  consultation: 'Consultation',
  suivi: 'Suivi',
  urgence: 'Urgence',
  examen: 'Examen',
};

export const LAB_STATUTS: Record<string, StatusStyle> = {
  'demandé': { label: 'Demandé', badge: 'badge-neutral' },
  'prélevé': { label: 'Prélevé', badge: 'badge-info' },
  'en_cours': { label: 'En analyse', badge: 'badge-warning' },
  'terminé': { label: 'Résultat disponible', badge: 'badge-success' },
  'annulé': { label: 'Annulé', badge: 'badge-danger' },
};

export const FACTURE_STATUTS: Record<string, StatusStyle> = {
  'en_attente': { label: 'En attente', badge: 'badge-warning' },
  'partielle': { label: 'Partielle', badge: 'badge-info' },
  'payée': { label: 'Payée', badge: 'badge-success' },
  'annulée': { label: 'Annulée', badge: 'badge-danger' },
};

export const HOSP_STATUTS: Record<string, StatusStyle> = {
  'actif': { label: 'Interné', badge: 'badge-success' },
  'sorti': { label: 'Sorti', badge: 'badge-neutral' },
  'transféré': { label: 'Transféré', badge: 'badge-info' },
  'décédé': { label: 'Décédé', badge: 'badge-danger' },
};

export const SUIVI_TYPES: Record<string, StatusStyle> = {
  observation: { label: 'Observation médicale', badge: 'badge-info' },
  visite: { label: 'Visite', badge: 'badge-purple' },
  soin: { label: 'Soin infirmier', badge: 'badge-success' },
  constantes: { label: 'Constantes', badge: 'badge-warning' },
  incident: { label: 'Incident', badge: 'badge-danger' },
};

export const MODES_PAIEMENT: Record<string, string> = {
  cash: 'Espèces',
  mobile_money: 'Mobile Money',
  carte: 'Carte bancaire',
  virement: 'Virement bancaire',
  'chèque': 'Chèque',
};

export const CATEGORIES_ACTES: Record<string, string> = {
  consultation: 'Consultation',
  hospitalisation: 'Hospitalisation',
  laboratoire: 'Laboratoire',
  imagerie: 'Imagerie',
  soin: 'Soins',
  chirurgie: 'Chirurgie',
  pharmacie: 'Pharmacie',
  autre: 'Autre',
};

export const MOUVEMENT_TYPES: Record<string, StatusStyle> = {
  'entrée': { label: 'Entrée', badge: 'badge-success' },
  'sortie': { label: 'Sortie', badge: 'badge-info' },
  'ajustement': { label: 'Ajustement', badge: 'badge-warning' },
  'péremption': { label: 'Retrait périmé', badge: 'badge-danger' },
};

export function statusBadge(map: Record<string, StatusStyle>, statut?: string | null): StatusStyle {
  return map[statut || ''] || { label: capitalize(statut) || '—', badge: 'badge-neutral' };
}

/** Message d'erreur lisible, avec une aide si la migration SQL n'a pas été exécutée. */
export function explainDbError(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return 'Erreur inconnue.';
  const msg = error.message || '';
  if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|Could not find the table/i.test(msg)) {
    return "Cette fonctionnalité nécessite la mise à jour de la base de données. Exécutez le script supabase/migrations/20261009_fonctionnalites_completes.sql dans Supabase.";
  }
  if (error.code === 'PGRST204' || /column .* (does not exist|of .* in the schema cache)/i.test(msg)) {
    return "Colonne manquante en base : exécutez le script supabase/migrations/20261009_fonctionnalites_completes.sql dans Supabase.";
  }
  if (/value too long/i.test(msg)) {
    return "Texte trop long pour la base actuelle : exécutez le script supabase/migrations/20261009_fonctionnalites_completes.sql dans Supabase.";
  }
  return msg;
}
