-- Exécutez ce script dans l'éditeur SQL de Supabase pour créer la table du laboratoire.

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
