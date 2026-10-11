-- =========================================================================
-- NYAGBADALI — TECHNICIEN DE LABORATOIRE : PATIENTS EN LECTURE SEULE (11/10/2026)
-- -------------------------------------------------------------------------
-- À exécuter dans l'éditeur SQL de Supabase, APRÈS 20261010_securite_roles.sql.
--
-- Le technicien de laboratoire consulte l'identité des patients pour réaliser
-- les examens, mais n'enregistre ni ne modifie les dossiers patients : cela
-- relève de l'accueil, du personnel soignant et de l'administration.
-- Idempotent : peut être relancé sans risque.
-- =========================================================================

DROP POLICY IF EXISTS "patients_insert" ON patients;
CREATE POLICY "patients_insert" ON patients FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','infirmier_chef','infirmier','receptionniste'])));

DROP POLICY IF EXISTS "patients_update" ON patients;
CREATE POLICY "patients_update" ON patients FOR UPDATE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','infirmier_chef','infirmier','receptionniste'])))
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','infirmier_chef','infirmier','receptionniste'])));

-- (patients_select reste ouvert à tout le personnel ; patients_delete reste
--  réservé au super administrateur et à l'administrateur.)

NOTIFY pgrst, 'reload schema';
