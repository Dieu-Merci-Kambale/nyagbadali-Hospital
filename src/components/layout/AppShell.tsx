'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from './Sidebar';
import Header from './Header';
import { Loader2, Heart } from 'lucide-react';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Tablettes et téléphones : la navigation s'ouvre en tiroir par-dessus le contenu
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)');
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Fermer le tiroir après chaque navigation
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Bloquer le défilement de la page et fermer avec Échap quand le tiroir est ouvert
  useEffect(() => {
    if (!mobileNavOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileNavOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [mobileNavOpen]);

  const isLoginPage = pathname === '/login';

  // Loading state — afficher un écran de chargement
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0c4a6e 100%)',
        gap: 20,
      }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #3b82f6, #10b981)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 32px rgba(59, 130, 246, 0.35)',
        }}>
          <Heart size={30} color="white" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(255,255,255,0.7)' }}>
          <Loader2 size={20} className="animate-spin" />
          <span style={{ fontSize: 14, fontWeight: 500 }}>Chargement...</span>
        </div>
      </div>
    );
  }

  // Page login → pas de sidebar ni header
  if (isLoginPage) {
    return <>{children}</>;
  }

  // Non authentifié et pas sur login → le AuthContext va rediriger
  if (!isAuthenticated) {
    return null;
  }

  // Authentifié → layout complet avec sidebar + header
  return (
    <div className="app-layout">
      <Sidebar
        collapsed={sidebarCollapsed && !compact}
        onToggle={() => setSidebarCollapsed((value) => !value)}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />
      <div
        className={`sidebar-backdrop ${mobileNavOpen ? 'visible' : ''}`}
        onClick={() => setMobileNavOpen(false)}
        aria-hidden="true"
      />
      <div className={`main-content ${sidebarCollapsed && !compact ? 'sidebar-collapsed' : ''}`}>
        <Header onOpenMenu={() => setMobileNavOpen(true)} />
        <main className="page-content">
          <div className="page-surface">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
