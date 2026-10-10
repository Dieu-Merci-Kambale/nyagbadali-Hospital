-- =========================================================================
-- NYAGBADALI — SÉCURITÉ PAR RÔLE DANS LA BASE DE DONNÉES (10/10/2026)
-- -------------------------------------------------------------------------
-- À exécuter dans l'éditeur SQL de Supabase, APRÈS
-- 20261009_fonctionnalites_completes.sql.
--
-- Avant ce script, tout utilisateur connecté pouvait lire, modifier et
-- supprimer toutes les données via l'API, quel que soit son rôle.
-- Désormais, la base applique elle-même les mêmes droits que l'interface :
--   * seuls les membres du personnel ACTIFS ont accès aux données ;
--   * chaque table n'est lisible / modifiable que par les rôles concernés ;
--   * un utilisateur ne peut pas changer son propre rôle ou son statut.
--
-- Le script est idempotent (il peut être relancé) et ne supprime aucune donnée.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. FONCTIONS UTILITAIRES
-- -------------------------------------------------------------------------

-- Rôle de l'utilisateur connecté (NULL s'il n'est pas un membre actif du personnel)
CREATE OR REPLACE FUNCTION public.app_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role::TEXT
  FROM public.personnel p
  WHERE lower(p.email) = lower(auth.jwt() ->> 'email')
    AND p.statut = 'actif'
  LIMIT 1
$$;

-- Vrai si l'utilisateur connecté a l'un des rôles donnés
CREATE OR REPLACE FUNCTION public.has_role(roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.app_role() = ANY(roles), FALSE)
$$;

