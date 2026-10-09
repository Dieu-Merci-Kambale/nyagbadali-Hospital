'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

// L'ancienne page de saisie est remplacée par la fiche détaillée /laboratoire/[id]
export default function EditAnalyseRedirect() {
  const { id } = useParams();
  const router = useRouter();

  useEffect(() => {
    if (id) router.replace(`/laboratoire/${id}`);
  }, [id, router]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
      <Loader2 size={24} className="animate-spin" />
    </div>
  );
}
