-- =========================================================================
-- NYAGBADALI — DEMANDES D'EXAMENS DE LABORATOIRE (11/10/2026)
-- -------------------------------------------------------------------------
-- À exécuter dans l'éditeur SQL de Supabase, APRÈS 20261010_securite_roles.sql.
--
-- Les examens demandés ensemble pour un patient sont regroupés dans une
-- « demande d'examens » (bon de laboratoire) avec un numéro commun :
--   LAB-AAAAMMJJ-0001
-- Prélèvement, saisie des résultats et compte rendu se font par demande.
-- Les analyses existantes sont rattachées automatiquement (les examens créés
-- au même instant pour le même patient forment une même demande).
-- Idempotent : peut être relancé sans risque.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. TABLE DES DEMANDES
-- -------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS demandes_laboratoire_seq;

CREATE TABLE IF NOT EXISTS demandes_laboratoire (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  numero VARCHAR(30) UNIQUE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  medecin_prescripteur_id UUID REFERENCES personnel(id) ON DELETE SET NULL,
  consultation_id UUID REFERENCES consultations(id) ON DELETE SET NULL,
  urgent BOOLEAN NOT NULL DEFAULT FALSE,
  renseignements TEXT,
  date_demande TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demandes_lab_patient ON demandes_laboratoire(patient_id);
CREATE INDEX IF NOT EXISTS idx_demandes_lab_date ON demandes_laboratoire(date_demande DESC);

-- Numéro lisible attribué automatiquement
CREATE OR REPLACE FUNCTION public.numeroter_demande_laboratoire()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.numero IS NULL THEN
    NEW.numero := 'LAB-' || to_char(COALESCE(NEW.date_demande, NOW()) AT TIME ZONE 'Africa/Lubumbashi', 'YYYYMMDD')
      || '-' || lpad(nextval('demandes_laboratoire_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_numero_demande_lab ON demandes_laboratoire;
CREATE TRIGGER trg_numero_demande_lab
  BEFORE INSERT ON demandes_laboratoire
  FOR EACH ROW EXECUTE FUNCTION public.numeroter_demande_laboratoire();

ALTER TABLE analyses_laboratoire ADD COLUMN IF NOT EXISTS demande_id UUID REFERENCES demandes_laboratoire(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_analyses_demande ON analyses_laboratoire(demande_id);

-- -------------------------------------------------------------------------
-- 2. RATTACHEMENT DES ANALYSES EXISTANTES
-- Les examens enregistrés ensemble (même patient, même instant, même
-- consultation) deviennent une même demande.
-- -------------------------------------------------------------------------
DO $$
DECLARE
  g RECORD;
  v_id UUID;
BEGIN
  FOR g IN
    SELECT a.patient_id, a.date_demande, a.consultation_id,
           (array_agg(a.medecin_prescripteur_id))[1] AS prescripteur,
           bool_or(COALESCE(a.urgent, FALSE)) AS urgent,
           (array_agg(a.description) FILTER (WHERE a.description IS NOT NULL))[1] AS renseignements,
           array_agg(a.id) AS ids
    FROM analyses_laboratoire a
    WHERE a.demande_id IS NULL AND a.patient_id IS NOT NULL
    GROUP BY a.patient_id, a.date_demande, a.consultation_id
    ORDER BY a.date_demande
  LOOP
    INSERT INTO demandes_laboratoire (patient_id, medecin_prescripteur_id, consultation_id, urgent, renseignements, date_demande)
    VALUES (g.patient_id, g.prescripteur, g.consultation_id, g.urgent, g.renseignements, COALESCE(g.date_demande, NOW()))
    RETURNING id INTO v_id;
    UPDATE analyses_laboratoire SET demande_id = v_id WHERE id = ANY(g.ids);
  END LOOP;
END $$;

-- -------------------------------------------------------------------------
-- 3. SÉCURITÉ (mêmes droits que les analyses)
-- -------------------------------------------------------------------------
ALTER TABLE demandes_laboratoire ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON demandes_laboratoire FROM anon;

DROP POLICY IF EXISTS "demandes_lab_select" ON demandes_laboratoire;
DROP POLICY IF EXISTS "demandes_lab_insert" ON demandes_laboratoire;
DROP POLICY IF EXISTS "demandes_lab_update" ON demandes_laboratoire;
DROP POLICY IF EXISTS "demandes_lab_delete" ON demandes_laboratoire;

CREATE POLICY "demandes_lab_select" ON demandes_laboratoire FOR SELECT TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','infirmier_chef','infirmier','technicien_labo','caissier'])));
CREATE POLICY "demandes_lab_insert" ON demandes_laboratoire FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','medecin_chef','medecin','infirmier_chef','infirmier','technicien_labo'])));
CREATE POLICY "demandes_lab_update" ON demandes_laboratoire FOR UPDATE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','medecin_chef','medecin','technicien_labo'])))
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','medecin_chef','medecin','technicien_labo'])));
CREATE POLICY "demandes_lab_delete" ON demandes_laboratoire FOR DELETE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin'])));

-- Journal d'audit
DROP TRIGGER IF EXISTS trg_audit_demandes_laboratoire ON demandes_laboratoire;
CREATE TRIGGER trg_audit_demandes_laboratoire
  AFTER INSERT OR UPDATE OR DELETE ON demandes_laboratoire
  FOR EACH ROW EXECUTE FUNCTION nyagbadali_audit();

-- -------------------------------------------------------------------------
-- 4. CRÉATION D'UNE DEMANDE ET DE SES EXAMENS EN UNE SEULE TRANSACTION
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.creer_demande_laboratoire(
  p_patient_id UUID,
  p_examens TEXT[],
  p_consultation_id UUID DEFAULT NULL,
  p_renseignements TEXT DEFAULT NULL,
  p_urgent BOOLEAN DEFAULT FALSE,
  p_prescripteur_moi BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_demande UUID;
  v_moi UUID;
  v_examen TEXT;
  v_nb INTEGER := 0;
BEGIN
  IF NOT public.has_role(ARRAY['super_admin','medecin_chef','medecin','infirmier_chef','infirmier','technicien_labo']) THEN
    RAISE EXCEPTION 'Vous n''êtes pas autorisé à demander des examens.';
  END IF;
  IF p_examens IS NULL OR array_length(p_examens, 1) IS NULL THEN
    RAISE EXCEPTION 'Choisissez au moins un examen.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM patients WHERE id = p_patient_id) THEN
    RAISE EXCEPTION 'Patient introuvable.';
  END IF;

  SELECT id INTO v_moi FROM personnel WHERE lower(email) = lower(auth.jwt() ->> 'email') AND statut = 'actif' LIMIT 1;

  INSERT INTO demandes_laboratoire (patient_id, medecin_prescripteur_id, consultation_id, urgent, renseignements)
  VALUES (p_patient_id, CASE WHEN p_prescripteur_moi THEN v_moi END, p_consultation_id, COALESCE(p_urgent, FALSE), NULLIF(trim(p_renseignements), ''))
  RETURNING id INTO v_demande;

  FOREACH v_examen IN ARRAY p_examens LOOP
    IF NULLIF(trim(v_examen), '') IS NOT NULL THEN
      INSERT INTO analyses_laboratoire (demande_id, patient_id, medecin_prescripteur_id, consultation_id, type_analyse, description, urgent, statut, date_demande)
      SELECT v_demande, p_patient_id, d.medecin_prescripteur_id, p_consultation_id, left(trim(v_examen), 100), d.renseignements, d.urgent, 'demandé', d.date_demande
      FROM demandes_laboratoire d WHERE d.id = v_demande;
      v_nb := v_nb + 1;
    END IF;
  END LOOP;

  IF v_nb = 0 THEN
    RAISE EXCEPTION 'Choisissez au moins un examen.';
  END IF;
  RETURN v_demande;
END;
$$;

REVOKE ALL ON FUNCTION public.creer_demande_laboratoire(UUID, TEXT[], UUID, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.creer_demande_laboratoire(UUID, TEXT[], UUID, TEXT, BOOLEAN, BOOLEAN) TO authenticated;

-- -------------------------------------------------------------------------
-- 5. TEMPS RÉEL
-- -------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'demandes_laboratoire') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.demandes_laboratoire;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
