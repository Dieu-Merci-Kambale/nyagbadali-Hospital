'use client';

import ReportsCenter from '@/components/reports/ReportsCenter';

// Rapports propres au module : seuls les utilisateurs ayant accès au module y accèdent
const RAPPORTS = ['patients-hospitalises', 'mouvements-hospitaliers', 'occupation-lits'];

export default function RapportsHospitalisationPage() {
  return <ReportsCenter title="Rapports d'hospitalisation" backHref="/hospitalisation" reportIds={RAPPORTS} />;
}
