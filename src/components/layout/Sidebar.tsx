'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { getAccessibleModules, roleLabels } from '@/lib/role-permissions';
import type { AppModule } from '@/lib/role-permissions';
import {
  LayoutDashboard,
  Users,
  UserCog,
  CalendarDays,
  Stethoscope,
  Pill,
  FlaskConical,
  Receipt,
  BedDouble,
  Ambulance,
  Package,
  BarChart3,
  Settings,
  Heart,
  LogOut,
} from 'lucide-react';

// =====================================================
// Configuration de la navigation complète
// =====================================================

interface NavItemConfig {
  module: AppModule;
  label: string;
  href: string;
  icon: React.ReactNode;
  section: string;
}

const allNavItems: NavItemConfig[] = [
  // Principal
  { module: 'dashboard', label: 'Tableau de bord', href: '/', icon: <LayoutDashboard size={20} />, section: 'Principal' },
  { module: 'patients', label: 'Patients', href: '/patients', icon: <Users size={20} />, section: 'Principal' },
  { module: 'rendez-vous', label: 'Rendez-vous', href: '/rendez-vous', icon: <CalendarDays size={20} />, section: 'Principal' },
  // Clinique
  { module: 'consultations', label: 'Consultations', href: '/consultations', icon: <Stethoscope size={20} />, section: 'Clinique' },
  { module: 'hospitalisation', label: 'Hospitalisation', href: '/hospitalisation', icon: <BedDouble size={20} />, section: 'Clinique' },
  { module: 'urgences', label: 'Urgences', href: '/urgences', icon: <Ambulance size={20} />, section: 'Clinique' },
  { module: 'chambres', label: 'Chambres & Lits', href: '/chambres', icon: <BedDouble size={20} />, section: 'Clinique' },
  // Support Médical
  { module: 'pharmacie', label: 'Pharmacie', href: '/pharmacie', icon: <Pill size={20} />, section: 'Support Médical' },
  { module: 'laboratoire', label: 'Laboratoire', href: '/laboratoire', icon: <FlaskConical size={20} />, section: 'Support Médical' },
  // Administration
  { module: 'personnel', label: 'Personnel', href: '/personnel', icon: <UserCog size={20} />, section: 'Administration' },
  { module: 'facturation', label: 'Facturation', href: '/facturation', icon: <Receipt size={20} />, section: 'Administration' },
  { module: 'inventaire', label: 'Inventaire', href: '/inventaire', icon: <Package size={20} />, section: 'Administration' },
  { module: 'rapports', label: 'Rapports', href: '/rapports', icon: <BarChart3 size={20} />, section: 'Administration' },
  // Système
  { module: 'parametres', label: 'Paramètres', href: '/parametres', icon: <Settings size={20} />, section: 'Système' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { profile, logout } = useAuth();

  // Obtenir les modules accessibles pour le rôle de l'utilisateur
  const accessibleModules = profile ? getAccessibleModules(profile.role) : [];

  // Filtrer les items de navigation selon les permissions
  const visibleItems = allNavItems.filter(item => accessibleModules.includes(item.module));

  // Grouper par section
  const sections = visibleItems.reduce<Record<string, NavItemConfig[]>>((acc, item) => {
    if (!acc[item.section]) acc[item.section] = [];
    acc[item.section].push(item);
    return acc;
  }, {});

  // Initiales de l'utilisateur
  const initials = profile
    ? `${profile.prenom[0]}${profile.nom[0]}`.toUpperCase()
    : '??';

  // Titre du rôle
  const roleLabel = profile ? roleLabels[profile.role] : '';

  // Préfixe du nom (Dr. pour les médecins)
  const namePrefix = profile?.role.startsWith('medecin') ? 'Dr. ' : '';

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon" style={{ background: 'transparent', overflow: 'hidden' }}>
          <Image src="/logo.png" alt="Logo Nyagbadali" width={200} height={200} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.3)' }} unoptimized />
        </div>
        <div className="sidebar-logo-text">
          <h1>Nyagbadali</h1>
          <span>Gestion Hospitalière</span>
        </div>
      </div>

      {/* Navigation filtrée par rôle */}
      <nav className="sidebar-nav">
        {Object.entries(sections).map(([sectionTitle, items]) => (
          <div key={sectionTitle}>
            <div className="sidebar-section-title">{sectionTitle}</div>
            {items.map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== '/' && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`sidebar-link ${isActive ? 'active' : ''}`}
                >
                  <span className="sidebar-link-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User Profile + Logout */}
      <div className="sidebar-user">
        <div className="sidebar-user-avatar">{initials}</div>
        <div className="sidebar-user-info">
          <p>{namePrefix}{profile?.prenom} {profile?.nom}</p>
          <span>{roleLabel}</span>
        </div>
        <button
          onClick={logout}
          title="Se déconnecter"
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.4)',
            cursor: 'pointer',
            padding: 6,
            borderRadius: 8,
            transition: 'all 0.2s',
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = '#ef4444';
            (e.currentTarget as HTMLElement).style.background = 'rgba(239, 68, 68, 0.15)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)';
            (e.currentTarget as HTMLElement).style.background = 'none';
          }}
          id="btn-logout"
        >
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}
