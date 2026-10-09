'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, History } from 'lucide-react';
import { supabase } from '@/lib/supabase';

/**
 * Affiche les allergies et antécédents d'un patient (bandeau d'alerte).
 * Silencieux si les colonnes n'existent pas encore ou si rien n'est renseigné.
 */
export default function MedicalAlerts({ patientId, allergies, antecedents }: { patientId?: string; allergies?: string | null; antecedents?: string | null }) {
  const [data, setData] = useState<{ allergies?: string | null; antecedents?: string | null }>({ allergies, antecedents });

  useEffect(() => {
    if (!patientId || allergies !== undefined) return;
    let ignore = false;
    supabase.from('patients').select('allergies, antecedents').eq('id', patientId).single().then(({ data: row, error }) => {
      if (!ignore && !error && row) setData(row);
    });
    return () => { ignore = true; };
  }, [patientId, allergies]);

  const a = (allergies !== undefined ? allergies : data.allergies)?.trim();
  const h = (antecedents !== undefined ? antecedents : data.antecedents)?.trim();
  if (!a && !h) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      {a && (
        <div className="alert alert-danger" style={{ alignItems: 'flex-start' }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div><strong>Allergies :</strong> {a}</div>
        </div>
      )}
      {h && (
        <div className="alert alert-warning" style={{ alignItems: 'flex-start' }}>
          <History size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div><strong>Antécédents :</strong> {h}</div>
        </div>
      )}
    </div>
  );
}
