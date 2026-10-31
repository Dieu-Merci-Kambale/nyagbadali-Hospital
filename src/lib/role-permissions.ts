import type { RolePersonnel } from '@/types';

// =====================================================
// Définition des routes/modules de l'application
// =====================================================
export type AppModule =
  | 'dashboard'
  | 'patients'
  | 'rendez-vous'
  | 'consultations'
  | 'hospitalisation'
  | 'chambres'
  | 'pharmacie'
  | 'laboratoire'
  | 'personnel'
  | 'facturation'
  | 'depenses'
  | 'assurances'
  | 'departements'
  | 'rapports'
  | 'statistiques'
  | 'audit'
  | 'demandes-modification'
  | 'profil';

// Mapping module → route
export const moduleRoutes: Record<AppModule, string> = {
  'dashboard': '/',
  'patients': '/patients',
  'rendez-vous': '/rendez-vous',
  'consultations': '/consultations',
  'hospitalisation': '/hospitalisation',
  'chambres': '/chambres',
  'pharmacie': '/pharmacie',
  'laboratoire': '/laboratoire',
  'personnel': '/personnel',
  'facturation': '/facturation',
  'depenses': '/depenses',
  'assurances': '/assurances',
  'departements': '/departements',
  'rapports': '/rapports',
  'statistiques': '/statistiques',
  'audit': '/audit',
  'demandes-modification': '/demandes-modification',
  'profil': '/profil',
};

// =====================================================
// Matrice des permissions par rôle
// =====================================================
// Chaque rôle a une liste de modules auxquels il a accès.
// Le super_admin a accès à tout par défaut.
// =====================================================

const rolePermissions: Record<RolePersonnel, AppModule[]> = {
  super_admin: [
    'dashboard', 'patients', 'rendez-vous', 'consultations', 'hospitalisation',
    'chambres', 'pharmacie', 'laboratoire', 'assurances', 'personnel', 'facturation', 'depenses',
    'departements', 'rapports', 'statistiques', 'audit', 'demandes-modification', 'profil',
  ],
  admin: [
    'dashboard', 'patients', 'rendez-vous', 'pharmacie', 'chambres', 'laboratoire',
    'assurances', 'personnel', 'facturation', 'depenses', 'departements', 'rapports', 'statistiques', 'audit', 'demandes-modification', 'profil',
  ],
  medecin_chef: [
    'dashboard', 'patients', 'rendez-vous', 'consultations', 'hospitalisation',
    'chambres', 'pharmacie', 'laboratoire', 'rapports', 'statistiques', 'demandes-modification', 'profil',
  ],
  medecin: [
    'dashboard', 'patients', 'rendez-vous', 'consultations', 'hospitalisation',
    'chambres', 'laboratoire', 'demandes-modification', 'profil',
  ],
  infirmier_chef: [
    'dashboard', 'patients', 'rendez-vous', 'consultations', 'hospitalisation',
    'chambres', 'demandes-modification', 'profil',
  ],
  infirmier: [
    'dashboard', 'patients', 'rendez-vous', 'consultations', 'hospitalisation',
    'chambres', 'demandes-modification', 'profil',
  ],
  technicien_labo: [
    'dashboard', 'patients', 'laboratoire', 'demandes-modification', 'profil',
  ],
  pharmacien: [
    'dashboard', 'pharmacie', 'demandes-modification', 'profil',
  ],
  caissier: [
    'dashboard', 'facturation', 'depenses', 'assurances', 'demandes-modification', 'profil',
  ],
  receptionniste: [
    'dashboard', 'patients', 'rendez-vous', 'demandes-modification', 'profil',
  ],
};

// =====================================================
// Fonctions utilitaires
// =====================================================

/** Rôles autorisés à créer et modifier les dossiers patients (les autres consultent seulement). */
const PATIENT_EDITORS: RolePersonnel[] = ['super_admin', 'admin', 'medecin_chef', 'medecin', 'infirmier_chef', 'infirmier', 'receptionniste'];

export function canManagePatients(role?: RolePersonnel | null): boolean {
  return !!role && PATIENT_EDITORS.includes(role);
}

/** Rôles qui traitent les analyses (prélèvement, résultats, validation) ; les médecins demandent et consultent. */
const LAB_PROCESSORS: RolePersonnel[] = ['super_admin', 'technicien_labo'];

