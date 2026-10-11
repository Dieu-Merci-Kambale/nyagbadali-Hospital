-- =========================================================================
-- NYAGBADALI — RÔLE DU MÉDECIN : LABORATOIRE ET PHARMACIE (11/10/2026)
-- -------------------------------------------------------------------------
-- À exécuter dans l'éditeur SQL de Supabase, APRÈS 20261011_demandes_laboratoire.sql
-- et 20261011_stock_administration.sql.
--
-- Séparation des tâches :
--   * le médecin DEMANDE des examens et CONSULTE les résultats ; seul le
--     laboratoire (technicien de labo, et le super administrateur) traite les
--     analyses : prélèvement, saisie et validation des résultats, annulation ;
--   * le médecin n'a plus accès au module Pharmacie ni aux mouvements de stock.
--     Il garde la lecture du catalogue des médicaments, nécessaire pour
--     rédiger ses ordonnances.
-- Idempotent : peut être relancé sans risque.
-- =========================================================================

-- 1. Laboratoire : traitement réservé au laboratoire
DROP POLICY IF EXISTS "analyses_update" ON analyses_laboratoire;
CREATE POLICY "analyses_update" ON analyses_laboratoire FOR UPDATE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','technicien_labo'])))
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','technicien_labo'])));

DROP POLICY IF EXISTS "demandes_lab_update" ON demandes_laboratoire;
CREATE POLICY "demandes_lab_update" ON demandes_laboratoire FOR UPDATE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','technicien_labo'])))
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','technicien_labo'])));

-- (Les demandes d'examens restent ouvertes aux médecins : analyses_insert,
--  demandes_lab_insert et creer_demande_laboratoire sont inchangés.)

-- 2. Pharmacie : le journal des mouvements de stock n'est plus visible du médecin
DROP POLICY IF EXISTS "mouvements_select" ON mouvements_stock;
CREATE POLICY "mouvements_select" ON mouvements_stock FOR SELECT TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','pharmacien','caissier'])));

NOTIFY pgrst, 'reload schema';
