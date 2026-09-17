import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mpqnjcdvoktnktxammer.supabase.co';
const SUPABASE_SERVICE_KEY = 'VOTRE_CLE_SECRETE_ICI';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  console.log("Création de la table analyses_laboratoire...");
  const sql = `
    CREATE TABLE IF NOT EXISTS analyses_laboratoire (
      id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
      patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
      medecin_prescripteur_id UUID REFERENCES personnel(id) ON DELETE SET NULL,
      technicien_id UUID REFERENCES personnel(id) ON DELETE SET NULL,
      type_analyse VARCHAR(100) NOT NULL,
      description TEXT,
      resultats JSONB,
      statut VARCHAR(50) DEFAULT 'demandé',
      date_demande TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
      date_prelevement TIMESTAMP WITH TIME ZONE,
      date_resultat TIMESTAMP WITH TIME ZONE,
      observations TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
    );

    ALTER TABLE analyses_laboratoire ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Authenticated users can read analyses" ON analyses_laboratoire;
    CREATE POLICY "Authenticated users can read analyses"
      ON analyses_laboratoire FOR SELECT TO authenticated USING (true);

    DROP POLICY IF EXISTS "Authenticated users can insert analyses" ON analyses_laboratoire;
    CREATE POLICY "Authenticated users can insert analyses"
      ON analyses_laboratoire FOR INSERT TO authenticated WITH CHECK (true);

    DROP POLICY IF EXISTS "Authenticated users can update analyses" ON analyses_laboratoire;
    CREATE POLICY "Authenticated users can update analyses"
      ON analyses_laboratoire FOR UPDATE TO authenticated USING (true);
  `;
  
  // We execute via REST API
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    // We cannot run arbitrary DDL via standard RPC unless we create a function.
    // So we will just ask the user to run this in their SQL Editor, OR I can just use supabase.rpc if a generic exec exists.
    // There is no generic exec. So I'll just write it to a file and tell the user to run it.
  });
}
// Since we can't reliably execute DDL, I'll log the SQL.
run();
