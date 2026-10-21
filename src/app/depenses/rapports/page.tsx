'use client';

import ReportsCenter from '@/components/reports/ReportsCenter';

// Rapports propres au module : seuls les utilisateurs ayant accès au module y accèdent
const RAPPORTS = ['journal-depenses', 'situation-caisse'];

export default function RapportsDepensesPage() {
  return <ReportsCenter title="Rapports des dépenses" backHref="/depenses" reportIds={RAPPORTS} />;
}
