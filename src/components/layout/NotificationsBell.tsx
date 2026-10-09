'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, Pill, FlaskConical, CalendarClock, Receipt, AlertTriangle, CheckCircle, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { hasAccess } from '@/lib/role-permissions';
import { startOfDayISO, endOfDayISO } from '@/lib/format';

type Alerte = { key: string; href: string; icon: React.ReactNode; title: string; detail: string; tone: 'danger' | 'warning' | 'info' | 'success' };

const TONES = {
  danger: { bg: 'var(--danger-50)', fg: 'var(--danger-600)' },
  warning: { bg: 'var(--warning-50)', fg: 'var(--warning-600)' },
  info: { bg: 'var(--primary-50)', fg: 'var(--primary-600)' },
  success: { bg: 'var(--success-50)', fg: 'var(--success-600)' },
};

const REFRESH_MS = 2 * 60 * 1000;

/** Cloche de notifications : alertes calculées en direct selon le rôle de l'utilisateur. */
export default function NotificationsBell() {
  const { profile } = useAuth();
  const [alertes, setAlertes] = useState<Alerte[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const role = profile.role;
    const isMedecin = role === 'medecin' || role === 'medecin_chef';
    const list: Alerte[] = [];

    const jobs: Promise<void>[] = [];

    if (hasAccess(role, 'pharmacie')) {
      jobs.push((async () => {
        const [{ data: meds }, { count: ordonnances }] = await Promise.all([
          supabase.from('medicaments').select('stock_actuel, stock_minimum, date_peremption'),
          supabase.from('prescriptions').select('id', { count: 'exact', head: true }).eq('statut', 'active'),
        ]);
        const today = new Date();
        const in30 = new Date(Date.now() + 30 * 86_400_000);
        const critiques = (meds || []).filter((m: any) => m.stock_actuel <= m.stock_minimum).length;
        const peremptions = (meds || []).filter((m: any) => m.date_peremption && new Date(m.date_peremption) <= in30).length;
        const perimes = (meds || []).filter((m: any) => m.date_peremption && new Date(m.date_peremption) < today).length;
        if (critiques) list.push({ key: 'stock', href: '/pharmacie', icon: <Pill size={16} />, title: `${critiques} médicament(s) en stock critique`, detail: 'Stock au niveau ou sous le seuil minimum', tone: 'danger' });
        if (peremptions) list.push({ key: 'peremption', href: '/pharmacie', icon: <AlertTriangle size={16} />, title: `${peremptions} produit(s) périmé(s) ou bientôt périmé(s)`, detail: perimes ? `dont ${perimes} déjà périmé(s)` : 'Péremption dans moins de 30 jours', tone: 'warning' });
        if (role === 'pharmacien' && ordonnances) list.push({ key: 'ordonnances', href: '/pharmacie', icon: <Pill size={16} />, title: `${ordonnances} prescription(s) à délivrer`, detail: 'Comptoir de délivrance', tone: 'info' });
      })());
    }

    if (hasAccess(role, 'laboratoire')) {
      jobs.push((async () => {
        if (role === 'technicien_labo' || role === 'super_admin') {
          const { data } = await supabase.from('analyses_laboratoire').select('urgent').in('statut', ['demandé', 'prélevé', 'en_cours']);
          const total = (data || []).length;
          const urgents = (data || []).filter((a: any) => a.urgent).length;
          if (total) list.push({ key: 'labo', href: '/laboratoire', icon: <FlaskConical size={16} />, title: `${total} analyse(s) à traiter`, detail: urgents ? `dont ${urgents} urgente(s)` : 'Demandes en attente', tone: urgents ? 'danger' : 'info' });
        }
        if (isMedecin) {
          const since = new Date(Date.now() - 48 * 3600000).toISOString();
          const { data } = await supabase.from('analyses_laboratoire').select('id').eq('statut', 'terminé').eq('medecin_prescripteur_id', profile.id).gte('date_resultat', since);
          if (data?.length) list.push({ key: 'resultats', href: '/laboratoire', icon: <CheckCircle size={16} />, title: `${data.length} résultat(s) d'analyse disponible(s)`, detail: 'Validés ces dernières 48 h', tone: 'success' });
        }
      })());
    }

    if (hasAccess(role, 'rendez-vous')) {
      jobs.push((async () => {
        let q = supabase.from('rendez_vous').select('statut, numero_queue, medecin_id').gte('date_heure', startOfDayISO()).lte('date_heure', endOfDayISO());
        if (isMedecin) q = q.eq('medecin_id', profile.id);
        const { data } = await q;
        const rdvs = data || [];
        const enAttente = rdvs.filter((r: any) => r.numero_queue && r.statut === 'confirmé').length;
        const aConfirmer = rdvs.filter((r: any) => r.statut === 'planifié').length;
        if (enAttente) list.push({ key: 'attente', href: '/rendez-vous', icon: <Users size={16} />, title: `${enAttente} patient(s) en salle d'attente`, detail: isMedecin ? 'Pour vos consultations du jour' : "Arrivés aujourd'hui", tone: 'warning' });
        if (aConfirmer) list.push({ key: 'rdv', href: '/rendez-vous', icon: <CalendarClock size={16} />, title: `${aConfirmer} rendez-vous du jour non confirmé(s)`, detail: "Agenda d'aujourd'hui", tone: 'info' });
      })());
    }

    if (hasAccess(role, 'facturation')) {
      jobs.push((async () => {
        const { count } = await supabase.from('factures').select('id', { count: 'exact', head: true }).in('statut', ['en_attente', 'partielle']);
        if (count) list.push({ key: 'factures', href: '/facturation', icon: <Receipt size={16} />, title: `${count} facture(s) non soldée(s)`, detail: 'En attente de paiement', tone: 'warning' });
      })());
    }

    await Promise.allSettled(jobs);
    const order = { danger: 0, warning: 1, info: 2, success: 3 };
    setAlertes(list.sort((a, b) => order[a.tone] - order[b.tone]));
  }, [profile]);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="header-btn" title="Notifications" id="btn-notifications" onClick={() => { setOpen((o) => !o); if (!open) load(); }}>
        <Bell size={20} />
        {alertes.length > 0 && (
          <span className="header-btn-badge" style={{ top: 2, right: 2, width: 'auto', minWidth: 18, height: 18, padding: '0 4px', fontSize: 10, fontWeight: 700, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999 }}>
            {alertes.length}
          </span>
        )}
      </button>
      {open && (
        <div className="header-dropdown" style={{ right: 0, width: 360 }}>
          <div style={{ padding: '12px 14px', fontWeight: 700, fontSize: 14, borderBottom: '1px solid var(--neutral-100)' }}>Notifications</div>
          {alertes.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--neutral-500)', fontSize: 13 }}>
              <CheckCircle size={22} style={{ color: 'var(--success)', marginBottom: 6 }} />
              <div>Rien à signaler pour le moment.</div>
            </div>
          ) : (
            alertes.map((a) => (
              <Link key={a.key} href={a.href} className="header-dropdown-item" onClick={() => setOpen(false)}>
                <span style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: TONES[a.tone].bg, color: TONES[a.tone].fg }}>
                  {a.icon}
                </span>
                <span>
                  <span style={{ display: 'block', fontWeight: 600 }}>{a.title}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--neutral-500)' }}>{a.detail}</span>
                </span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
