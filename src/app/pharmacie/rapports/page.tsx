'use client';

import ReportsCenter from '@/components/reports/ReportsCenter';

// Rapports propres au module : seuls les utilisateurs ayant accès au module y accèdent
const RAPPORTS = ['inventaire', 'stocks-critiques', 'peremptions', 'mouvements-stock', 'consommation', 'ordonnances-attente'];

export default function RapportsPharmaciePage() {
  return <ReportsCenter title="Rapports de la pharmacie" backHref="/pharmacie" reportIds={RAPPORTS} />;
}
