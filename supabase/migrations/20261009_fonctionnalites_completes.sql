-- =========================================================================
-- NYAGBADALI — MIGRATION « FONCTIONNALITÉS COMPLÈTES » (09/10/2026)
-- -------------------------------------------------------------------------
-- À exécuter UNE FOIS dans l'éditeur SQL de Supabase (SQL Editor > New query).
-- Le script est idempotent : il peut être relancé sans risque et ne supprime
-- aucune donnée existante.
--
-- Contenu :
--   1. Correction des colonnes de diagnostic (texte libre au lieu de 10 car.)
--   2. Allergies et antécédents des patients
--   3. Module Laboratoire (table analyses_laboratoire)
--   4. Suivi journalier des hospitalisations
--   5. Mouvements de stock de la pharmacie
--   6. Catalogue des actes et tarifs (facturation)
--   7. Journal d'audit automatique
--   8. Politiques de sécurité (RLS) des nouvelles tables
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. DIAGNOSTICS EN TEXTE LIBRE
-- Les colonnes étaient limitées à 10 caractères (code CIM-10), ce qui faisait
-- échouer l'enregistrement d'un diagnostic rédigé (« Paludisme simple… »).
-- -------------------------------------------------------------------------
ALTER TABLE consultations    ALTER COLUMN diagnostic_principal TYPE TEXT;
ALTER TABLE hospitalisations ALTER COLUMN diagnostic_entree    TYPE TEXT;
ALTER TABLE hospitalisations ALTER COLUMN diagnostic_sortie    TYPE TEXT;

-- -------------------------------------------------------------------------
-- 2. DOSSIER PATIENT : ALLERGIES & ANTÉCÉDENTS
-- -------------------------------------------------------------------------
ALTER TABLE patients ADD COLUMN IF NOT EXISTS allergies   TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS antecedents TEXT;

