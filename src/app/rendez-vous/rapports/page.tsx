'use client';

import ReportsCenter from '@/components/reports/ReportsCenter';

// Rapports propres au module : seuls les utilisateurs ayant accès au module y accèdent
const RAPPORTS = ['rendez-vous'];

export default function RapportsRendezVousPage() {
  return <ReportsCenter title="Rapports des rendez-vous" backHref="/rendez-vous" reportIds={RAPPORTS} />;
}
