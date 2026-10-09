'use client';

import Link from 'next/link';
import { Settings, Calendar } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { roleLabels } from '@/lib/role-permissions';
import GlobalSearch from './GlobalSearch';
import NotificationsBell from './NotificationsBell';

export default function Header() {
  const { profile } = useAuth();
  const today = new Date();
  const dateStr = today.toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <header className="header">
      {/* Recherche globale */}
      <GlobalSearch />

      {/* Actions */}
      <div className="header-right">
        <div className="header-date">
          <Calendar size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
          {dateStr}
        </div>

        <NotificationsBell />

        <Link href="/profil" className="header-btn" title="Mon profil & paramètres" id="btn-settings">
          <Settings size={20} />
        </Link>

        {/* Utilisateur */}
        {profile && (
          <Link href="/profil" style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginLeft: 8,
            paddingLeft: 16,
            borderLeft: '1px solid var(--neutral-200)',
            textDecoration: 'none',
          }}>
            <div style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--primary-500), var(--accent-500))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: 12,
              fontWeight: 700,
            }}>
              {profile.prenom[0]}{profile.nom[0]}
            </div>
            <div style={{ lineHeight: 1.3 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--neutral-800)' }}>
                {profile.role.startsWith('medecin') ? 'Dr. ' : ''}{profile.prenom} {profile.nom}
              </div>
              <div style={{ fontSize: 10, color: 'var(--neutral-400)', fontWeight: 500 }}>
                {roleLabels[profile.role]}
              </div>
            </div>
          </Link>
        )}
      </div>
    </header>
  );
}
