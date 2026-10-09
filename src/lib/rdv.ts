import { supabase } from '@/lib/supabase';

export type RdvConflict = {
  id: string;
  date_heure: string;
  duree_minutes: number | null;
  patients?: { nom: string; prenom: string } | null;
};

/**
 * Cherche un rendez-vous du même médecin qui chevauche le créneau demandé.
 * Les rendez-vous annulés ou marqués absents sont ignorés.
 */
export async function findRdvConflict(
  medecinId: string,
  start: Date,
  dureeMinutes: number,
  excludeId?: string
): Promise<RdvConflict | null> {
  const end = new Date(start.getTime() + dureeMinutes * 60000);
  // Fenêtre large : un rendez-vous commencé jusqu'à 4 h avant peut encore chevaucher
  const windowStart = new Date(start.getTime() - 4 * 3600000).toISOString();

  let query = supabase
    .from('rendez_vous')
    .select('id, date_heure, duree_minutes, patients(nom, prenom)')
    .eq('medecin_id', medecinId)
    .gte('date_heure', windowStart)
    .lt('date_heure', end.toISOString())
    .not('statut', 'in', '("annulé","absent")');

  if (excludeId) query = query.neq('id', excludeId);

  const { data } = await query;
  const conflict = (data || []).find((r: any) => {
    const rStart = new Date(r.date_heure).getTime();
    const rEnd = rStart + (r.duree_minutes || 30) * 60000;
    return rStart < end.getTime() && rEnd > start.getTime();
  });
  return (conflict as unknown as RdvConflict) || null;
}

/** Prochain numéro de passage (file d'attente) pour la journée du rendez-vous. */
export async function nextQueueNumber(dateHeure: string): Promise<number> {
  const d = new Date(dateHeure);
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  const { data } = await supabase
    .from('rendez_vous')
    .select('numero_queue')
    .gte('date_heure', start.toISOString())
    .lte('date_heure', end.toISOString())
    .not('numero_queue', 'is', null)
    .order('numero_queue', { ascending: false })
    .limit(1);
  return ((data?.[0]?.numero_queue as number | undefined) || 0) + 1;
}
