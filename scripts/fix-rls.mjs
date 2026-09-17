/**
 * Script pour ajouter les politiques RLS manquantes
 * et vérifier que le Super Admin existe bien
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mpqnjcdvoktnktxammer.supabase.co';
const SUPABASE_SERVICE_KEY = 'VOTRE_CLE_SECRETE_ICI';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function fixRLS() {
  console.log('🔧 Diagnostic et correction RLS\n');

  // 1. Vérifier que le personnel existe
  console.log('1️⃣  Vérification du Super Admin dans la table personnel...');
  const { data: admin, error: adminErr } = await supabaseAdmin
    .from('personnel')
    .select('*')
    .eq('email', 'admin@hopital.cd');

  if (adminErr) {
    console.error('   ❌ Erreur:', adminErr.message);
  } else if (!admin || admin.length === 0) {
    console.log('   ❌ Aucun personnel trouvé avec cet email !');
  } else {
    console.log('   ✅ Trouvé:', admin[0].prenom, admin[0].nom, '— Rôle:', admin[0].role, '— Statut:', admin[0].statut);
  }

  // 2. Ajouter les politiques RLS pour la table personnel
  console.log('\n2️⃣  Ajout des politiques RLS pour la table personnel...');
  
  const policies = [
    {
      name: 'Authenticated users can read personnel',
      sql: `CREATE POLICY "Authenticated users can read personnel" ON personnel FOR SELECT TO authenticated USING (true);`
    },
    {
      name: 'Authenticated users can insert personnel', 
      sql: `CREATE POLICY "Authenticated users can insert personnel" ON personnel FOR INSERT TO authenticated WITH CHECK (true);`
    },
    {
      name: 'Authenticated users can update personnel',
      sql: `CREATE POLICY "Authenticated users can update personnel" ON personnel FOR UPDATE TO authenticated USING (true);`
    },
    {
      name: 'Authenticated users can read departements',
      sql: `CREATE POLICY "Authenticated users can read departements" ON departements FOR SELECT TO authenticated USING (true);`
    },
    {
      name: 'Authenticated users can read consultations',
      sql: `CREATE POLICY "Authenticated users can read consultations" ON consultations FOR SELECT TO authenticated USING (true);`
    },
    {
      name: 'Authenticated users can read rendez_vous',
      sql: `CREATE POLICY "Authenticated users can read rendez_vous" ON rendez_vous FOR SELECT TO authenticated USING (true);`
    },
    {
      name: 'Authenticated users can read factures',
      sql: `CREATE POLICY "Authenticated users can read factures" ON factures FOR SELECT TO authenticated USING (true);`
    },
    {
      name: 'Authenticated users can read hospitalisations',
      sql: `CREATE POLICY "Authenticated users can read hospitalisations" ON hospitalisations FOR SELECT TO authenticated USING (true);`
    },
  ];

  for (const policy of policies) {
    const { error } = await supabaseAdmin.rpc('', {}).catch(() => ({ error: null }));
    // Use raw SQL via the REST API
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
    }).catch(() => null);
  }

  console.log('   ⚠️  Les politiques RLS doivent être ajoutées via le SQL Editor de Supabase.');
  console.log('   📋 Copiez et exécutez le SQL suivant dans votre SQL Editor Supabase:\n');
  
  console.log('--- COPIER À PARTIR D\'ICI ---\n');
  console.log(`-- Politiques RLS pour toutes les tables
-- Personnel
CREATE POLICY "Authenticated users can read personnel"
  ON personnel FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert personnel"
  ON personnel FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update personnel"
  ON personnel FOR UPDATE TO authenticated USING (true);

-- Départements  
DO $$ BEGIN
  ALTER TABLE departements ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END $$;
CREATE POLICY "Authenticated users can read departements"
  ON departements FOR SELECT TO authenticated USING (true);

-- Consultations
CREATE POLICY "Authenticated users can insert consultations"
  ON consultations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can read consultations"
  ON consultations FOR SELECT TO authenticated USING (true);

-- Rendez-vous
CREATE POLICY "Authenticated users can read rendez_vous"
  ON rendez_vous FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert rendez_vous"
  ON rendez_vous FOR INSERT TO authenticated WITH CHECK (true);

-- Factures
CREATE POLICY "Authenticated users can read factures"
  ON factures FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert factures"
  ON factures FOR INSERT TO authenticated WITH CHECK (true);

-- Hospitalisations
CREATE POLICY "Authenticated users can read hospitalisations"
  ON hospitalisations FOR SELECT TO authenticated USING (true);

-- Médicaments (pas de RLS activé, mais au cas où)
DO $$ BEGIN
  ALTER TABLE medicaments ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL;
END $$;
CREATE POLICY "Authenticated users can read medicaments"
  ON medicaments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage medicaments"
  ON medicaments FOR ALL TO authenticated USING (true) WITH CHECK (true);
`);
  console.log('--- FIN DU SQL ---\n');
  
  console.log('✅ Après avoir exécuté ce SQL, la connexion fonctionnera !');
}

fixRLS().catch(console.error);
