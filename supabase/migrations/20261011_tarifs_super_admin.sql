-- =========================================================================
-- NYAGBADALI — CATALOGUE DES TARIFS RÉSERVÉ AUX ADMINISTRATEURS (11/10/2026)
-- -------------------------------------------------------------------------
-- À exécuter dans l'éditeur SQL de Supabase, APRÈS 20261010_securite_roles.sql.
--
-- Seuls le super administrateur et l'administrateur peuvent ajouter, modifier, activer/désactiver ou
-- supprimer un acte du catalogue. Tout le personnel garde la lecture des
-- tarifs (nécessaire pour composer les factures).
-- Idempotent : peut être relancé sans risque.
-- =========================================================================

DROP POLICY IF EXISTS "actes_write" ON actes_tarifs;
DROP POLICY IF EXISTS "actes_insert" ON actes_tarifs;
DROP POLICY IF EXISTS "actes_update" ON actes_tarifs;
DROP POLICY IF EXISTS "actes_delete" ON actes_tarifs;

CREATE POLICY "actes_insert" ON actes_tarifs FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin'])));
CREATE POLICY "actes_update" ON actes_tarifs FOR UPDATE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin'])))
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin'])));
CREATE POLICY "actes_delete" ON actes_tarifs FOR DELETE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin'])));

-- La lecture reste ouverte à tout le personnel actif (politique "actes_select" inchangée)
