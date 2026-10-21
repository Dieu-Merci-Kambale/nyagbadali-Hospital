'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Building2, FileWarning, FileStack, Banknote, Scale, FileSpreadsheet, ArrowLeft } from 'lucide-react';

const ONGLETS = [
  { href: '/assurances', label: "Vue d'ensemble", icon: <LayoutDashboard size={15} />, exact: true },
  { href: '/assurances/assureurs', label: 'Assureurs', icon: <Building2 size={15} /> },
  { href: '/assurances/creances', label: 'Créances', icon: <FileWarning size={15} /> },
  { href: '/assurances/bordereaux', label: 'Bordereaux', icon: <FileStack size={15} /> },
  { href: '/assurances/reglements', label: 'Règlements', icon: <Banknote size={15} /> },
  { href: '/assurances/litiges', label: 'Litiges', icon: <Scale size={15} /> },
  { href: '/assurances/rapports', label: 'Rapports', icon: <FileSpreadsheet size={15} /> },
];

type Props = {
  title: string;
  subtitle?: string;
  /** Boutons d'action à droite du titre */
  actions?: React.ReactNode;
  /** Lien de retour (pages de détail) */
  backHref?: string;
};

/** En-tête commun aux pages du module Assurances : titre, actions et onglets de navigation. */
export default function AssuranceHeader({ title, subtitle, actions, backHref }: Props) {
  const pathname = usePathname();
  const actif = (o: (typeof ONGLETS)[number]) => (o.exact ? pathname === o.href : pathname.startsWith(o.href));

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {backHref && (
            <Link href={backHref} className="btn btn-ghost" title="Retour">
              <ArrowLeft size={18} />
            </Link>
          )}
          <div>
            <h1 className="page-title">{title}</h1>
            {subtitle && <p className="page-subtitle">{subtitle}</p>}
          </div>
        </div>
        {actions && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{actions}</div>}
      </div>
      <nav className="tabs" style={{ overflowX: 'auto', marginBottom: 20 }} aria-label="Module Assurances">
        {ONGLETS.map((o) => (
          <Link
            key={o.href}
            href={o.href}
            className={`tab ${actif(o) ? 'active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', textDecoration: 'none' }}
          >
            {o.icon} {o.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
