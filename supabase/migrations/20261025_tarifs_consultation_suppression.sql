-- =========================================================================
-- NYAGBADALI — TARIF DE CONSULTATION SELON LE CONSULTANT
--              ET SUPPRESSION DES TARIFS RÉSERVÉE AU SUPER ADMIN (25/10/2026)
-- -------------------------------------------------------------------------
-- À exécuter dans l'éditeur SQL de Supabase, APRÈS 20261021_catalogue_examens.sql.
--
--   1. Seul le super administrateur peut supprimer un acte du catalogue
--      (l'administrateur garde l'ajout, la modification et la désactivation).
--   2. Une consultation est facturée selon la personne qui l'a réalisée :
--        • médecin, médecin chef ou administrateur → CONS-001 (Consultation Médecin)
--        • infirmier ou infirmier chef            → CONS-002 (Consultation Infirmier)
--      Les deux actes sont créés s'ils n'existent pas encore (prix à 0 :
--      fixez le tarif dans Facturation › Catalogue des actes & tarifs).
-- Idempotent : peut être relancé sans risque.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. SUPPRESSION D'UN TARIF : SUPER ADMINISTRATEUR UNIQUEMENT
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "actes_delete" ON actes_tarifs;
CREATE POLICY "actes_delete" ON actes_tarifs FOR DELETE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin'])));

-- -------------------------------------------------------------------------
-- 2. ACTES DE CONSULTATION
-- -------------------------------------------------------------------------
INSERT INTO actes_tarifs (code, libelle, categorie, prix, actif) VALUES
  ('CONS-001', 'Consultation Médecin', 'consultation', 0, TRUE),
  ('CONS-002', 'Consultation Infirmier', 'consultation', 0, TRUE)
ON CONFLICT (code) DO NOTHING;

-- -------------------------------------------------------------------------
-- 3. ÉLÉMENTS À FACTURER : CODE DE CONSULTATION SELON LE RÔLE DU CONSULTANT
-- -------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.elements_a_facturer(UUID);

