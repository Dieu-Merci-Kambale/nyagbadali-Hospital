'use client';

import ReportsCenter from '@/components/reports/ReportsCenter';

// Rapports propres au module : seuls les utilisateurs ayant accès au module y accèdent
const RAPPORTS = ['releve-caisse', 'situation-financiere', 'creances', 'recettes-prestations', 'assurances'];

export default function RapportsFacturationPage() {
  return <ReportsCenter title="Rapports de facturation" backHref="/facturation" reportIds={RAPPORTS} />;
}
