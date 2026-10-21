'use client';

import ReportsCenter from '@/components/reports/ReportsCenter';

// Rapports propres au module : seuls les utilisateurs ayant accès au module y accèdent
const RAPPORTS = ['releve-assurances', 'balance-agee-assurances', 'reglements-assurances', 'bordereaux-assurances', 'litiges-assurances', 'assurances'];

export default function RapportsAssurancesPage() {
  return <ReportsCenter title="Rapports des assurances" backHref="/assurances" reportIds={RAPPORTS} />;
}
