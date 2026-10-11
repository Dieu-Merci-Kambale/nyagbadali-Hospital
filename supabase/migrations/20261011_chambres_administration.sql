-- =========================================================================
-- NYAGBADALI — CHAMBRES & LITS RÉSERVÉS À L'ADMINISTRATION (11/10/2026)
-- -------------------------------------------------------------------------
-- À exécuter dans l'éditeur SQL de Supabase, APRÈS 20261010_securite_roles.sql.
--
-- Séparation des tâches (contrôle interne) :
--   * tout le personnel CONSULTE les chambres et les lits ;
--   * seuls le super administrateur et l'administrateur créent, modifient ou
--     suppriment une chambre ou un lit (et mettent un lit en maintenance) ;
--   * l'occupation des lits reste automatique : l'admission (admettre_patient)
--     et le transfert (transferer_lit) occupent/libèrent le lit, et la sortie
--     du patient libère le lit grâce au déclencheur ci-dessous.
-- Idempotent : peut être relancé sans risque.
-- =========================================================================

-- 1. Chambres : lecture pour le personnel, écriture pour l'administration
DROP POLICY IF EXISTS "chambres_write" ON chambres;
DROP POLICY IF EXISTS "chambres_insert" ON chambres;
DROP POLICY IF EXISTS "chambres_update" ON chambres;
DROP POLICY IF EXISTS "chambres_delete" ON chambres;

CREATE POLICY "chambres_insert" ON chambres FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin'])));
CREATE POLICY "chambres_update" ON chambres FOR UPDATE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin'])))
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin'])));
CREATE POLICY "chambres_delete" ON chambres FOR DELETE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin'])));

-- 2. Lits : lecture pour le personnel, écriture pour l'administration
DROP POLICY IF EXISTS "lits_write" ON lits;
DROP POLICY IF EXISTS "lits_insert" ON lits;
DROP POLICY IF EXISTS "lits_update" ON lits;
DROP POLICY IF EXISTS "lits_delete" ON lits;

CREATE POLICY "lits_insert" ON lits FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin'])));
CREATE POLICY "lits_update" ON lits FOR UPDATE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin'])))
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin'])));
CREATE POLICY "lits_delete" ON lits FOR DELETE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin'])));

-- 3. Sortie du patient : le lit est libéré automatiquement par la base
--    (les soignants n'ont plus besoin d'écrire dans la table des lits)
CREATE OR REPLACE FUNCTION public.liberer_lit_a_la_sortie()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.statut = 'actif' AND NEW.statut <> 'actif' AND OLD.lit_id IS NOT NULL THEN
    UPDATE lits SET statut = 'disponible'
    WHERE id = OLD.lit_id
      AND statut = 'occupé'
      AND NOT EXISTS (
        SELECT 1 FROM hospitalisations h
        WHERE h.lit_id = OLD.lit_id AND h.statut = 'actif' AND h.id <> NEW.id
      );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.liberer_lit_a_la_sortie() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_liberer_lit_a_la_sortie ON hospitalisations;
CREATE TRIGGER trg_liberer_lit_a_la_sortie
  AFTER UPDATE OF statut ON hospitalisations
  FOR EACH ROW EXECUTE FUNCTION public.liberer_lit_a_la_sortie();

NOTIFY pgrst, 'reload schema';