-- -------------------------------------------------------------------------
-- 3. LABORATOIRE
-- Statuts : demandé → prélevé → en_cours → terminé (ou annulé)
-- resultats (JSONB) : { "parametres": [{ "nom", "valeur", "unite", "reference", "anormal" }], "texte": "conclusion" }
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analyses_laboratoire (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  medecin_prescripteur_id UUID REFERENCES personnel(id) ON DELETE SET NULL,
  technicien_id UUID REFERENCES personnel(id) ON DELETE SET NULL,
  type_analyse VARCHAR(100) NOT NULL,
  description TEXT,
  resultats JSONB,
  statut VARCHAR(50) DEFAULT 'demandé',
  date_demande TIMESTAMPTZ DEFAULT NOW(),
  date_prelevement TIMESTAMPTZ,
  date_resultat TIMESTAMPTZ,
  observations TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE analyses_laboratoire ADD COLUMN IF NOT EXISTS consultation_id UUID REFERENCES consultations(id) ON DELETE SET NULL;
ALTER TABLE analyses_laboratoire ADD COLUMN IF NOT EXISTS urgent BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_analyses_patient      ON analyses_laboratoire(patient_id);
CREATE INDEX IF NOT EXISTS idx_analyses_statut       ON analyses_laboratoire(statut);
CREATE INDEX IF NOT EXISTS idx_analyses_consultation ON analyses_laboratoire(consultation_id);

-- -------------------------------------------------------------------------
-- 4. SUIVI JOURNALIER DES HOSPITALISATIONS
-- Observations médicales, soins infirmiers, prises de constantes, visites.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suivis_hospitalisation (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  hospitalisation_id UUID NOT NULL REFERENCES hospitalisations(id) ON DELETE CASCADE,
  auteur_id UUID REFERENCES personnel(id) ON DELETE SET NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'observation'
    CHECK (type IN ('observation', 'soin', 'constantes', 'visite', 'incident')),
  constantes JSONB,
  note TEXT,
  date_suivi TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suivis_hosp ON suivis_hospitalisation(hospitalisation_id, date_suivi DESC);

-- -------------------------------------------------------------------------
-- 5. MOUVEMENTS DE STOCK (PHARMACIE)
-- Traçabilité de chaque entrée (réapprovisionnement), sortie (délivrance),
-- ajustement d'inventaire ou retrait de produits périmés.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mouvements_stock (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  medicament_id UUID NOT NULL REFERENCES medicaments(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('entrée', 'sortie', 'ajustement', 'péremption')),
  quantite INTEGER NOT NULL,
  stock_avant INTEGER,
  stock_apres INTEGER,
  motif TEXT,
  reference VARCHAR(100),
  prescription_id UUID REFERENCES prescriptions(id) ON DELETE SET NULL,
  auteur_id UUID REFERENCES personnel(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mouvements_med  ON mouvements_stock(medicament_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mouvements_date ON mouvements_stock(created_at DESC);

-- -------------------------------------------------------------------------
-- 6. CATALOGUE DES ACTES & TARIFS
-- Utilisé pour composer les factures rapidement et de façon homogène.
-- Les prix ci-dessous sont INDICATIFS : ajustez-les dans Facturation > Tarifs.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS actes_tarifs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  libelle VARCHAR(200) NOT NULL,
  categorie VARCHAR(30) NOT NULL DEFAULT 'autre'
    CHECK (categorie IN ('consultation', 'hospitalisation', 'laboratoire', 'imagerie', 'soin', 'chirurgie', 'pharmacie', 'autre')),
  prix NUMERIC(12,2) NOT NULL DEFAULT 0,
  actif BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO actes_tarifs (code, libelle, categorie, prix) VALUES
  ('CS-GEN',   'Consultation de médecine générale',          'consultation',    15000),
  ('CS-SPE',   'Consultation spécialisée',                   'consultation',    25000),
  ('CS-URG',   'Consultation en urgence',                    'consultation',    30000),
  ('CS-CTRL',  'Consultation de contrôle',                   'consultation',    10000),
  ('HOSP-STD', 'Journée d''hospitalisation (lit standard)',  'hospitalisation', 40000),
  ('HOSP-SI',  'Journée de soins intensifs',                 'hospitalisation', 90000),
  ('LAB-NFS',  'Numération formule sanguine (NFS)',          'laboratoire',     12000),
  ('LAB-GE',   'Goutte épaisse / TDR paludisme',             'laboratoire',      8000),
  ('LAB-GLY',  'Glycémie',                                   'laboratoire',      5000),
  ('LAB-LIP',  'Bilan lipidique',                            'laboratoire',     20000),
  ('LAB-HEP',  'Bilan hépatique',                            'laboratoire',     25000),
  ('LAB-REN',  'Bilan rénal (urée, créatinine)',             'laboratoire',     18000),
  ('LAB-GROS', 'Test de grossesse',                          'laboratoire',      5000),
  ('IMG-ECHO', 'Échographie',                                'imagerie',        35000),
  ('IMG-RX',   'Radiographie standard',                      'imagerie',        30000),
  ('SOIN-PANS','Pansement simple',                           'soin',             5000),
  ('SOIN-INJ', 'Injection (IM / IV)',                        'soin',             3000),
  ('SOIN-PERF','Pose de perfusion',                          'soin',            10000)
ON CONFLICT (code) DO NOTHING;

-- -------------------------------------------------------------------------
-- 7. JOURNAL D'AUDIT AUTOMATIQUE
-- Chaque création / modification / suppression sur les tables sensibles est
-- enregistrée avec l'utilisateur à l'origine de l'action.
-- -------------------------------------------------------------------------
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_email VARCHAR(150);

CREATE OR REPLACE FUNCTION nyagbadali_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id;
  ELSE
    v_record_id := NEW.id;
  END IF;

  INSERT INTO audit_logs (user_id, user_email, action, table_name, record_id, old_values, new_values)
  VALUES (
    auth.uid(),
    COALESCE(auth.jwt() ->> 'email', 'système'),
    TG_OP,
    TG_TABLE_NAME,
    v_record_id,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t_name TEXT;
  audited TEXT[] := ARRAY[
    'patients', 'personnel', 'departements', 'rendez_vous', 'consultations',
    'prescriptions', 'medicaments', 'hospitalisations', 'lits', 'chambres',
    'factures', 'lignes_facture', 'paiements', 'analyses_laboratoire',
    'actes_tarifs'
  ];
BEGIN
  FOREACH t_name IN ARRAY audited LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON %I', t_name, t_name);
    EXECUTE format(
      'CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION nyagbadali_audit()',
      t_name, t_name
    );
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_email);

-- -------------------------------------------------------------------------
-- 8. SÉCURITÉ (RLS)
-- Même logique que scripts/fix_all_rls.sql : accès complet aux utilisateurs
-- authentifiés (le contrôle par rôle est fait par l'application).
-- Le journal d'audit est en lecture seule et réservé aux administrateurs.
-- -------------------------------------------------------------------------
DO $$
DECLARE
  t_name TEXT;
  tables_list TEXT[] := ARRAY[
    'analyses_laboratoire', 'suivis_hospitalisation', 'mouvements_stock', 'actes_tarifs',
    'departements', 'medicaments', 'prescriptions', 'chambres', 'lits'
  ];
BEGIN
  FOREACH t_name IN ARRAY tables_list LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t_name);
    EXECUTE format('DROP POLICY IF EXISTS "Permettre la lecture %I" ON %I', t_name, t_name);
    EXECUTE format('DROP POLICY IF EXISTS "Permettre l''insertion %I" ON %I', t_name, t_name);
    EXECUTE format('DROP POLICY IF EXISTS "Permettre la modification %I" ON %I', t_name, t_name);
    EXECUTE format('DROP POLICY IF EXISTS "Permettre la suppression %I" ON %I', t_name, t_name);
    EXECUTE format('CREATE POLICY "Permettre la lecture %I" ON %I FOR SELECT TO authenticated USING (true)', t_name, t_name);
    EXECUTE format('CREATE POLICY "Permettre l''insertion %I" ON %I FOR INSERT TO authenticated WITH CHECK (true)', t_name, t_name);
    EXECUTE format('CREATE POLICY "Permettre la modification %I" ON %I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t_name, t_name);
    EXECUTE format('CREATE POLICY "Permettre la suppression %I" ON %I FOR DELETE TO authenticated USING (true)', t_name, t_name);
  END LOOP;
END $$;

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permettre la lecture audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "Permettre l'insertion audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "Permettre la modification audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "Permettre la suppression audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "Lecture du journal réservée aux administrateurs" ON audit_logs;
CREATE POLICY "Lecture du journal réservée aux administrateurs"
  ON audit_logs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM personnel p
      WHERE p.email = auth.jwt() ->> 'email'
        AND p.role IN ('super_admin', 'admin')
    )
  );

-- Recharger le cache de schéma de l'API pour que les nouvelles tables soient visibles immédiatement
NOTIFY pgrst, 'reload schema';
