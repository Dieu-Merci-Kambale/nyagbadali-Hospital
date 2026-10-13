-- =========================================================================
-- NYAGBADALI — FACTURES ANNULÉES, PAIEMENT DES EXAMENS, PRESCRIPTIONS (13/10/2026)
-- -------------------------------------------------------------------------
-- À exécuter dans l'éditeur SQL de Supabase, APRÈS 20261011_medecin_labo_pharmacie.sql.
--
--   1. Seuls les administrateurs (super administrateur et administrateur)
--      suppriment des factures, et uniquement des factures annulées.
--   2. Le laboratoire ne traite un examen (prélèvement, analyse, résultats)
--      que si la facture qui le porte est payée. L'annulation reste possible.
--   3. Une prescription porte obligatoirement sur un médicament du stock de la
--      pharmacie, disponible (stock > 0) et non périmé.
-- Idempotent : peut être relancé sans risque.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. SUPPRESSION DES FACTURES ANNULÉES
-- (les lignes de facture suivent par ON DELETE CASCADE ; une facture annulée
--  n'a pas de paiement, l'annulation étant impossible après encaissement)
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "factures_delete" ON factures;
CREATE POLICY "factures_delete" ON factures FOR DELETE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin'])) AND statut = 'annulée');

-- -------------------------------------------------------------------------
-- 2. EXAMENS DE LABORATOIRE : PAIEMENT PRÉALABLE
-- -------------------------------------------------------------------------
-- Un examen est payé s'il figure sur une facture au statut « payée ».
CREATE OR REPLACE FUNCTION public.analyse_est_payee(p_analyse_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM lignes_facture lf
    JOIN factures f ON f.id = lf.facture_id
    WHERE lf.source_type = 'analyse'
      AND lf.source_id = p_analyse_id
      AND f.statut = 'payée'
  );
$$;

-- Liste des examens payés parmi ceux demandés (le laboratoire n'a pas accès
-- aux lignes de facture : il n'obtient que l'information « payé / non payé »)
DROP FUNCTION IF EXISTS public.analyses_payees(UUID[]);
CREATE OR REPLACE FUNCTION public.analyses_payees(p_ids UUID[])
RETURNS TABLE (analyse_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id
  FROM unnest(p_ids) AS a(id)
  WHERE public.is_staff() AND public.analyse_est_payee(a.id);
$$;

REVOKE ALL ON FUNCTION public.analyse_est_payee(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.analyses_payees(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analyses_payees(UUID[]) TO authenticated;

-- Blocage en base : aucun prélèvement, démarrage ni saisie de résultats
-- sur un examen dont la facture n'est pas payée
CREATE OR REPLACE FUNCTION public.verifier_paiement_analyse()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.statut IN ('prélevé', 'en_cours', 'terminé')
     AND (NEW.statut IS DISTINCT FROM OLD.statut OR NEW.resultats IS DISTINCT FROM OLD.resultats)
     AND NOT public.analyse_est_payee(NEW.id) THEN
    RAISE EXCEPTION 'Examen « % » non payé : demandez au patient de régler sa demande à la caisse avant toute analyse.', NEW.type_analyse;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verifier_paiement_analyse ON analyses_laboratoire;
CREATE TRIGGER trg_verifier_paiement_analyse
  BEFORE UPDATE ON analyses_laboratoire
  FOR EACH ROW EXECUTE FUNCTION public.verifier_paiement_analyse();

-- -------------------------------------------------------------------------
-- 3. PRESCRIPTIONS : MÉDICAMENTS DISPONIBLES À LA PHARMACIE UNIQUEMENT
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verifier_medicament_prescrit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_med medicaments%ROWTYPE;
BEGIN
  IF NEW.medicament_id IS NULL THEN
    RAISE EXCEPTION 'Choisissez un médicament disponible à la pharmacie : la saisie libre n''est pas autorisée.';
  END IF;

  SELECT * INTO v_med FROM medicaments WHERE id = NEW.medicament_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Médicament introuvable dans le stock de la pharmacie.';
  END IF;
  IF COALESCE(v_med.stock_actuel, 0) <= 0 OR v_med.statut = 'rupture' THEN
    RAISE EXCEPTION '% est en rupture de stock à la pharmacie : il ne peut pas être prescrit.', v_med.nom_commercial;
  END IF;
  IF v_med.statut = 'expiré' OR (v_med.date_peremption IS NOT NULL AND v_med.date_peremption < CURRENT_DATE) THEN
    RAISE EXCEPTION '% est périmé : il ne peut pas être prescrit.', v_med.nom_commercial;
  END IF;

  NEW.nom_medicament := v_med.nom_commercial;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verifier_medicament_prescrit ON prescriptions;
CREATE TRIGGER trg_verifier_medicament_prescrit
  BEFORE INSERT ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.verifier_medicament_prescrit();

NOTIFY pgrst, 'reload schema';
