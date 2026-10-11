'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

type Options = {
  /** Filtre Supabase Realtime, ex. `facture_id=eq.<uuid>` (appliqué à toutes les tables) */
  filter?: string;
  /** Intervalle de secours en millisecondes (0 = désactivé) */
  pollMs?: number;
};

/**
 * Garde une page à jour quand d'autres postes modifient les données :
 *  1. temps réel Supabase (si les tables sont publiées dans supabase_realtime) ;
 *  2. rechargement au retour sur l'onglet ou la fenêtre ;
 *  3. rechargement périodique de secours.
 * Plusieurs changements rapprochés ne déclenchent qu'un seul rechargement.
 */
export function useLiveRefresh(refresh: () => void, tables: string[], options: Options = {}) {
  const { filter, pollMs = 30_000 } = options;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const tablesKey = tables.join(',');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => refreshRef.current(), 400);
    };

    // 1. Temps réel
    const channel = supabase.channel(`live-${tablesKey}-${filter || 'all'}-${Math.random().toString(36).slice(2, 8)}`);
    tablesKey.split(',').filter(Boolean).forEach((table) => {
      channel.on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) } as never,
        schedule as never
      );
    });
    channel.subscribe();

    // 2. Retour sur la page
    const onVisible = () => {
      if (document.visibilityState === 'visible') schedule();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    // 3. Secours périodique (seulement si l'onglet est visible)
    const interval = pollMs > 0
      ? setInterval(() => { if (document.visibilityState === 'visible') refreshRef.current(); }, pollMs)
      : null;

    return () => {
      if (timer) clearTimeout(timer);
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      supabase.removeChannel(channel);
    };
  }, [tablesKey, filter, pollMs]);
}
