'use client';

import ReportsCenter from '@/components/reports/ReportsCenter';

// Rapports propres au module : seuls les utilisateurs ayant accès au module y accèdent
const RAPPORTS = ['liste-personnel', 'journal-activite'];

export default function RapportsPersonnelPage() {
  return <ReportsCenter title="Rapports du personnel" backHref="/personnel" reportIds={RAPPORTS} />;
}
