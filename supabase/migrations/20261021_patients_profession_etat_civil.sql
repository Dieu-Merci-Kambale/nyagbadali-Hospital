-- =========================================================================
-- NYAGBADALI — PROFESSION ET ÉTAT CIVIL DES PATIENTS (21/10/2026)
-- -------------------------------------------------------------------------
-- À exécuter dans l'éditeur SQL de Supabase.
--
-- Deux rubriques facultatives sur la fiche patient :
--   - profession : saisie libre ;
--   - etat_civil : célibataire, marié (Marié(e)) ou autre.
-- Idempotent : peut être relancé sans risque.
-- =========================================================================

ALTER TABLE patients ADD COLUMN IF NOT EXISTS profession VARCHAR(100);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS etat_civil VARCHAR(20);

ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_etat_civil_check;
ALTER TABLE patients ADD CONSTRAINT patients_etat_civil_check
  CHECK (etat_civil IS NULL OR etat_civil IN ('célibataire', 'marié', 'autre'));

NOTIFY pgrst, 'reload schema';
