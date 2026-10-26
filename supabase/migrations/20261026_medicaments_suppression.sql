-- =========================================================================
-- NYAGBADALI — SUPPRESSION DES MÉDICAMENTS (26/10/2026)
-- -------------------------------------------------------------------------
-- À exécuter dans l'éditeur SQL de Supabase, APRÈS 20261011_stock_administration.sql.
--
--   1. Seul le super administrateur peut supprimer une fiche médicament
--      (l'administrateur garde l'ajout, la modification et les mouvements de stock).
--   2. Un médicament déjà prescrit (lié à une prescription, ou prescrit sous
--      son nom commercial) ne peut pas être supprimé.
-- Idempotent : peut être relancé sans risque.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. SUPPRESSION D'UN MÉDICAMENT : SUPER ADMINISTRATEUR UNIQUEMENT
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "medicaments_delete" ON medicaments;
CREATE POLICY "medicaments_delete" ON medicaments FOR DELETE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin'])));

-- -------------------------------------------------------------------------
-- 2. REFUS DE SUPPRESSION D'UN MÉDICAMENT DÉJÀ PRESCRIT
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.empecher_suppression_medicament_prescrit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM prescriptions p
    WHERE p.medicament_id = OLD.id
       OR lower(trim(p.nom_medicament)) = lower(trim(OLD.nom_commercial))
  ) THEN
    RAISE EXCEPTION 'Suppression impossible : « % » a déjà été prescrit.', OLD.nom_commercial;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_medicament_prescrit ON medicaments;
CREATE TRIGGER trg_medicament_prescrit
  BEFORE DELETE ON medicaments
  FOR EACH ROW EXECUTE FUNCTION public.empecher_suppression_medicament_prescrit();
