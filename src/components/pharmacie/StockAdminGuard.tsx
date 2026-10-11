'use client';

import Link from 'next/link';
import { ShieldAlert, Loader2, ArrowLeft } from 'lucide-react';
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
      <div role="alert" style={{
        maxWidth: 640, margin: '48px auto', padding: '32px 36px', textAlign: 'center',
        background: 'var(--danger-50)', border: '1px solid var(--danger-200)', borderTop: '4px solid var(--danger-600)', borderRadius: 12,
      }}>
        <ShieldAlert size={44} style={{ color: 'var(--danger-600)', margin: '0 auto 12px' }} />
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--danger-600)' }}>Accès refusé</div>
        <h3 style={{ margin: '6px 0 12px', fontSize: 20, color: 'var(--danger-600)' }}>Opération réservée à l&apos;administration</h3>
        <p style={{ color: 'var(--neutral-700)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          Vous ne disposez pas des autorisations nécessaires pour effectuer cette opération. Conformément à la politique de
          contrôle interne de l&apos;établissement (séparation des tâches), l&apos;ajout et la modification des médicaments,
          les entrées de stock, les ajustements d&apos;inventaire et les retraits sont exclusivement réservés au
          super administrateur et à l&apos;administrateur.
        </p>
        <p style={{ color: 'var(--neutral-500)', fontSize: 13, marginTop: 12 }}>
          Pour toute demande, veuillez contacter l&apos;administration de l&apos;hôpital.
        </p>
        <Link href="/pharmacie" className="btn btn-outline" style={{ marginTop: 20 }}><ArrowLeft size={16} /> Retour à la pharmacie</Link>
      </div>
    );
  }
  return <>{children}</>;
}
