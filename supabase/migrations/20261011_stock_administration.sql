-- =========================================================================
-- NYAGBADALI — GESTION DU STOCK RÉSERVÉE À L'ADMINISTRATION (11/10/2026)
-- -------------------------------------------------------------------------
-- À exécuter dans l'éditeur SQL de Supabase, APRÈS 20261010_securite_roles.sql.
--
-- Séparation des tâches (contrôle interne) :
--   * le pharmacien DÉLIVRE les ordonnances (le stock baisse automatiquement
--     et chaque sortie est tracée) ;
--   * seuls le super administrateur et l'administrateur peuvent ajouter un
--     médicament, modifier une fiche, réceptionner une livraison, ajuster le
--     stock après inventaire ou retirer des produits périmés.
-- Ainsi, la personne qui délivre ne peut pas « équilibrer » elle-même le stock.
-- Idempotent : peut être relancé sans risque.
-- =========================================================================

-- 1. Fiches médicaments : lecture pour tout le personnel, écriture pour l'administration
DROP POLICY IF EXISTS "medicaments_write" ON medicaments;
DROP POLICY IF EXISTS "medicaments_insert" ON medicaments;
DROP POLICY IF EXISTS "medicaments_update" ON medicaments;
DROP POLICY IF EXISTS "medicaments_delete" ON medicaments;

CREATE POLICY "medicaments_insert" ON medicaments FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin'])));
CREATE POLICY "medicaments_update" ON medicaments FOR UPDATE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin'])))
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin'])));
CREATE POLICY "medicaments_delete" ON medicaments FOR DELETE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin'])));

-- 2. Mouvements de stock : saisie directe réservée à l'administration
--    (les sorties de délivrance sont écrites par la fonction delivrer_prescription)
DROP POLICY IF EXISTS "mouvements_insert" ON mouvements_stock;
CREATE POLICY "mouvements_insert" ON mouvements_stock FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin'])));

-- 3. Entrées, ajustements d'inventaire et retraits : administration uniquement
CREATE OR REPLACE FUNCTION public.mouvement_stock(
  p_medicament_id UUID, p_type TEXT, p_quantite INTEGER,
  p_motif TEXT DEFAULT NULL, p_reference TEXT DEFAULT NULL,
  p_fournisseur TEXT DEFAULT NULL, p_date_peremption DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_med RECORD;
  v_apres INTEGER;
  v_peremption DATE;
  v_auteur UUID;
BEGIN
  IF NOT public.has_role(ARRAY['super_admin','admin']) THEN
    RAISE EXCEPTION 'Les entrées, ajustements et retraits de stock sont réservés à l''administration.';
  END IF;
  IF p_type NOT IN ('entrée', 'ajustement', 'péremption') THEN
    RAISE EXCEPTION 'Type de mouvement invalide.';
  END IF;
  IF p_quantite IS NULL OR p_quantite < 0 OR (p_type <> 'ajustement' AND p_quantite = 0) THEN
    RAISE EXCEPTION 'Quantité invalide.';
  END IF;

  SELECT * INTO v_med FROM medicaments WHERE id = p_medicament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Médicament introuvable.'; END IF;

  v_apres := CASE p_type
    WHEN 'entrée' THEN v_med.stock_actuel + p_quantite
    WHEN 'ajustement' THEN p_quantite
    ELSE v_med.stock_actuel - p_quantite
  END;
  IF v_apres < 0 THEN
    RAISE EXCEPTION 'Impossible de retirer plus que le stock actuel (%).', v_med.stock_actuel;
  END IF;

  v_peremption := CASE WHEN p_type = 'entrée' AND p_date_peremption IS NOT NULL THEN p_date_peremption ELSE v_med.date_peremption END;

  UPDATE medicaments SET
    stock_actuel = v_apres,
    statut = CASE
      WHEN v_apres <= 0 THEN 'rupture'
      WHEN v_peremption IS NOT NULL AND v_peremption < CURRENT_DATE THEN 'expiré'
      ELSE 'disponible' END,
    date_peremption = v_peremption,
    fournisseur = CASE WHEN p_type = 'entrée' AND NULLIF(trim(p_fournisseur), '') IS NOT NULL THEN trim(p_fournisseur) ELSE fournisseur END
  WHERE id = p_medicament_id;

  SELECT id INTO v_auteur FROM personnel WHERE lower(email) = lower(auth.jwt() ->> 'email') LIMIT 1;
  INSERT INTO mouvements_stock (medicament_id, type, quantite, stock_avant, stock_apres, motif, reference, auteur_id)
  VALUES (
    p_medicament_id, p_type, v_apres - v_med.stock_actuel, v_med.stock_actuel, v_apres,
    COALESCE(NULLIF(trim(p_motif), ''), CASE p_type WHEN 'entrée' THEN 'Réapprovisionnement' WHEN 'ajustement' THEN 'Inventaire physique' ELSE 'Retrait de produits périmés / avariés' END),
    NULLIF(trim(p_reference), ''), v_auteur
  );

  RETURN jsonb_build_object('stock_avant', v_med.stock_actuel, 'stock_apres', v_apres);
END;
$$;

REVOKE ALL ON FUNCTION public.mouvement_stock(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mouvement_stock(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, DATE) TO authenticated;

-- La délivrance des ordonnances (delivrer_prescription) reste ouverte au pharmacien :
-- le stock baisse automatiquement et la sortie est tracée avec son auteur.
