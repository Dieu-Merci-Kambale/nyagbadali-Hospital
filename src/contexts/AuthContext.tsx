'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { hasRouteAccess, getDefaultRoute, roleLabels } from '@/lib/role-permissions';
import type { RolePersonnel } from '@/types';
import type { User, Session } from '@supabase/supabase-js';

// =====================================================
// Types
// =====================================================

export interface UserProfile {
  id: string;
  code_personnel: string;
  nom: string;
  prenom: string;
  email: string;
  role: RolePersonnel;
  specialite?: string;
  departement_id?: string;
  departement_nom?: string;
  photo_url?: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

// =====================================================
// Context
// =====================================================

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  login: async () => ({ error: null }),
  logout: async () => {},
  isAuthenticated: false,
});

export function useAuth() {
  return useContext(AuthContext);
}

// =====================================================
// Provider
// =====================================================

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Récupérer le profil personnel à partir de l'email de l'utilisateur auth
  const fetchProfile = useCallback(async (authUser: User) => {
    try {
      const { data, error } = await supabase
        .from('personnel')
        .select('id, code_personnel, nom, prenom, email, role, specialite, departement_id')
        .eq('email', authUser.email!)
        .eq('statut', 'actif')
        .single();

      if (error || !data) {
        console.error('Profil personnel non trouvé pour:', authUser.email);
        return null;
      }

      // Récupérer le nom du département si lié
      let departement_nom: string | undefined;
      if (data.departement_id) {
        const { data: dept } = await supabase
          .from('departements')
          .select('nom')
          .eq('id', data.departement_id)
          .single();
        departement_nom = dept?.nom;
      }

      const userProfile: UserProfile = {
        id: data.id,
        code_personnel: data.code_personnel,
        nom: data.nom,
        prenom: data.prenom,
        email: data.email,
        role: data.role as RolePersonnel,
        specialite: data.specialite || undefined,
        departement_id: data.departement_id || undefined,
        departement_nom,
      };

      return userProfile;
    } catch (err) {
      console.error('Erreur lors de la récupération du profil:', err);
      return null;
    }
  }, []);

  // Initialisation: vérifier la session existante
  useEffect(() => {
    async function initAuth() {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        setUser(session.user);
        const p = await fetchProfile(session.user);
        setProfile(p);
      }
      setLoading(false);
    }

    initAuth();

    // Écouter les changements d'état d'authentification
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user);
          const p = await fetchProfile(session.user);
          setProfile(p);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfile(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // Protection des routes: rediriger si non autorisé
  useEffect(() => {
    if (loading) return;

    const isLoginPage = pathname === '/login';

    // Non connecté et pas sur la page login → rediriger vers login
    if (!user && !isLoginPage) {
      router.replace('/login');
      return;
    }

    // Connecté et sur la page login → rediriger vers le dashboard
    if (user && profile && isLoginPage) {
      router.replace(getDefaultRoute(profile.role));
      return;
    }

    // Connecté mais pas d'accès à cette route → rediriger vers la route par défaut
    if (user && profile && !isLoginPage && !hasRouteAccess(profile.role, pathname)) {
      router.replace(getDefaultRoute(profile.role));
      return;
    }
  }, [user, profile, loading, pathname, router]);

  // Fonction de connexion
  const login = async (email: string, password: string): Promise<{ error: string | null }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Messages d'erreur en français
        if (error.message.includes('Invalid login credentials')) {
          return { error: 'Email ou mot de passe incorrect.' };
        }
        if (error.message.includes('Email not confirmed')) {
          return { error: "Votre email n'a pas encore été confirmé." };
        }
        return { error: error.message };
      }

      if (data.user) {
        // Vérifier que l'utilisateur a un profil personnel actif
        const p = await fetchProfile(data.user);
        if (!p) {
          await supabase.auth.signOut();
          return { error: "Aucun profil personnel actif n'est associé à cet email. Contactez l'administrateur." };
        }
        setProfile(p);
      }

      return { error: null };
    } catch (err) {
      return { error: 'Une erreur inattendue est survenue.' };
    }
  };

  // Fonction de déconnexion
  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    router.replace('/login');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        login,
        logout,
        isAuthenticated: !!user && !!profile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