CREATE OR REPLACE FUNCTION public.elements_a_facturer(p_patient_id UUID DEFAULT NULL)
RETURNS TABLE (
  patient_id UUID,
  patient_nom TEXT,
  patient_code TEXT,
  source_type TEXT,
  source_id UUID,
  date_element TIMESTAMPTZ,
  libelle TEXT,
  details TEXT,
  quantite INTEGER,
  prix_unitaire NUMERIC,
  code_acte TEXT,
  consultation_id UUID,
  hospitalisation_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(ARRAY['super_admin', 'admin', 'caissier']) THEN
    RAISE EXCEPTION 'Action réservée à la caisse.';
  END IF;

  RETURN QUERY
  WITH
  -- Lignes déjà facturées (factures non annulées)
  facture AS (
    SELECT lf.source_type AS st, lf.source_id AS sid, lf.quantite AS qte, lf.code_acte AS code, f.consultation_id AS f_cons, f.hospitalisation_id AS f_hosp
    FROM lignes_facture lf
    JOIN factures f ON f.id = lf.facture_id
    WHERE f.statut <> 'annulée'
  ),
  -- Consultations facturées avec l'ancien système (facture rattachée sans lien ligne par ligne)
  cons_legacy AS (
    SELECT DISTINCT f.consultation_id AS cid
    FROM factures f
    WHERE f.consultation_id IS NOT NULL AND f.statut <> 'annulée'
      AND NOT EXISTS (SELECT 1 FROM lignes_facture lf WHERE lf.facture_id = f.id AND lf.source_type IS NOT NULL)
  ),
  tarifs AS (
    SELECT a.code, a.prix FROM actes_tarifs a WHERE a.actif
  ),
  -- 1. Consultations
  consult AS (
    SELECT
      c.patient_id, 'consultation'::TEXT AS st, c.id AS sid, c.date_consultation AS d,
      ('Consultation du ' || to_char(c.date_consultation AT TIME ZONE 'Africa/Lubumbashi', 'DD/MM/YYYY'))::TEXT AS lib,
      ((CASE WHEN pe.role IN ('infirmier', 'infirmier_chef') THEN 'Inf. ' ELSE 'Dr ' END)
        || COALESCE(pe.prenom || ' ', '') || COALESCE(pe.nom, '') || COALESCE(' — ' || pe.specialite, ''))::TEXT AS det,
      1 AS qte,
      -- Consultation faite par un infirmier : CONS-002 ; par un médecin ou un administrateur : CONS-001
      (CASE WHEN pe.role IN ('infirmier', 'infirmier_chef') THEN 'CONS-002' ELSE 'CONS-001' END)::TEXT AS code,
      c.id AS cid, NULL::UUID AS hid
    FROM consultations c
    LEFT JOIN personnel pe ON pe.id = c.medecin_id
    WHERE (p_patient_id IS NULL OR c.patient_id = p_patient_id)
      AND c.statut <> 'annulée'
      AND NOT EXISTS (SELECT 1 FROM facture x WHERE x.st = 'consultation' AND x.sid = c.id)
      AND c.id NOT IN (SELECT cid FROM cons_legacy)
  ),
  -- 2. Médicaments délivrés par la pharmacie
  presc AS (
    SELECT
      c.patient_id, 'prescription'::TEXT AS st, p.id AS sid,
      COALESCE((SELECT max(m.created_at) FROM mouvements_stock m WHERE m.prescription_id = p.id), p.created_at) AS d,
      (COALESCE(md.nom_commercial, p.nom_medicament) || COALESCE(' ' || NULLIF(p.dosage, ''), ''))::TEXT AS lib,
      'Médicament délivré'::TEXT AS det,
      GREATEST(1, COALESCE((SELECT sum(abs(m.quantite)) FROM mouvements_stock m WHERE m.prescription_id = p.id AND m.type = 'sortie'), 1))::INTEGER AS qte,
      'PHARMA'::TEXT AS code,
      c.id AS cid, NULL::UUID AS hid,
      md.prix_unitaire AS prix
    FROM prescriptions p
    JOIN consultations c ON c.id = p.consultation_id
    LEFT JOIN medicaments md ON md.id = p.medicament_id
    WHERE (p_patient_id IS NULL OR c.patient_id = p_patient_id)
      AND p.statut = 'dispensée'
      AND NOT EXISTS (SELECT 1 FROM facture x WHERE x.st = 'prescription' AND x.sid = p.id)
      AND c.id NOT IN (SELECT cid FROM cons_legacy)
  ),
  -- 3. Examens de laboratoire (dès la demande : le patient règle souvent avant le prélèvement)
  labo AS (
    SELECT
      a.patient_id, 'analyse'::TEXT AS st, a.id AS sid, a.date_demande AS d,
      a.type_analyse::TEXT AS lib,
      (CASE WHEN a.urgent THEN 'Examen de laboratoire — urgent' ELSE 'Examen de laboratoire' END)::TEXT AS det,
      1 AS qte, ex.code::TEXT AS code,
      a.consultation_id AS cid, NULL::UUID AS hid
    FROM analyses_laboratoire a
    LEFT JOIN actes_tarifs ex ON ex.id = a.acte_id
    WHERE (p_patient_id IS NULL OR a.patient_id = p_patient_id)
      AND a.statut <> 'annulé'
      AND NOT EXISTS (SELECT 1 FROM facture x WHERE x.st = 'analyse' AND x.sid = a.id)
      AND (a.consultation_id IS NULL OR a.consultation_id NOT IN (SELECT cid FROM cons_legacy))
  ),
  -- 4. Journées d'hospitalisation restant à facturer
  sejour AS (
    SELECT
      h.patient_id, h.id AS hid, h.date_admission, h.date_sortie, l.type_lit,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (COALESCE(h.date_sortie, NOW()) - h.date_admission)) / 86400.0))::INTEGER AS jours,
      COALESCE((SELECT sum(x.qte) FROM facture x WHERE x.st = 'hospitalisation' AND x.sid = h.id), 0)
        + COALESCE((SELECT sum(x.qte) FROM facture x WHERE x.st IS NULL AND x.f_hosp = h.id AND x.code LIKE 'HOSP%'), 0) AS deja
    FROM hospitalisations h
    LEFT JOIN lits l ON l.id = h.lit_id
    WHERE (p_patient_id IS NULL OR h.patient_id = p_patient_id)
  ),
  hosp AS (
    SELECT
      s.patient_id, 'hospitalisation'::TEXT AS st, s.hid AS sid, s.date_admission AS d,
      (CASE WHEN s.type_lit = 'soins_intensifs' THEN 'Journées de soins intensifs' ELSE 'Journées d''hospitalisation' END)::TEXT AS lib,
      ('Séjour du ' || to_char(s.date_admission AT TIME ZONE 'Africa/Lubumbashi', 'DD/MM/YYYY')
        || CASE WHEN s.date_sortie IS NULL THEN ' (en cours)' ELSE ' au ' || to_char(s.date_sortie AT TIME ZONE 'Africa/Lubumbashi', 'DD/MM/YYYY') END
        || CASE WHEN s.deja > 0 THEN ' — ' || s.deja || ' j déjà facturé(s)' ELSE '' END)::TEXT AS det,
      (s.jours - s.deja)::INTEGER AS qte,
      (CASE WHEN s.type_lit = 'soins_intensifs' THEN 'HOSP-SI' ELSE 'HOSP-STD' END)::TEXT AS code,
      NULL::UUID AS cid, s.hid AS hid
    FROM sejour s
    WHERE s.jours - s.deja > 0
  ),
  tout AS (
    SELECT c.patient_id, c.st, c.sid, c.d, c.lib, c.det, c.qte, c.code, c.cid, c.hid, NULL::NUMERIC AS prix FROM consult c
    UNION ALL SELECT p.patient_id, p.st, p.sid, p.d, p.lib, p.det, p.qte, p.code, p.cid, p.hid, p.prix FROM presc p
    UNION ALL SELECT l.patient_id, l.st, l.sid, l.d, l.lib, l.det, l.qte, l.code, l.cid, l.hid, NULL::NUMERIC FROM labo l
    UNION ALL SELECT h.patient_id, h.st, h.sid, h.d, h.lib, h.det, h.qte, h.code, h.cid, h.hid, NULL::NUMERIC FROM hosp h
  )
  SELECT
    t.patient_id,
    (pa.prenom || ' ' || pa.nom)::TEXT,
    pa.code_patient::TEXT,
    t.st, t.sid, t.d, t.lib, t.det, t.qte,
    COALESCE(t.prix, ta.prix),
    t.code, t.cid, t.hid
  FROM tout t
  JOIN patients pa ON pa.id = t.patient_id
  LEFT JOIN tarifs ta ON ta.code = t.code
  ORDER BY pa.nom, pa.prenom, t.d;
END;
$$;

REVOKE ALL ON FUNCTION public.elements_a_facturer(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.elements_a_facturer(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
