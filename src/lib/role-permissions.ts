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
  | 'urgences'
  | 'chambres'
  | 'pharmacie'
  | 'laboratoire'
  | 'personnel'
  | 'facturation'
  | 'inventaire'
  | 'rapports'
  | 'parametres';

// Mapping module → route
export const moduleRoutes: Record<AppModule, string> = {
  'dashboard': '/',
  'patients': '/patients',
  'rendez-vous': '/rendez-vous',
  'consultations': '/consultations',
  'hospitalisation': '/hospitalisation',
  'urgences': '/urgences',
  'chambres': '/chambres',
  'pharmacie': '/pharmacie',
  'laboratoire': '/laboratoire',
  'personnel': '/personnel',
  'facturation': '/facturation',
  'inventaire': '/inventaire',
  'rapports': '/rapports',
  'parametres': '/parametres',
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
    'urgences', 'chambres', 'pharmacie', 'laboratoire', 'personnel', 'facturation',
    'inventaire', 'rapports', 'parametres',
  ],
  admin: [
    'dashboard', 'patients', 'rendez-vous', 'pharmacie', 'chambres',
    'personnel', 'facturation', 'inventaire', 'rapports', 'parametres',
  ],
  medecin_chef: [
    'dashboard', 'patients', 'rendez-vous', 'consultations', 'hospitalisation',
    'urgences', 'chambres', 'pharmacie', 'laboratoire', 'rapports',
  ],
  medecin: [
    'dashboard', 'patients', 'rendez-vous', 'consultations', 'hospitalisation',
    'urgences', 'chambres', 'pharmacie', 'laboratoire',
  ],
  infirmier_chef: [
    'dashboard', 'patients', 'rendez-vous', 'consultations', 'hospitalisation',
    'urgences', 'chambres', 'rapports',
  ],
  infirmier: [
    'dashboard', 'patients', 'rendez-vous', 'consultations', 'hospitalisation',
    'urgences', 'chambres',
  ],
  technicien_labo: [
    'dashboard', 'patients', 'laboratoire',
  ],
  pharmacien: [
    'dashboard', 'pharmacie', 'inventaire',
  ],
  caissier: [
    'dashboard', 'facturation',
  ],
  receptionniste: [
    'dashboard', 'patients', 'rendez-vous',
  ],
};

// =====================================================
// Fonctions utilitaires
// =====================================================

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