-- Vrai si l'utilisateur connecté est un membre actif du personnel
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.app_role() IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.app_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(TEXT[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

-- -------------------------------------------------------------------------
-- 2. SUPPRESSION DE TOUTES LES ANCIENNES POLITIQUES (permissives)
-- -------------------------------------------------------------------------
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'departements', 'personnel', 'patients', 'rendez_vous', 'consultations',
        'medicaments', 'prescriptions', 'chambres', 'lits', 'hospitalisations',
        'factures', 'lignes_facture', 'paiements', 'audit_logs',
        'analyses_laboratoire', 'suivis_hospitalisation', 'mouvements_stock', 'actes_tarifs'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- RLS activée partout ; les visiteurs anonymes n'ont aucun droit sur les tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'departements', 'personnel', 'patients', 'rendez_vous', 'consultations',
    'medicaments', 'prescriptions', 'chambres', 'lits', 'hospitalisations',
    'factures', 'lignes_facture', 'paiements', 'audit_logs',
    'analyses_laboratoire', 'suivis_hospitalisation', 'mouvements_stock', 'actes_tarifs'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- -------------------------------------------------------------------------
-- 3. POLITIQUES PAR TABLE
-- Groupes de rôles (identiques à src/lib/role-permissions.ts) :
--   ADMIN        super_admin, admin
--   MÉDECINS     medecin_chef, medecin
--   INFIRMIERS   infirmier_chef, infirmier
--   module consultations / hospitalisation : super_admin + médecins + infirmiers
--   module pharmacie    : super_admin, admin, médecins, pharmacien
--   module laboratoire  : super_admin, médecins, technicien_labo
--   module patients     : tous sauf pharmacien et caissier
--   module rendez-vous  : super_admin, admin, médecins, infirmiers, receptionniste
--   module facturation  : super_admin, admin, caissier
--   module chambres     : super_admin, admin, médecins, infirmiers
-- Les expressions sont placées dans des sous-requêtes (SELECT ...) pour être
-- évaluées une seule fois par requête (performances).
-- -------------------------------------------------------------------------

-- ===== PERSONNEL =====
CREATE POLICY "personnel_select" ON personnel FOR SELECT TO authenticated
  USING ((SELECT public.is_staff()));
CREATE POLICY "personnel_insert" ON personnel FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin'])));
-- Mise à jour : administrateurs, ou l'utilisateur sur sa propre fiche (champs protégés par trigger)
CREATE POLICY "personnel_update" ON personnel FOR UPDATE TO authenticated
  USING (
    (SELECT public.has_role(ARRAY['super_admin','admin']))
    OR (lower(email) = lower(auth.jwt() ->> 'email') AND (SELECT public.is_staff()))
  )
  WITH CHECK (
    (SELECT public.has_role(ARRAY['super_admin','admin']))
    OR (lower(email) = lower(auth.jwt() ->> 'email') AND (SELECT public.is_staff()))
  );
CREATE POLICY "personnel_delete" ON personnel FOR DELETE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin'])));

-- Empêche l'élévation de privilèges (changer son rôle, son statut, son email...)
CREATE OR REPLACE FUNCTION public.protect_personnel_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT := public.app_role();
BEGIN
  -- Appels système (clé service, scripts d'administration) : pas de restriction
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  IF v_role = 'admin' THEN
    -- Un administrateur ne peut ni créer ni modifier un super administrateur
    IF NEW.role = 'super_admin' OR (TG_OP = 'UPDATE' AND OLD.role = 'super_admin') THEN
      RAISE EXCEPTION 'Seul un super administrateur peut gérer un compte super administrateur.';
    END IF;
    RETURN NEW;
  END IF;

  -- Autres rôles : seules les coordonnées personnelles sont modifiables
  IF TG_OP = 'INSERT'
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.statut IS DISTINCT FROM OLD.statut
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.code_personnel IS DISTINCT FROM OLD.code_personnel
     OR NEW.departement_id IS DISTINCT FROM OLD.departement_id
     OR NEW.date_embauche IS DISTINCT FROM OLD.date_embauche THEN
    RAISE EXCEPTION 'Modification non autorisée : seuls les administrateurs peuvent changer le rôle, le statut ou l''affectation.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_personnel ON personnel;
CREATE TRIGGER trg_protect_personnel
  BEFORE INSERT OR UPDATE ON personnel
  FOR EACH ROW EXECUTE FUNCTION public.protect_personnel_fields();

-- ===== DÉPARTEMENTS =====
CREATE POLICY "departements_select" ON departements FOR SELECT TO authenticated
  USING ((SELECT public.is_staff()));
CREATE POLICY "departements_write" ON departements FOR ALL TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin'])))
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin'])));

-- ===== PATIENTS =====
-- Identité lisible par tout le personnel (nécessaire en caisse, pharmacie, laboratoire)
CREATE POLICY "patients_select" ON patients FOR SELECT TO authenticated
  USING ((SELECT public.is_staff()));
CREATE POLICY "patients_insert" ON patients FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','infirmier_chef','infirmier','technicien_labo','receptionniste'])));
CREATE POLICY "patients_update" ON patients FOR UPDATE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','infirmier_chef','infirmier','technicien_labo','receptionniste'])))
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','infirmier_chef','infirmier','technicien_labo','receptionniste'])));
CREATE POLICY "patients_delete" ON patients FOR DELETE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin'])));

-- ===== RENDEZ-VOUS =====
CREATE POLICY "rdv_select" ON rendez_vous FOR SELECT TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','infirmier_chef','infirmier','receptionniste'])));
CREATE POLICY "rdv_insert" ON rendez_vous FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','infirmier_chef','infirmier','receptionniste'])));
CREATE POLICY "rdv_update" ON rendez_vous FOR UPDATE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','infirmier_chef','infirmier','receptionniste'])))
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','infirmier_chef','infirmier','receptionniste'])));
CREATE POLICY "rdv_delete" ON rendez_vous FOR DELETE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin'])));

-- ===== CONSULTATIONS (secret médical) =====
-- Lecture : soignants, pharmacien (comptoir de délivrance), administrateur (rapports)
CREATE POLICY "consultations_select" ON consultations FOR SELECT TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','infirmier_chef','infirmier','pharmacien'])));
CREATE POLICY "consultations_insert" ON consultations FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','medecin_chef','medecin','infirmier_chef','infirmier'])));
CREATE POLICY "consultations_update" ON consultations FOR UPDATE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','medecin_chef','medecin','infirmier_chef','infirmier'])))
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','medecin_chef','medecin','infirmier_chef','infirmier'])));
CREATE POLICY "consultations_delete" ON consultations FOR DELETE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin'])));

-- ===== PRESCRIPTIONS =====
CREATE POLICY "prescriptions_select" ON prescriptions FOR SELECT TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','infirmier_chef','infirmier','pharmacien','caissier'])));
CREATE POLICY "prescriptions_insert" ON prescriptions FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','medecin_chef','medecin','infirmier_chef','infirmier'])));
-- Mise à jour : prescripteurs (annulation) et pharmacie (délivrance)
CREATE POLICY "prescriptions_update" ON prescriptions FOR UPDATE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','infirmier_chef','infirmier','pharmacien'])))
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','infirmier_chef','infirmier','pharmacien'])));
CREATE POLICY "prescriptions_delete" ON prescriptions FOR DELETE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin'])));

-- ===== MÉDICAMENTS =====
CREATE POLICY "medicaments_select" ON medicaments FOR SELECT TO authenticated
  USING ((SELECT public.is_staff()));
CREATE POLICY "medicaments_write" ON medicaments FOR ALL TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','pharmacien'])))
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','pharmacien'])));

-- ===== MOUVEMENTS DE STOCK (traçabilité : pas de modification) =====
CREATE POLICY "mouvements_select" ON mouvements_stock FOR SELECT TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','pharmacien','caissier'])));
CREATE POLICY "mouvements_insert" ON mouvements_stock FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','pharmacien'])));
CREATE POLICY "mouvements_delete" ON mouvements_stock FOR DELETE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin'])));

-- ===== LABORATOIRE =====
CREATE POLICY "analyses_select" ON analyses_laboratoire FOR SELECT TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','infirmier_chef','infirmier','technicien_labo','caissier'])));
CREATE POLICY "analyses_insert" ON analyses_laboratoire FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','medecin_chef','medecin','infirmier_chef','infirmier','technicien_labo'])));
CREATE POLICY "analyses_update" ON analyses_laboratoire FOR UPDATE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','medecin_chef','medecin','technicien_labo'])))
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','medecin_chef','medecin','technicien_labo'])));
CREATE POLICY "analyses_delete" ON analyses_laboratoire FOR DELETE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin'])));

-- ===== CHAMBRES & LITS =====
CREATE POLICY "chambres_select" ON chambres FOR SELECT TO authenticated
  USING ((SELECT public.is_staff()));
CREATE POLICY "chambres_write" ON chambres FOR ALL TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','infirmier_chef','infirmier'])))
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','infirmier_chef','infirmier'])));

CREATE POLICY "lits_select" ON lits FOR SELECT TO authenticated
  USING ((SELECT public.is_staff()));
CREATE POLICY "lits_write" ON lits FOR ALL TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','infirmier_chef','infirmier'])))
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','infirmier_chef','infirmier'])));

-- ===== HOSPITALISATIONS =====
CREATE POLICY "hospitalisations_select" ON hospitalisations FOR SELECT TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','infirmier_chef','infirmier','caissier'])));
CREATE POLICY "hospitalisations_insert" ON hospitalisations FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','medecin_chef','medecin','infirmier_chef','infirmier'])));
CREATE POLICY "hospitalisations_update" ON hospitalisations FOR UPDATE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','medecin_chef','medecin','infirmier_chef','infirmier'])))
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','medecin_chef','medecin','infirmier_chef','infirmier'])));
CREATE POLICY "hospitalisations_delete" ON hospitalisations FOR DELETE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin'])));

CREATE POLICY "suivis_select" ON suivis_hospitalisation FOR SELECT TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','medecin_chef','medecin','infirmier_chef','infirmier'])));
CREATE POLICY "suivis_insert" ON suivis_hospitalisation FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','medecin_chef','medecin','infirmier_chef','infirmier'])));
CREATE POLICY "suivis_delete" ON suivis_hospitalisation FOR DELETE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin'])));

-- ===== FACTURATION =====
-- Lecture des factures et paiements : caisse, administration, médecin chef (rapports),
-- et personnel d'accueil (situation financière dans le dossier patient)
CREATE POLICY "factures_select" ON factures FOR SELECT TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin','caissier','medecin_chef','medecin','infirmier_chef','infirmier','technicien_labo','receptionniste'])));
CREATE POLICY "factures_insert" ON factures FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin','caissier'])));
CREATE POLICY "factures_update" ON factures FOR UPDATE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin','caissier'])))
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin','caissier'])));
CREATE POLICY "factures_delete" ON factures FOR DELETE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin'])));

CREATE POLICY "lignes_select" ON lignes_facture FOR SELECT TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin','caissier'])));
CREATE POLICY "lignes_write" ON lignes_facture FOR ALL TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin','caissier'])))
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin','caissier'])));

CREATE POLICY "paiements_select" ON paiements FOR SELECT TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin','caissier','medecin_chef','medecin','infirmier_chef','infirmier','technicien_labo','receptionniste'])));
CREATE POLICY "paiements_insert" ON paiements FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin','caissier'])));
-- Un paiement encaissé ne se modifie ni ne se supprime (sauf super administrateur)
CREATE POLICY "paiements_update" ON paiements FOR UPDATE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin'])))
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin'])));
CREATE POLICY "paiements_delete" ON paiements FOR DELETE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin'])));

CREATE POLICY "actes_select" ON actes_tarifs FOR SELECT TO authenticated
  USING ((SELECT public.is_staff()));
CREATE POLICY "actes_write" ON actes_tarifs FOR ALL TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin','caissier'])))
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin','caissier'])));

-- ===== JOURNAL D'AUDIT (lecture seule, administrateurs) =====
CREATE POLICY "audit_select" ON audit_logs FOR SELECT TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin'])));

-- -------------------------------------------------------------------------
-- 4. OPÉRATIONS ATOMIQUES (protection contre les accès simultanés)
-- -------------------------------------------------------------------------

-- Délivrance d'un médicament : vérification et décrément du stock en une seule transaction
CREATE OR REPLACE FUNCTION public.delivrer_prescription(p_prescription_id UUID, p_medicament_id UUID, p_quantite INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_med RECORD;
  v_presc RECORD;
  v_stock_apres INTEGER;
  v_auteur UUID;
BEGIN
  IF NOT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','pharmacien']) THEN
    RAISE EXCEPTION 'Action réservée à la pharmacie.';
  END IF;
  IF p_quantite IS NULL OR p_quantite <= 0 THEN
    RAISE EXCEPTION 'Quantité invalide.';
  END IF;

  -- Verrouillage des lignes : deux délivrances simultanées sont traitées l'une après l'autre
  SELECT * INTO v_presc FROM prescriptions WHERE id = p_prescription_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prescription introuvable.'; END IF;
  IF v_presc.statut <> 'active' THEN RAISE EXCEPTION 'Cette prescription a déjà été traitée.'; END IF;

  SELECT * INTO v_med FROM medicaments WHERE id = p_medicament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Médicament introuvable.'; END IF;
  IF v_med.date_peremption IS NOT NULL AND v_med.date_peremption < CURRENT_DATE THEN
    RAISE EXCEPTION 'Ce lot est périmé.';
  END IF;
  IF v_med.stock_actuel < p_quantite THEN
    RAISE EXCEPTION 'Stock insuffisant : % unité(s) disponible(s).', v_med.stock_actuel;
  END IF;

  v_stock_apres := v_med.stock_actuel - p_quantite;
  UPDATE medicaments
    SET stock_actuel = v_stock_apres,
        statut = CASE WHEN v_stock_apres <= 0 THEN 'rupture' ELSE statut END
    WHERE id = p_medicament_id;

  UPDATE prescriptions SET statut = 'dispensée', medicament_id = COALESCE(medicament_id, p_medicament_id)
    WHERE id = p_prescription_id;

  SELECT id INTO v_auteur FROM personnel WHERE lower(email) = lower(auth.jwt() ->> 'email') LIMIT 1;
  INSERT INTO mouvements_stock (medicament_id, type, quantite, stock_avant, stock_apres, motif, prescription_id, auteur_id)
  VALUES (p_medicament_id, 'sortie', -p_quantite, v_med.stock_actuel, v_stock_apres, 'Délivrance sur ordonnance', p_prescription_id, v_auteur);

  RETURN jsonb_build_object('stock_avant', v_med.stock_actuel, 'stock_apres', v_stock_apres);
END;
$$;

-- Mouvement de stock manuel (entrée, inventaire, retrait) en une seule transaction
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
  IF NOT public.has_role(ARRAY['super_admin','admin','medecin_chef','medecin','pharmacien']) THEN
    RAISE EXCEPTION 'Action réservée à la pharmacie.';
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

-- Admission : réservation du lit et création du séjour en une seule transaction
CREATE OR REPLACE FUNCTION public.admettre_patient(
  p_patient_id UUID, p_lit_id UUID, p_medecin_id UUID, p_motif TEXT,
  p_type_admission TEXT, p_diagnostic_entree TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lit RECORD;
  v_id UUID;
BEGIN
  IF NOT public.has_role(ARRAY['super_admin','medecin_chef','medecin','infirmier_chef','infirmier']) THEN
    RAISE EXCEPTION 'Action réservée au personnel soignant.';
  END IF;

  SELECT * INTO v_lit FROM lits WHERE id = p_lit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lit introuvable.'; END IF;
  IF v_lit.statut <> 'disponible' THEN
    RAISE EXCEPTION 'Ce lit vient d''être attribué à un autre patient. Veuillez en choisir un autre.';
  END IF;

  PERFORM 1 FROM hospitalisations WHERE patient_id = p_patient_id AND statut = 'actif' FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'Ce patient est déjà hospitalisé.';
  END IF;

  INSERT INTO hospitalisations (patient_id, medecin_responsable_id, lit_id, motif_admission, type_admission, diagnostic_entree, date_admission, statut)
  VALUES (p_patient_id, p_medecin_id, p_lit_id, p_motif, p_type_admission, NULLIF(trim(p_diagnostic_entree), ''), NOW(), 'actif')
  RETURNING id INTO v_id;

  UPDATE lits SET statut = 'occupé' WHERE id = p_lit_id;
  RETURN v_id;
END;
$$;

-- Changement de lit en une seule transaction
CREATE OR REPLACE FUNCTION public.transferer_lit(p_hospitalisation_id UUID, p_nouveau_lit_id UUID, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hosp RECORD;
  v_lit RECORD;
  v_auteur UUID;
BEGIN
  IF NOT public.has_role(ARRAY['super_admin','medecin_chef','medecin','infirmier_chef','infirmier']) THEN
    RAISE EXCEPTION 'Action réservée au personnel soignant.';
  END IF;

  SELECT * INTO v_hosp FROM hospitalisations WHERE id = p_hospitalisation_id FOR UPDATE;
  IF NOT FOUND OR v_hosp.statut <> 'actif' THEN RAISE EXCEPTION 'Séjour introuvable ou clôturé.'; END IF;

  SELECT * INTO v_lit FROM lits WHERE id = p_nouveau_lit_id FOR UPDATE;
  IF NOT FOUND OR v_lit.statut <> 'disponible' THEN
    RAISE EXCEPTION 'Ce lit n''est plus disponible.';
  END IF;

  UPDATE hospitalisations SET lit_id = p_nouveau_lit_id WHERE id = p_hospitalisation_id;
  UPDATE lits SET statut = 'occupé' WHERE id = p_nouveau_lit_id;
  IF v_hosp.lit_id IS NOT NULL THEN
    UPDATE lits SET statut = 'disponible' WHERE id = v_hosp.lit_id;
  END IF;

  SELECT id INTO v_auteur FROM personnel WHERE lower(email) = lower(auth.jwt() ->> 'email') LIMIT 1;
  INSERT INTO suivis_hospitalisation (hospitalisation_id, auteur_id, type, note)
  VALUES (p_hospitalisation_id, v_auteur, 'observation', COALESCE(p_note, 'Transfert de lit'));
END;
$$;

-- Enregistrement d'un paiement : contrôle du reste à payer et mise à jour du statut
CREATE OR REPLACE FUNCTION public.encaisser_paiement(p_facture_id UUID, p_montant NUMERIC, p_mode TEXT, p_reference TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fac RECORD;
  v_deja NUMERIC;
  v_total NUMERIC;
  v_statut TEXT;
  v_auteur UUID;
  v_id UUID;
BEGIN
  IF NOT public.has_role(ARRAY['super_admin','admin','caissier']) THEN
    RAISE EXCEPTION 'Action réservée à la caisse.';
  END IF;
  IF p_montant IS NULL OR p_montant <= 0 THEN RAISE EXCEPTION 'Montant invalide.'; END IF;

  SELECT * INTO v_fac FROM factures WHERE id = p_facture_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Facture introuvable.'; END IF;
  IF v_fac.statut = 'annulée' THEN RAISE EXCEPTION 'Facture annulée : encaissement impossible.'; END IF;

  SELECT COALESCE(SUM(montant), 0) INTO v_deja FROM paiements WHERE facture_id = p_facture_id;
  IF p_montant > v_fac.montant_patient - v_deja THEN
    RAISE EXCEPTION 'Le montant dépasse le reste à payer (% FC).', v_fac.montant_patient - v_deja;
  END IF;

  SELECT id INTO v_auteur FROM personnel WHERE lower(email) = lower(auth.jwt() ->> 'email') LIMIT 1;
  INSERT INTO paiements (facture_id, montant, mode_paiement, reference, recu_par, date_paiement)
  VALUES (p_facture_id, p_montant, p_mode, NULLIF(trim(p_reference), ''), v_auteur, NOW())
  RETURNING id INTO v_id;

  v_total := v_deja + p_montant;
  v_statut := CASE WHEN v_total >= v_fac.montant_patient THEN 'payée' ELSE 'partielle' END;
  UPDATE factures SET statut = v_statut WHERE id = p_facture_id;

  RETURN jsonb_build_object('paiement_id', v_id, 'total_paye', v_total, 'statut', v_statut);
END;
$$;

DO $$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.delivrer_prescription(uuid, uuid, integer)',
    'public.mouvement_stock(uuid, text, integer, text, text, text, date)',
    'public.admettre_patient(uuid, uuid, uuid, text, text, text)',
    'public.transferer_lit(uuid, uuid, text)',
    'public.encaisser_paiement(uuid, numeric, text, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

-- Les fonctions d'audit et de protection ne doivent pas être appelables directement
REVOKE ALL ON FUNCTION public.nyagbadali_audit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_personnel_fields() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
