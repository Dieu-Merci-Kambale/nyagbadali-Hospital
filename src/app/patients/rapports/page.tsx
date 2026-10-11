'use client';

import ReportsCenter from '@/components/reports/ReportsCenter';

// Rapports propres au module : seuls les utilisateurs ayant accès au module y accèdent
const RAPPORTS = ['registre-patients', 'nouveaux-patients'];

export default function RapportsPatientsPage() {
  return <ReportsCenter title="Rapports patients" backHref="/patients" reportIds={RAPPORTS} />;
}