export function canProcessLab(role?: RolePersonnel | null): boolean {
  return !!role && LAB_PROCESSORS.includes(role);
}

/** Rôles qui demandent des examens (mêmes rôles que la fonction creer_demande_laboratoire de la base). */
const LAB_REQUESTERS: RolePersonnel[] = ['super_admin', 'medecin_chef', 'medecin', 'infirmier_chef', 'infirmier', 'technicien_labo'];

export function canRequestLab(role?: RolePersonnel | null): boolean {
  return !!role && LAB_REQUESTERS.includes(role);
}

/** Seuls les administrateurs enregistrent et modifient les assureurs (le caissier gère les factures, règlements et litiges). */
export function canManageAssureurs(role?: RolePersonnel | null): boolean {
  return role === 'super_admin' || role === 'admin';
}

/** Annulation d'un règlement d'assureur ou d'un bordereau déjà envoyé : administration uniquement. */
export function canCancelOperationAssurance(role?: RolePersonnel | null): boolean {
  return role === 'super_admin' || role === 'admin';
}

/** Seuls les administrateurs enregistrent les actes et examens du catalogue et fixent leurs prix. */
export function canManageTarifs(role?: RolePersonnel | null): boolean {
  return role === 'super_admin' || role === 'admin';
}

/** Seuls les administrateurs suppriment une facture, et seulement une facture annulée sans paiement. */
export function canDeleteFacture(role: RolePersonnel | null | undefined, facture: { statut: string; paiements?: unknown[] | null }): boolean {
  return (role === 'super_admin' || role === 'admin') && facture.statut === 'annulée' && !(facture.paiements || []).length;
}

/** Une dépense enregistrée ne se modifie ou ne s'annule que par l'administration (le caissier enregistre). */
export function canEditDepense(role: RolePersonnel | null | undefined, depense: { statut: string }): boolean {
  return (role === 'super_admin' || role === 'admin') && depense.statut !== 'annulée';
}

/** Seuls les administrateurs suppriment une dépense, et seulement une dépense annulée. */
export function canDeleteDepense(role: RolePersonnel | null | undefined, depense: { statut: string }): boolean {
  return (role === 'super_admin' || role === 'admin') && depense.statut === 'annulée';
}

/**
 * Vérifie si un rôle donné a accès à un module spécifique.
 */
export function hasAccess(role: RolePersonnel, module: AppModule): boolean {
  return rolePermissions[role]?.includes(module) ?? false;
}

/**
 * Retourne la liste des modules accessibles pour un rôle donné.
 */
export function getAccessibleModules(role: RolePersonnel): AppModule[] {
  return rolePermissions[role] || [];
}

/**
 * Vérifie si un rôle a accès à une route donnée.
 */
export function hasRouteAccess(role: RolePersonnel, pathname: string): boolean {
  // La page login est toujours accessible
  if (pathname === '/login') return true;

  // Trouver le module correspondant à la route
  for (const [module, route] of Object.entries(moduleRoutes)) {
    if (route === '/' && pathname === '/') {
      return hasAccess(role, module as AppModule);
    }
    if (route !== '/' && pathname.startsWith(route)) {
      return hasAccess(role, module as AppModule);
    }
  }

  // Routes inconnues: refuser par défaut
  return false;
}

/**
 * Retourne la première route accessible pour un rôle donné.
 * Utile pour la redirection après login.
 */
export function getDefaultRoute(role: RolePersonnel): string {
  const modules = getAccessibleModules(role);
  if (modules.length > 0) {
    return moduleRoutes[modules[0]];
  }
  return '/';
}

/**
 * Libellé lisible pour chaque rôle
 */
export const roleLabels: Record<RolePersonnel, string> = {
  super_admin: 'Super Administrateur',
  admin: 'Administrateur',
  medecin_chef: 'Médecin Chef',
  medecin: 'Médecin',
  infirmier_chef: 'Infirmier(e) Chef',
  infirmier: 'Infirmier(e)',
  technicien_labo: 'Technicien de Laboratoire',
  pharmacien: 'Pharmacien(ne)',
  caissier: 'Caissier(e)',
  receptionniste: 'Réceptionniste',
};
