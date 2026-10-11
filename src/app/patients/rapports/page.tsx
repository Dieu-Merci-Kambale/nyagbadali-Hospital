'use client';

import ReportsCenter from '@/components/reports/ReportsCenter';
import AdminGuard from '@/components/AdminGuard';
import { canManagePatients } from '@/lib/role-permissions';
import type { RolePersonnel } from '@/types';

// Rapports propres au module : seuls les utilisateurs ayant accès au module y accèdent
const RAPPORTS = ['registre-patients', 'nouveaux-patients'];

export default function RapportsPatientsPage() {
  return (
    <AdminGuard
      allowed={(r) => canManagePatients(r as RolePersonnel)}
      reservedTo="au personnel d'accueil, au personnel soignant et à l'administration"
      operations="les rapports et registres des patients"
      backHref="/patients"
      backLabel="Retour aux patients"
    >
      <ReportsCenter title="Rapports patients" backHref="/patients" reportIds={RAPPORTS} />
    </AdminGuard>
  );
}
