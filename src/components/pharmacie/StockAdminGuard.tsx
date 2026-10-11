'use client';

import Link from 'next/link';
import { Lock, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

/** Vrai pour les rôles autorisés à gérer le stock (fiches, entrées, ajustements, retraits). */
export const canManageStock = (role?: string | null) => role === 'super_admin' || role === 'admin';

/**
 * Protège les pages de création / modification des médicaments :
 * séparation des tâches, le pharmacien délivre mais ne gère pas le stock.
 */
export default function StockAdminGuard({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  if (!profile) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>;
  }
  if (!canManageStock(profile.role)) {
    return (
      <div className="empty-state" style={{ marginTop: 40 }}>
        <Lock className="empty-state-icon" />
        <h3>Accès réservé à l&apos;administration</h3>
        <p>
          L&apos;ajout et la modification des médicaments, les entrées, les ajustements d&apos;inventaire et les retraits de stock
          sont réservés au super administrateur et à l&apos;administrateur (séparation des tâches).
        </p>
        <Link href="/pharmacie" className="btn btn-outline" style={{ marginTop: 16 }}>Retour à la pharmacie</Link>
      </div>
    );
  }
  return <>{children}</>;
}
