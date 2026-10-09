'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, User, UserCog, Receipt, Pill } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { hasAccess } from '@/lib/role-permissions';

type Result = { id: string; href: string; title: string; subtitle: string; kind: 'patient' | 'personnel' | 'facture' | 'medicament' };

const ICONS = {
  patient: <User size={16} />,
  personnel: <UserCog size={16} />,
  facture: <Receipt size={16} />,
  medicament: <Pill size={16} />,
};

const LABELS = { patient: 'Patients', personnel: 'Personnel', facture: 'Factures', medicament: 'Médicaments' };

/** Recherche transversale (patients, personnel, factures, médicaments) selon les droits du rôle. */
export default function GlobalSearch() {
  const router = useRouter();
  const { profile } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      // Raccourci Ctrl+K / Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById('global-search')?.focus();
      }
    };
    document.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    const q = query.trim().replace(/[%,()]/g, ' ');
    if (q.length < 2 || !profile) {
      setResults([]);
      return;
    }
    let ignore = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      const role = profile.role;
      const tasks: Promise<Result[]>[] = [];

      if (hasAccess(role, 'patients')) {
        tasks.push(Promise.resolve(
          supabase.from('patients').select('id, nom, prenom, code_patient, telephone')
            .or(`nom.ilike.%${q}%,prenom.ilike.%${q}%,code_patient.ilike.%${q}%,telephone.ilike.%${q}%`)
            .limit(6)
        ).then(({ data }) => (data || []).map((p: any) => ({
          id: p.id, kind: 'patient' as const, href: `/patients/${p.id}`,
          title: `${p.prenom} ${p.nom}`, subtitle: `${p.code_patient}${p.telephone ? ` • ${p.telephone}` : ''}`,
        }))));
      }
      if (hasAccess(role, 'personnel')) {
        tasks.push(Promise.resolve(
          supabase.from('personnel').select('id, nom, prenom, role, specialite, code_personnel')
            .or(`nom.ilike.%${q}%,prenom.ilike.%${q}%,code_personnel.ilike.%${q}%`)
            .limit(4)
        ).then(({ data }) => (data || []).map((p: any) => ({
          id: p.id, kind: 'personnel' as const, href: `/personnel/${p.id}/edit`,
          title: `${p.role?.startsWith('medecin') ? 'Dr. ' : ''}${p.prenom} ${p.nom}`, subtitle: p.specialite || p.code_personnel,
        }))));
      }
      if (hasAccess(role, 'facturation')) {
        tasks.push(Promise.resolve(
          supabase.from('factures').select('id, numero_facture, montant_patient, statut').ilike('numero_facture', `%${q}%`).limit(4)
        ).then(({ data }) => (data || []).map((f: any) => ({
          id: f.id, kind: 'facture' as const, href: `/facturation/${f.id}`,
          title: f.numero_facture, subtitle: `Statut : ${String(f.statut).replace('_', ' ')}`,
        }))));
      }
      if (hasAccess(role, 'pharmacie')) {
        tasks.push(Promise.resolve(
          supabase.from('medicaments').select('id, nom_commercial, dosage, stock_actuel')
            .or(`nom_commercial.ilike.%${q}%,nom_generique.ilike.%${q}%,code.ilike.%${q}%`)
            .limit(4)
        ).then(({ data }) => (data || []).map((m: any) => ({
          id: m.id, kind: 'medicament' as const, href: `/pharmacie/${m.id}/edit`,
          title: `${m.nom_commercial}${m.dosage ? ` ${m.dosage}` : ''}`, subtitle: `Stock : ${m.stock_actuel}`,
        }))));
      }

      const all = (await Promise.all(tasks)).flat();
      if (!ignore) {
        setResults(all);
        setActive(0);
        setSearching(false);
      }
    }, 250);
    return () => { ignore = true; clearTimeout(timer); };
  }, [query, profile]);

  const go = (r: Result) => {
    setOpen(false);
    setQuery('');
    router.push(r.href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active]); }
    else if (e.key === 'Escape') { setOpen(false); (e.target as HTMLInputElement).blur(); }
  };

  const groups = (Object.keys(LABELS) as Result['kind'][])
    .map((kind) => ({ kind, items: results.filter((r) => r.kind === kind) }))
    .filter((g) => g.items.length > 0);

  return (
    <div ref={boxRef} className="header-search" style={{ position: 'relative' }}>
      <Search className="header-search-icon" />
      <input
        type="text"
        placeholder="Rechercher un patient, médecin, facture... (Ctrl+K)"
        id="global-search"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      {open && query.trim().length >= 2 && (
        <div className="header-dropdown" style={{ left: 0, right: 0, minWidth: 380, maxHeight: 420, overflowY: 'auto' }}>
          {searching ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, color: 'var(--neutral-500)', fontSize: 13 }}>
              <Loader2 size={16} className="animate-spin" /> Recherche…
            </div>
          ) : groups.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--neutral-500)', fontSize: 13 }}>Aucun résultat pour « {query} »</div>
          ) : (
            groups.map((g) => (
              <div key={g.kind}>
                <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--neutral-400)', background: 'var(--neutral-50)' }}>
                  {LABELS[g.kind]}
                </div>
                {g.items.map((r) => {
                  const index = results.indexOf(r);
                  return (
                    <button
                      key={`${r.kind}-${r.id}`}
                      type="button"
                      className="header-dropdown-item"
                      onMouseDown={() => go(r)}
                      onMouseEnter={() => setActive(index)}
                      style={{ width: '100%', border: 'none', borderBottom: '1px solid var(--neutral-100)', textAlign: 'left', cursor: 'pointer', background: index === active ? 'var(--primary-50)' : 'white' }}
                    >
                      <span style={{ color: 'var(--primary-600)' }}>{ICONS[r.kind]}</span>
                      <span>
                        <span style={{ display: 'block', fontWeight: 600 }}>{r.title}</span>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--neutral-500)' }}>{r.subtitle}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
