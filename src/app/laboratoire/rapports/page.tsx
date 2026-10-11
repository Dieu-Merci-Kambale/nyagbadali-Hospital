'use client';

import ReportsCenter from '@/components/reports/ReportsCenter';

// Rapports propres au module : seuls les utilisateurs ayant accès au module y accèdent
const RAPPORTS = ['registre-laboratoire', 'activite-laboratoire', 'resultats-anormaux'];

export default function RapportsLaboratoirePage() {
  return <ReportsCenter title="Rapports du laboratoire" backHref="/laboratoire" reportIds={RAPPORTS} />;
}
