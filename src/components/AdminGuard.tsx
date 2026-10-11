'use client';

import Link from 'next/link';
import { ShieldAlert, Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

/** Vrai pour les rôles d'administration (super administrateur et administrateur). */
export const isAdminRole = (role?: string | null) => role === 'super_admin' || role === 'admin';

/** Bandeau rouge « Accès restreint — consultation seule », affiché aux rôles non administrateurs. */
export function RestrictionBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="alert alert-danger" role="alert" style={{ marginBottom: 16, alignItems: 'flex-start' }}>
      <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: 2 }} />
      <div>
        <strong>Accès restreint — consultation seule.</strong>
        <div style={{ marginTop: 4, fontSize: 13 }}>{children}</div>
      </div>
    </div>
  );
}

/**
 * Protège une page réservée au super administrateur et à l'administrateur :
 * les autres rôles voient un message de refus d'accès professionnel.
 */
export default function AdminGuard({ children, operations, backHref, backLabel, allowed = isAdminRole, reservedTo = "au super administrateur et à l'administrateur" }: {
  children: React.ReactNode;
  /** Règle d'accès (par défaut : super administrateur et administrateur) */
  allowed?: (role?: string | null) => boolean;
  /** Bénéficiaires, ex. « au personnel d'accueil et soignant » */
  reservedTo?: string;
  /** Opérations concernées, ex. « l'ajout et la modification des chambres et des lits » */
  operations: string;
  backHref: string;
  backLabel: string;
}) {
  const { profile } = useAuth();
  if (!profile) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={24} className="animate-spin" /></div>;
  }
  if (!allowed(profile.role)) {
    return (
      <div role="alert" style={{
        maxWidth: 640, margin: '48px auto', padding: '32px 36px', textAlign: 'center',
        background: 'var(--danger-50)', border: '1px solid var(--danger-200)', borderTop: '4px solid var(--danger-600)', borderRadius: 12,
      }}>
        <ShieldAlert size={44} style={{ color: 'var(--danger-600)', margin: '0 auto 12px' }} />
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--danger-600)' }}>Accès refusé</div>
        <h3 style={{ margin: '6px 0 12px', fontSize: 20, color: 'var(--danger-600)' }}>Opération non autorisée pour votre fonction</h3>
        <p style={{ color: 'var(--neutral-700)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          Vous ne disposez pas des autorisations nécessaires pour effectuer cette opération. Conformément à la politique de
          contrôle interne de l&apos;établissement (séparation des tâches), {operations} sont exclusivement réservés {reservedTo}.
        </p>
        <p style={{ color: 'var(--neutral-500)', fontSize: 13, marginTop: 12 }}>
          Pour toute demande, veuillez contacter l&apos;administration de l&apos;hôpital.
        </p>
        <Link href={backHref} className="btn btn-outline" style={{ marginTop: 20 }}><ArrowLeft size={16} /> {backLabel}</Link>
      </div>
    );
  }
  return <>{children}</>;
}
