'use client';

import ReportsCenter from '@/components/reports/ReportsCenter';

// Rapports propres au module : seuls les utilisateurs ayant accès au module y accèdent
const RAPPORTS = ['registre-consultations', 'activite-medecins', 'morbidite'];

export default function RapportsConsultationsPage() {
  return <ReportsCenter title="Rapports des consultations" backHref="/consultations" reportIds={RAPPORTS} />;
}
