-- =========================================================================
-- NYAGBADALI — FACTURATION GLOBALE DU PATIENT (10/10/2026)
-- -------------------------------------------------------------------------
-- À exécuter dans l'éditeur SQL de Supabase, APRÈS 20261010_securite_roles.sql.
--
-- Chaque ligne de facture est désormais reliée à l'élément facturé
-- (consultation, médicament délivré, analyse, journées d'hospitalisation).
-- La fonction elements_a_facturer() liste tout ce qui reste à facturer :
--   * un élément déjà présent sur une facture non annulée n'est plus proposé
--     (pas de double facturation) ;
--   * pour un séjour, seules les journées non encore facturées sont proposées
--     (facturation intermédiaire possible pendant un long séjour) ;
--   * la caisse n'obtient que les informations de facturation (date, acte,
--     quantité, prix) et jamais le contenu médical (secret médical).
-- Idempotent : peut être relancé sans risque.
-- =========================================================================

ALTER TABLE lignes_facture ADD COLUMN IF NOT EXISTS source_type VARCHAR(20);
ALTER TABLE lignes_facture ADD COLUMN IF NOT EXISTS source_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lignes_facture_source_type_check') THEN
    ALTER TABLE lignes_facture ADD CONSTRAINT lignes_facture_source_type_check
      CHECK (source_type IS NULL OR source_type IN ('consultation', 'prescription', 'analyse', 'hospitalisation'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lignes_facture_source ON lignes_facture(source_type, source_id);

-- -------------------------------------------------------------------------
-- Éléments restant à facturer (pour un patient, ou pour tous si NULL)
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
      ('Dr ' || COALESCE(pe.prenom || ' ', '') || COALESCE(pe.nom, '') || COALESCE(' — ' || pe.specialite, ''))::TEXT AS det,
      1 AS qte,
      (CASE WHEN pe.specialite IS NULL OR lower(pe.specialite) LIKE '%général%' THEN 'CS-GEN' ELSE 'CS-SPE' END)::TEXT AS code,
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
      1 AS qte, NULL::TEXT AS code,
      a.consultation_id AS cid, NULL::UUID AS hid
    FROM analyses_laboratoire a
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
