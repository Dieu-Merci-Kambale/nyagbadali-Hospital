-- =========================================================================
-- NYAGBADALI — CATALOGUE DES EXAMENS DE LABORATOIRE (21/10/2026)
-- -------------------------------------------------------------------------
-- À exécuter dans l'éditeur SQL de Supabase, APRÈS 20261013_factures_labo_prescriptions.sql.
--
--   1. Les examens de laboratoire sont les actes de catégorie « laboratoire »
--      du catalogue des tarifs, enrichis d'une famille (Hématologie, Biochimie…)
--      et des paramètres de résultat (unité, valeurs de référence).
--      Seuls le super administrateur et l'administrateur les créent et fixent
--      leur prix (politiques actes_insert / actes_update inchangées).
--   2. Chaque examen demandé est rattaché à son acte (acte_id) : la saisie
--      libre n'est plus acceptée, seul un examen actif du catalogue peut être
--      demandé.
--   3. La facturation reprend le code et le prix de l'acte de l'examen.
-- Idempotent : peut être relancé sans risque.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. FAMILLE ET PARAMÈTRES DES EXAMENS
-- -------------------------------------------------------------------------
ALTER TABLE actes_tarifs ADD COLUMN IF NOT EXISTS famille VARCHAR(30);
ALTER TABLE actes_tarifs ADD COLUMN IF NOT EXISTS parametres JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Paramètres des examens déjà présents au catalogue (sans écraser une saisie de l'administration)
UPDATE actes_tarifs a SET
  famille = COALESCE(a.famille, v.famille),
  parametres = CASE WHEN a.parametres = '[]'::jsonb THEN v.parametres::jsonb ELSE a.parametres END
FROM (VALUES
  ('LAB-NFS', 'Hématologie', '[{"nom":"Hémoglobine","unite":"g/dL","reference":"12 – 16"},{"nom":"Hématocrite","unite":"%","reference":"37 – 47"},{"nom":"Globules rouges","unite":"M/mm³","reference":"4,2 – 5,4"},{"nom":"Globules blancs","unite":"/mm³","reference":"4 000 – 10 000"},{"nom":"Neutrophiles","unite":"%","reference":"40 – 75"},{"nom":"Lymphocytes","unite":"%","reference":"20 – 45"},{"nom":"Plaquettes","unite":"/mm³","reference":"150 000 – 400 000"}]'),
  ('LAB-GE',  'Parasitologie', '[{"nom":"Résultat","unite":"","reference":"Négatif"},{"nom":"Espèce","unite":"","reference":"—"},{"nom":"Densité parasitaire","unite":"trophozoïtes/µL","reference":"0"}]'),
  ('LAB-GLY', 'Biochimie', '[{"nom":"Glycémie","unite":"g/L","reference":"0,70 – 1,10"}]'),
  ('LAB-LIP', 'Biochimie', '[{"nom":"Cholestérol total","unite":"g/L","reference":"< 2,00"},{"nom":"HDL-cholestérol","unite":"g/L","reference":"> 0,40"},{"nom":"LDL-cholestérol","unite":"g/L","reference":"< 1,60"},{"nom":"Triglycérides","unite":"g/L","reference":"< 1,50"}]'),
  ('LAB-HEP', 'Biochimie', '[{"nom":"ASAT (TGO)","unite":"UI/L","reference":"< 40"},{"nom":"ALAT (TGP)","unite":"UI/L","reference":"< 40"},{"nom":"Bilirubine totale","unite":"mg/L","reference":"< 10"},{"nom":"Phosphatases alcalines","unite":"UI/L","reference":"40 – 130"}]'),
  ('LAB-REN', 'Biochimie', '[{"nom":"Urée","unite":"g/L","reference":"0,15 – 0,45"},{"nom":"Créatinine","unite":"mg/L","reference":"6 – 12"}]'),
  ('LAB-GROS', 'Sérologie', '[{"nom":"β-HCG","unite":"","reference":"Négatif"}]')
) AS v(code, famille, parametres)
WHERE a.code = v.code;

-- Autres examens usuels, ajoutés DÉSACTIVÉS et sans prix : l'administration
-- fixe le tarif puis les active depuis Laboratoire › Catalogue des examens.
INSERT INTO actes_tarifs (code, libelle, categorie, famille, prix, actif, parametres) VALUES
  ('LAB-HBA1C', 'Hémoglobine glyquée (HbA1c)', 'laboratoire', 'Biochimie', 0, FALSE, '[{"nom":"HbA1c","unite":"%","reference":"< 6,5"}]'),
  ('LAB-CRP',   'Protéine C réactive (CRP)', 'laboratoire', 'Biochimie', 0, FALSE, '[{"nom":"CRP","unite":"mg/L","reference":"< 6"}]'),
  ('LAB-GS',    'Groupe sanguin & Rhésus', 'laboratoire', 'Hématologie', 0, FALSE, '[{"nom":"Groupe ABO","unite":"","reference":"—"},{"nom":"Rhésus","unite":"","reference":"—"}]'),
  ('LAB-WIDAL', 'Sérodiagnostic de Widal', 'laboratoire', 'Sérologie', 0, FALSE, '[{"nom":"Antigène O","unite":"","reference":"< 1/80"},{"nom":"Antigène H","unite":"","reference":"< 1/160"}]'),
  ('LAB-VIH',   'Sérologie VIH', 'laboratoire', 'Sérologie', 0, FALSE, '[{"nom":"Résultat","unite":"","reference":"Négatif"}]'),
  ('LAB-ECBU',  'Examen cytobactériologique des urines (ECBU)', 'laboratoire', 'Urines', 0, FALSE, '[{"nom":"Leucocytes","unite":"/mm³","reference":"< 10"},{"nom":"Hématies","unite":"/mm³","reference":"< 10"},{"nom":"Culture","unite":"","reference":"Stérile"}]'),
  ('LAB-KAOP',  'Examen parasitologique des selles (KAOP)', 'laboratoire', 'Parasitologie', 0, FALSE, '[{"nom":"Résultat","unite":"","reference":"Absence de parasites"}]')
ON CONFLICT (code) DO NOTHING;

-- -------------------------------------------------------------------------
-- 2. RATTACHEMENT DES EXAMENS DEMANDÉS À LEUR ACTE
-- -------------------------------------------------------------------------
ALTER TABLE analyses_laboratoire ADD COLUMN IF NOT EXISTS acte_id UUID REFERENCES actes_tarifs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_analyses_laboratoire_acte ON analyses_laboratoire(acte_id);

-- Examens déjà demandés : par libellé exact, puis par les noms de l'ancienne liste fixe
UPDATE analyses_laboratoire a SET acte_id = t.id
FROM actes_tarifs t
WHERE a.acte_id IS NULL AND t.categorie = 'laboratoire'
  AND lower(trim(t.libelle)) = lower(trim(a.type_analyse));

UPDATE analyses_laboratoire a SET acte_id = t.id
FROM (VALUES
  ('Hémogramme complet (NFS)', 'LAB-NFS'),
  ('Goutte épaisse / TDR paludisme', 'LAB-GE'),
  ('Glycémie à jeun', 'LAB-GLY'),
  ('Hémoglobine glyquée (HbA1c)', 'LAB-HBA1C'),
  ('Bilan lipidique', 'LAB-LIP'),
  ('Bilan hépatique', 'LAB-HEP'),
  ('Bilan rénal', 'LAB-REN'),
  ('Protéine C réactive (CRP)', 'LAB-CRP'),
  ('Groupe sanguin & Rhésus', 'LAB-GS'),
  ('Sérodiagnostic de Widal', 'LAB-WIDAL'),
  ('Sérologie VIH', 'LAB-VIH'),
  ('Test de grossesse (β-HCG)', 'LAB-GROS'),
  ('Examen cytobactériologique des urines (ECBU)', 'LAB-ECBU'),
  ('Examen parasitologique des selles (KAOP)', 'LAB-KAOP')
) AS m(nom, code)
JOIN actes_tarifs t ON t.code = m.code
WHERE a.acte_id IS NULL AND lower(a.type_analyse) = lower(m.nom);

-- Tout nouvel examen doit venir du catalogue (demande complète ou ajout à une demande)
CREATE OR REPLACE FUNCTION public.verifier_examen_catalogue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acte actes_tarifs%ROWTYPE;
BEGIN
  IF NEW.acte_id IS NOT NULL THEN
    SELECT * INTO v_acte FROM actes_tarifs WHERE id = NEW.acte_id AND categorie = 'laboratoire';
  ELSE
    SELECT * INTO v_acte FROM actes_tarifs
    WHERE categorie = 'laboratoire' AND lower(trim(libelle)) = lower(trim(NEW.type_analyse))
    ORDER BY actif DESC LIMIT 1;
  END IF;

  IF v_acte.id IS NULL THEN
    RAISE EXCEPTION '« % » ne figure pas au catalogue des examens : seuls les examens enregistrés par l''administration peuvent être demandés.', NEW.type_analyse;
  END IF;
  IF NOT v_acte.actif THEN
    RAISE EXCEPTION 'L''examen « % » est désactivé dans le catalogue : il ne peut plus être demandé.', v_acte.libelle;
  END IF;

  NEW.acte_id := v_acte.id;
  NEW.type_analyse := left(v_acte.libelle, 100);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verifier_examen_catalogue ON analyses_laboratoire;
CREATE TRIGGER trg_verifier_examen_catalogue
  BEFORE INSERT ON analyses_laboratoire
  FOR EACH ROW EXECUTE FUNCTION public.verifier_examen_catalogue();

-- -------------------------------------------------------------------------
-- 3. FACTURATION : CODE ET PRIX DE L'ACTE DE L'EXAMEN
-- (reprise de 20261010_facturation_globale.sql ; seul le bloc « labo » change)
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
