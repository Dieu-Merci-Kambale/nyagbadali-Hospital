'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from './Sidebar';
import Header from './Header';
import { Loader2, Heart } from 'lucide-react';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const pathname = usePathname();

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
      <Sidebar />
      <div className="main-content">
        <Header />
        <main className="page-content">
          {children}
        </main>
      </div>
    </div>
  );
}
