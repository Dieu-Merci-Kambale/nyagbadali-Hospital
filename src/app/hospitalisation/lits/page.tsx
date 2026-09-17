'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, BedDouble, AlertCircle, Loader2, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LitsPage() {
  const router = useRouter();
  const [chambres, setChambres] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLits() {
      setLoading(true);
      const { data, error } = await supabase
        .from('chambres')
        .select(`
          *,
          lits(
            *,
            hospitalisations(id, statut, patients(nom, prenom))
          )
        `)
        .order('numero', { ascending: true });

      if (error) {
        console.error('Erreur:', error);
      } else {
        // Le but est de lier le patient actuel si le lit est occupé. 
        // Or, une hospitalisation active a statut='actif'.
        const enrichedChambres = data?.map(chambre => ({
          ...chambre,
          lits: chambre.lits?.sort((a: any, b: any) => a.numero.localeCompare(b.numero)).map((lit: any) => {
            const activeHosp = lit.hospitalisations?.find((h: any) => h.statut === 'actif');
            return {
              ...lit,
              activeHosp
            };
          })
        }));
        setChambres(enrichedChambres || []);
      }
      setLoading(false);
    }
    fetchLits();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Loader2 size={24} className="animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.back()} className="btn btn-ghost" title="Retour">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">Gestion des Lits et Chambres</h1>
            <p className="page-subtitle">Aperçu en temps réel de l'occupation</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: 'var(--success)' }}></div>
          <span style={{ fontSize: 13, color: 'var(--neutral-600)' }}>Disponible</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: 'var(--danger)' }}></div>
          <span style={{ fontSize: 13, color: 'var(--neutral-600)' }}>Occupé</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: 'var(--warning)' }}></div>
          <span style={{ fontSize: 13, color: 'var(--neutral-600)' }}>Maintenance / Réservé</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
        {chambres.map((chambre) => (
          <div key={chambre.id} className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', backgroundColor: 'var(--neutral-50)', borderBottom: '1px solid var(--neutral-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--neutral-900)' }}>
                  Chambre {chambre.numero}
                </h3>
                <span style={{ fontSize: 12, color: 'var(--neutral-500)', textTransform: 'capitalize' }}>
                  {chambre.type} • {chambre.etage}
                </span>
              </div>
              <div style={{ 
                width: 40, height: 40, borderRadius: '50%', 
                backgroundColor: 'var(--primary-50)', color: 'var(--primary-600)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold'
              }}>
                {chambre.lits?.filter((l: any) => l.statut === 'occupé').length}/{chambre.capacite}
              </div>
            </div>

            <div className="card-body" style={{ padding: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {chambre.lits?.map((lit: any) => {
                  let bgColor = 'var(--success-50)';
                  let borderColor = 'var(--success-200)';
                  let iconColor = 'var(--success-600)';

                  if (lit.statut === 'occupé') {
                    bgColor = 'var(--danger-50)';
                    borderColor = 'var(--danger-200)';
                    iconColor = 'var(--danger-600)';
                  } else if (lit.statut !== 'disponible') {
                    bgColor = 'var(--warning-50)';
                    borderColor = 'var(--warning-200)';
                    iconColor = 'var(--warning-600)';
                  }

                  return (
                    <div 
                      key={lit.id}
                      style={{ 
                        border: `1px solid ${borderColor}`,
                        backgroundColor: bgColor,
                        borderRadius: 8,
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <BedDouble size={20} color={iconColor} />
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--neutral-900)', fontSize: 14 }}>{lit.numero}</div>
                          <div style={{ fontSize: 12, color: 'var(--neutral-600)', textTransform: 'capitalize' }}>
                            {lit.type_lit.replace('_', ' ')}
                          </div>
                        </div>
                      </div>

                      {lit.statut === 'occupé' && lit.activeHosp ? (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--neutral-900)' }}>
                            {lit.activeHosp.patients.prenom} {lit.activeHosp.patients.nom}
                          </div>
                          <button 
                            onClick={() => router.push(`/hospitalisation/${lit.activeHosp.id}/edit`)}
                            className="btn btn-sm btn-ghost" style={{ padding: '4px 8px', fontSize: 11, marginTop: 4 }}
                          >
                            Détails &rarr;
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, fontWeight: 500, color: iconColor, textTransform: 'capitalize' }}>
                          {lit.statut}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
