'use client';

import AdminGuard, { isAdminRole } from '@/components/AdminGuard';

/** Vrai pour les rôles autorisés à gérer le stock (fiches, entrées, ajustements, retraits). */
export const canManageStock = isAdminRole;

/**
 * Protège les pages de création / modification des médicaments :
 * séparation des tâches, le pharmacien délivre mais ne gère pas le stock.
 */
export default function StockAdminGuard({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard
      operations="l'ajout et la modification des médicaments, les entrées de stock, les ajustements d'inventaire et les retraits"
      backHref="/pharmacie"
      backLabel="Retour à la pharmacie"
    >
      {children}
    </AdminGuard>
  );
}
