'use client';

import { Search, Bell, Settings, Calendar, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { roleLabels } from '@/lib/role-permissions';

export default function Header() {
  const { profile, logout } = useAuth();
  const today = new Date();
  const dateStr = today.toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <header className="header">
      {/* Search */}
      <div className="header-search">
        <Search className="header-search-icon" />
        <input
          type="text"
          placeholder="Rechercher un patient, médecin, dossier..."
          id="global-search"
        />
      </div>

      {/* Right Actions */}
      <div className="header-right">
        <div className="header-date">
          <Calendar size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
          {dateStr}
        </div>

        <button className="header-btn" title="Notifications" id="btn-notifications">
          <Bell size={20} />
          <span className="header-btn-badge"></span>
        </button>

        <button className="header-btn" title="Paramètres" id="btn-settings">
          <Settings size={20} />
        </button>

        {/* User badge */}
        {profile && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginLeft: 8,
            paddingLeft: 16,
            borderLeft: '1px solid var(--neutral-200)',
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
          </div>
        )}
      </div>
    </header>
  );
}
