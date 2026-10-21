-- =========================================================================
-- NYAGBADALI — MODULE ASSURANCES (21/10/2026)
-- -------------------------------------------------------------------------
-- À exécuter dans l'éditeur SQL de Supabase, APRÈS 20261010_securite_roles.sql
-- (et de préférence après les autres scripts du 21/10/2026).
--
--   1. Assureurs enregistrés (taux de couverture, plafond, délai de paiement,
--      contrat, contact). Seuls le super administrateur et l'administrateur
--      les créent et les modifient ; tout le personnel les lit.
--   2. Patients rattachés à un assureur enregistré (assureur_id) : la saisie
--      d'un assureur inconnu est refusée.
--   3. Factures : la part assurance est rattachée à l'assureur du patient,
--      plafonnée, et verrouillée dès qu'elle est réclamée ou réglée.
--   4. Bordereaux (factures adressées à l'assureur), règlements des assureurs
--      ventilés par facture (comptabilisés dans les encaissements), litiges
--      par facture avec décision (payé par l'assureur, reporté au patient,
--      abandonné).
--   5. Vues de calcul : créances par facture et situation des bordereaux.
--
-- Droits : lecture et gestion des bordereaux, règlements et litiges pour
-- super_admin, admin et caissier ; annulation d'un règlement ou d'un bordereau
-- envoyé réservée à l'administration. Toutes les écritures passent par des
-- fonctions contrôlées ; chaque opération est tracée dans le journal d'audit.
-- Idempotent : peut être relancé sans risque, ne supprime aucune donnée.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. ASSUREURS
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assureurs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) UNIQUE NOT NULL,
    nom VARCHAR(150) NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'assurance',
    taux_couverture NUMERIC(5, 2) NOT NULL DEFAULT 80,
    plafond_facture NUMERIC(12, 2),
    delai_paiement_jours INTEGER NOT NULL DEFAULT 30,
    numero_contrat VARCHAR(60),
    date_debut_contrat DATE,
    date_fin_contrat DATE,
    contact_nom VARCHAR(150),
    telephone VARCHAR(40),
    email VARCHAR(150),
    adresse TEXT,
    notes TEXT,
    actif BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_assureurs_nom ON assureurs (lower(nom));

ALTER TABLE assureurs DROP CONSTRAINT IF EXISTS assureurs_type_check;
ALTER TABLE assureurs ADD CONSTRAINT assureurs_type_check
  CHECK (type IN ('assurance', 'mutuelle', 'entreprise', 'etat', 'ong', 'autre'));
ALTER TABLE assureurs DROP CONSTRAINT IF EXISTS assureurs_taux_check;
ALTER TABLE assureurs ADD CONSTRAINT assureurs_taux_check CHECK (taux_couverture BETWEEN 0 AND 100);
ALTER TABLE assureurs DROP CONSTRAINT IF EXISTS assureurs_plafond_check;
ALTER TABLE assureurs ADD CONSTRAINT assureurs_plafond_check CHECK (plafond_facture IS NULL OR plafond_facture > 0);
ALTER TABLE assureurs DROP CONSTRAINT IF EXISTS assureurs_delai_check;
ALTER TABLE assureurs ADD CONSTRAINT assureurs_delai_check CHECK (delai_paiement_jours BETWEEN 0 AND 365);
ALTER TABLE assureurs DROP CONSTRAINT IF EXISTS assureurs_contrat_check;
ALTER TABLE assureurs ADD CONSTRAINT assureurs_contrat_check
  CHECK (date_fin_contrat IS NULL OR date_debut_contrat IS NULL OR date_fin_contrat >= date_debut_contrat);

-- Assureurs déjà saisis dans les dossiers patients (ancienne liste fixe),
-- sauf « Autre » qui ne désigne aucun assureur précis
DO $$
DECLARE
  r RECORD;
  v_base TEXT;
  v_code TEXT;
  i INTEGER;
BEGIN
  FOR r IN
    SELECT DISTINCT trim(assureur) AS nom FROM patients
    WHERE NULLIF(trim(assureur), '') IS NOT NULL AND lower(trim(assureur)) <> 'autre'
  LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM assureurs WHERE lower(nom) = lower(r.nom));
    v_base := COALESCE(left(NULLIF(regexp_replace(upper(r.nom), '[^A-Z0-9]', '', 'g'), ''), 14), 'ASS');
    v_code := v_base;
    i := 1;
    WHILE EXISTS (SELECT 1 FROM assureurs WHERE code = v_code) LOOP
      i := i + 1;
      v_code := left(v_base, 12) || '-' || i;
    END LOOP;
    INSERT INTO assureurs (code, nom, notes)
    VALUES (v_code, r.nom, 'Créé automatiquement à partir des dossiers patients : vérifiez le taux de couverture, le délai de paiement et le contrat.');
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.assurances_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assureurs_updated_at ON assureurs;
CREATE TRIGGER trg_assureurs_updated_at BEFORE UPDATE ON assureurs
  FOR EACH ROW EXECUTE FUNCTION public.assurances_touch_updated_at();

-- -------------------------------------------------------------------------
-- 2. PATIENTS RATTACHÉS À UN ASSUREUR ENREGISTRÉ
-- -------------------------------------------------------------------------
ALTER TABLE patients ADD COLUMN IF NOT EXISTS assureur_id UUID REFERENCES assureurs(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_patients_assureur ON patients(assureur_id);

UPDATE patients p SET assureur_id = a.id
FROM assureurs a
WHERE p.assureur_id IS NULL AND a.actif AND lower(trim(p.assureur)) = lower(a.nom);

-- Le nom (colonne assureur, utilisée par les écrans et rapports) suit toujours l'assureur enregistré
CREATE OR REPLACE FUNCTION public.patients_assureur_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ass assureurs%ROWTYPE;
BEGIN
  -- Saisie par le nom seul : rattachement à l'assureur enregistré du même nom
  IF NEW.assureur_id IS NULL AND NULLIF(trim(NEW.assureur), '') IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assureur IS DISTINCT FROM OLD.assureur) THEN
    SELECT * INTO v_ass FROM assureurs WHERE lower(nom) = lower(trim(NEW.assureur));
    IF v_ass.id IS NULL THEN
      RAISE EXCEPTION 'Assureur « % » non enregistré : choisissez un assureur de la liste (les assureurs sont enregistrés par l''administration).', NEW.assureur;
    END IF;
    NEW.assureur_id := v_ass.id;
  END IF;

  IF NEW.assureur_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.assureur_id IS DISTINCT FROM OLD.assureur_id THEN
    SELECT * INTO v_ass FROM assureurs WHERE id = NEW.assureur_id;
    IF NOT v_ass.actif THEN
      RAISE EXCEPTION 'L''assureur « % » est désactivé : il ne peut plus être attribué à un patient.', v_ass.nom;
    END IF;
  END IF;
  NEW.assureur := (SELECT nom FROM assureurs WHERE id = NEW.assureur_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patients_assureur_sync ON patients;
CREATE TRIGGER trg_patients_assureur_sync BEFORE INSERT OR UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION public.patients_assureur_sync();

-- Changement de nom d'un assureur : reporté sur les dossiers patients
CREATE OR REPLACE FUNCTION public.assureurs_sync_patients()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.nom IS DISTINCT FROM OLD.nom THEN
    UPDATE patients SET assureur = NEW.nom WHERE assureur_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assureurs_sync_patients ON assureurs;
CREATE TRIGGER trg_assureurs_sync_patients AFTER UPDATE ON assureurs
  FOR EACH ROW EXECUTE FUNCTION public.assureurs_sync_patients();

-- -------------------------------------------------------------------------
-- 3. BORDEREAUX, RÈGLEMENTS ET LITIGES
-- -------------------------------------------------------------------------
ALTER TABLE factures ADD COLUMN IF NOT EXISTS assureur_id UUID REFERENCES assureurs(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_factures_assureur ON factures(assureur_id);

-- Bordereau : facture adressée à l'assureur, regroupant la part assurance de plusieurs factures patients
CREATE TABLE IF NOT EXISTS bordereaux_assurance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero VARCHAR(30) UNIQUE NOT NULL,
    assureur_id UUID NOT NULL REFERENCES assureurs(id) ON DELETE RESTRICT,
    periode_debut DATE,
    periode_fin DATE,
    date_emission TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_envoi TIMESTAMPTZ,
    date_echeance DATE,
    statut VARCHAR(20) NOT NULL DEFAULT 'brouillon',
    notes TEXT,
    motif_annulation TEXT,
    cree_par UUID REFERENCES personnel(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE bordereaux_assurance DROP CONSTRAINT IF EXISTS bordereaux_assurance_statut_check;
ALTER TABLE bordereaux_assurance ADD CONSTRAINT bordereaux_assurance_statut_check
  CHECK (statut IN ('brouillon', 'envoyé', 'annulé'));
CREATE INDEX IF NOT EXISTS idx_bordereaux_assureur ON bordereaux_assurance(assureur_id);

CREATE TABLE IF NOT EXISTS bordereau_factures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bordereau_id UUID NOT NULL REFERENCES bordereaux_assurance(id) ON DELETE CASCADE,
    facture_id UUID NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
    -- Montant réclamé à l'assureur pour cette facture au moment de l'inclusion
    montant NUMERIC(12, 2) NOT NULL CHECK (montant >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (bordereau_id, facture_id)
);
CREATE INDEX IF NOT EXISTS idx_bordereau_factures_facture ON bordereau_factures(facture_id);

-- Règlement reçu d'un assureur, ventilé sur ses factures
CREATE TABLE IF NOT EXISTS paiements_assurance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero VARCHAR(30) UNIQUE NOT NULL,
    assureur_id UUID NOT NULL REFERENCES assureurs(id) ON DELETE RESTRICT,
    bordereau_id UUID REFERENCES bordereaux_assurance(id) ON DELETE SET NULL,
    date_paiement TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    montant NUMERIC(12, 2) NOT NULL CHECK (montant > 0),
    mode_paiement VARCHAR(20) NOT NULL DEFAULT 'virement',
    reference VARCHAR(100),
    notes TEXT,
    statut VARCHAR(20) NOT NULL DEFAULT 'validé',
    motif_annulation TEXT,
    recu_par UUID REFERENCES personnel(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE paiements_assurance DROP CONSTRAINT IF EXISTS paiements_assurance_mode_check;
ALTER TABLE paiements_assurance ADD CONSTRAINT paiements_assurance_mode_check
  CHECK (mode_paiement IN ('virement', 'chèque', 'cash', 'mobile_money', 'carte'));
ALTER TABLE paiements_assurance DROP CONSTRAINT IF EXISTS paiements_assurance_statut_check;
ALTER TABLE paiements_assurance ADD CONSTRAINT paiements_assurance_statut_check
  CHECK (statut IN ('validé', 'annulé'));
CREATE INDEX IF NOT EXISTS idx_paiements_assurance_date ON paiements_assurance(date_paiement);
CREATE INDEX IF NOT EXISTS idx_paiements_assurance_assureur ON paiements_assurance(assureur_id);

CREATE TABLE IF NOT EXISTS paiements_assurance_factures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    paiement_id UUID NOT NULL REFERENCES paiements_assurance(id) ON DELETE CASCADE,
    facture_id UUID NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
    montant NUMERIC(12, 2) NOT NULL CHECK (montant > 0),
    UNIQUE (paiement_id, facture_id)
);
CREATE INDEX IF NOT EXISTS idx_paiements_assurance_factures_facture ON paiements_assurance_factures(facture_id);

-- Litige : montant d'une facture contesté (ou refusé) par l'assureur
CREATE TABLE IF NOT EXISTS litiges_assurance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero VARCHAR(30) UNIQUE NOT NULL,
    facture_id UUID NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
    assureur_id UUID NOT NULL REFERENCES assureurs(id) ON DELETE RESTRICT,
    date_ouverture TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    motif VARCHAR(30) NOT NULL DEFAULT 'autre',
    description TEXT,
    montant_conteste NUMERIC(12, 2) NOT NULL CHECK (montant_conteste > 0),
    statut VARCHAR(20) NOT NULL DEFAULT 'ouvert',
    -- Décision : part finalement payée par l'assureur, reportée au patient, abandonnée (perte)
    montant_accepte NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (montant_accepte >= 0),
    montant_transfere NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (montant_transfere >= 0),
    montant_abandonne NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (montant_abandonne >= 0),
    date_resolution TIMESTAMPTZ,
    resolution TEXT,
    ouvert_par UUID REFERENCES personnel(id) ON DELETE SET NULL,
    resolu_par UUID REFERENCES personnel(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE litiges_assurance DROP CONSTRAINT IF EXISTS litiges_assurance_motif_check;
ALTER TABLE litiges_assurance ADD CONSTRAINT litiges_assurance_motif_check CHECK (motif IN (
  'acte_non_couvert', 'plafond_depasse', 'pieces_manquantes', 'erreur_facturation',
  'assure_non_couvert', 'tarif_conteste', 'doublon', 'autre'
));
ALTER TABLE litiges_assurance DROP CONSTRAINT IF EXISTS litiges_assurance_statut_check;
ALTER TABLE litiges_assurance ADD CONSTRAINT litiges_assurance_statut_check
  CHECK (statut IN ('ouvert', 'en_cours', 'résolu', 'annulé'));
ALTER TABLE litiges_assurance DROP CONSTRAINT IF EXISTS litiges_assurance_decision_check;
ALTER TABLE litiges_assurance ADD CONSTRAINT litiges_assurance_decision_check
  CHECK (statut <> 'résolu' OR montant_accepte + montant_transfere + montant_abandonne = montant_conteste);
CREATE INDEX IF NOT EXISTS idx_litiges_assurance_facture ON litiges_assurance(facture_id);
CREATE INDEX IF NOT EXISTS idx_litiges_assurance_assureur ON litiges_assurance(assureur_id);

CREATE SEQUENCE IF NOT EXISTS seq_bordereaux_assurance;
CREATE SEQUENCE IF NOT EXISTS seq_paiements_assurance;
CREATE SEQUENCE IF NOT EXISTS seq_litiges_assurance;

DROP TRIGGER IF EXISTS trg_bordereaux_assurance_updated_at ON bordereaux_assurance;
CREATE TRIGGER trg_bordereaux_assurance_updated_at BEFORE UPDATE ON bordereaux_assurance
  FOR EACH ROW EXECUTE FUNCTION public.assurances_touch_updated_at();
DROP TRIGGER IF EXISTS trg_paiements_assurance_updated_at ON paiements_assurance;
CREATE TRIGGER trg_paiements_assurance_updated_at BEFORE UPDATE ON paiements_assurance
  FOR EACH ROW EXECUTE FUNCTION public.assurances_touch_updated_at();
DROP TRIGGER IF EXISTS trg_litiges_assurance_updated_at ON litiges_assurance;
CREATE TRIGGER trg_litiges_assurance_updated_at BEFORE UPDATE ON litiges_assurance
  FOR EACH ROW EXECUTE FUNCTION public.assurances_touch_updated_at();

-- -------------------------------------------------------------------------
-- 4. VUES DE CALCUL (droits de l'utilisateur appliqués : security_invoker)
-- -------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_bordereaux_assurance;
DROP VIEW IF EXISTS public.v_creances_assurance;

-- Créance de chaque facture sur son assureur
CREATE VIEW public.v_creances_assurance WITH (security_invoker = true) AS
WITH alloc AS (
  SELECT pf.facture_id, SUM(pf.montant) AS paye, MAX(pa.date_paiement) AS dernier_paiement
  FROM paiements_assurance_factures pf
  JOIN paiements_assurance pa ON pa.id = pf.paiement_id
  WHERE pa.statut = 'validé'
  GROUP BY pf.facture_id
),
lit AS (
  SELECT
    facture_id,
    COUNT(*) FILTER (WHERE statut IN ('ouvert', 'en_cours')) AS litiges_ouverts,
    COALESCE(SUM(montant_conteste) FILTER (WHERE statut IN ('ouvert', 'en_cours')), 0) AS montant_conteste,
    COALESCE(SUM(montant_abandonne) FILTER (WHERE statut = 'résolu'), 0) AS abandonne,
    COALESCE(SUM(montant_transfere) FILTER (WHERE statut = 'résolu'), 0) AS transfere,
    COUNT(*) FILTER (WHERE statut <> 'annulé') AS litiges_total
  FROM litiges_assurance
  GROUP BY facture_id
),
brd AS (
  SELECT DISTINCT ON (bf.facture_id)
    bf.facture_id, b.id AS bordereau_id, b.numero AS bordereau_numero, b.statut AS bordereau_statut,
    b.date_envoi, b.date_echeance
  FROM bordereau_factures bf
  JOIN bordereaux_assurance b ON b.id = bf.bordereau_id
  WHERE b.statut <> 'annulé'
  ORDER BY bf.facture_id, b.date_emission DESC
),
base AS (
  SELECT
    f.id AS facture_id, f.numero_facture, f.date_facture, f.patient_id,
    pa.nom AS patient_nom, pa.prenom AS patient_prenom, pa.code_patient, pa.numero_assurance,
    COALESCE(f.assureur_id, pa.assureur_id) AS assureur_id,
    a.nom AS assureur_nom, a.code AS assureur_code,
    f.montant_total, COALESCE(f.montant_assurance, 0) AS montant_assurance, f.montant_patient,
    f.statut AS statut_facture,
    COALESCE(al.paye, 0) AS paye, al.dernier_paiement,
    COALESCE(l.abandonne, 0) AS abandonne, COALESCE(l.transfere, 0) AS transfere,
    COALESCE(l.litiges_ouverts, 0)::INTEGER AS litiges_ouverts, COALESCE(l.montant_conteste, 0) AS montant_conteste,
    COALESCE(l.litiges_total, 0) AS litiges_total,
    b.bordereau_id, b.bordereau_numero, b.bordereau_statut, b.date_envoi, b.date_echeance
  FROM factures f
  JOIN patients pa ON pa.id = f.patient_id
  LEFT JOIN assureurs a ON a.id = COALESCE(f.assureur_id, pa.assureur_id)
  LEFT JOIN alloc al ON al.facture_id = f.id
  LEFT JOIN lit l ON l.facture_id = f.id
  LEFT JOIN brd b ON b.facture_id = f.id
  WHERE COALESCE(f.montant_assurance, 0) > 0 OR COALESCE(l.litiges_total, 0) > 0 OR al.paye IS NOT NULL
)
SELECT
  facture_id, numero_facture, date_facture, patient_id, patient_nom, patient_prenom, code_patient, numero_assurance,
  assureur_id, assureur_nom, assureur_code, montant_total, montant_assurance, montant_patient, statut_facture,
  paye, dernier_paiement, abandonne, transfere, litiges_ouverts, montant_conteste,
  CASE WHEN statut_facture = 'annulée' THEN 0 ELSE GREATEST(montant_assurance - paye - abandonne, 0) END AS reste,
  bordereau_id, bordereau_numero, bordereau_statut, date_envoi, date_echeance,
  COALESCE(bordereau_statut = 'envoyé' AND date_echeance < CURRENT_DATE
    AND statut_facture <> 'annulée' AND montant_assurance - paye - abandonne > 0, FALSE) AS en_retard,
  CASE
    WHEN statut_facture = 'annulée' THEN 'annulée'
    WHEN montant_assurance <= 0 THEN 'transférée'
    WHEN montant_assurance - paye - abandonne <= 0 THEN CASE WHEN abandonne > 0 THEN 'soldée' ELSE 'payée' END
    WHEN litiges_ouverts > 0 THEN 'litige'
    WHEN paye > 0 THEN 'partielle'
    WHEN bordereau_statut = 'envoyé' THEN 'réclamée'
    WHEN bordereau_statut = 'brouillon' THEN 'en_bordereau'
    ELSE 'à_réclamer'
  END AS statut_assurance
FROM base;

-- Situation de chaque bordereau
CREATE VIEW public.v_bordereaux_assurance WITH (security_invoker = true) AS
SELECT
  b.id, b.numero, b.assureur_id, b.periode_debut, b.periode_fin, b.date_emission, b.date_envoi, b.date_echeance,
  b.statut, b.notes, b.motif_annulation, b.cree_par, b.created_at, b.updated_at,
  a.nom AS assureur_nom, a.code AS assureur_code,
  COALESCE(t.nb_factures, 0)::INTEGER AS nb_factures,
  COALESCE(t.montant, 0) AS montant,
  COALESCE(t.paye, 0) AS paye,
  COALESCE(t.abandonne, 0) AS abandonne,
  COALESCE(t.reste, 0) AS reste,
  COALESCE(t.litiges, 0)::INTEGER AS litiges_ouverts,
  CASE
    WHEN b.statut IN ('brouillon', 'annulé') THEN b.statut
    WHEN COALESCE(t.nb_factures, 0) > 0 AND COALESCE(t.reste, 0) <= 0 THEN 'payé'
    WHEN COALESCE(t.paye, 0) > 0 THEN 'partiel'
    ELSE 'envoyé'
  END AS statut_calcule,
  COALESCE(b.statut = 'envoyé' AND b.date_echeance < CURRENT_DATE AND COALESCE(t.reste, 0) > 0, FALSE) AS en_retard
FROM bordereaux_assurance b
JOIN assureurs a ON a.id = b.assureur_id
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS nb_factures, SUM(bf.montant) AS montant, SUM(c.paye) AS paye,
         SUM(c.abandonne) AS abandonne, SUM(c.reste) AS reste, SUM(c.litiges_ouverts) AS litiges
  FROM bordereau_factures bf
  LEFT JOIN public.v_creances_assurance c ON c.facture_id = bf.facture_id
  WHERE bf.bordereau_id = b.id
) t ON TRUE;

-- -------------------------------------------------------------------------
-- 5. CONTRÔLE DE LA PART ASSURANCE DES FACTURES
-- -------------------------------------------------------------------------
-- La part assurance est « engagée » dès qu'elle figure sur un bordereau,
-- qu'un règlement de l'assureur ou un litige la concerne.
CREATE OR REPLACE FUNCTION public.facture_assurance_engagee(p_facture_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM bordereau_factures bf JOIN bordereaux_assurance b ON b.id = bf.bordereau_id
    WHERE bf.facture_id = p_facture_id AND b.statut <> 'annulé'
  ) OR EXISTS (
    SELECT 1 FROM paiements_assurance_factures pf JOIN paiements_assurance pa ON pa.id = pf.paiement_id
    WHERE pf.facture_id = p_facture_id AND pa.statut = 'validé'
  ) OR EXISTS (
    SELECT 1 FROM litiges_assurance WHERE facture_id = p_facture_id AND statut <> 'annulé'
  );
$$;

CREATE OR REPLACE FUNCTION public.factures_controle_assurance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ass assureurs%ROWTYPE;
  v_par_litige BOOLEAN := current_setting('nyagbadali.decision_litige', true) = 'on';
BEGIN
  IF COALESCE(NEW.montant_assurance, 0) < 0 THEN
    RAISE EXCEPTION 'Part assurance invalide.';
  END IF;

  IF TG_OP = 'UPDATE' AND NOT v_par_litige
     AND (NEW.montant_assurance IS DISTINCT FROM OLD.montant_assurance
          OR NEW.montant_total IS DISTINCT FROM OLD.montant_total
          OR (NEW.assureur_id IS DISTINCT FROM OLD.assureur_id AND OLD.assureur_id IS NOT NULL)
          OR (NEW.statut = 'annulée' AND OLD.statut <> 'annulée'))
     AND public.facture_assurance_engagee(NEW.id) THEN
    IF NEW.statut = 'annulée' AND OLD.statut <> 'annulée' THEN
      RAISE EXCEPTION 'La facture % figure sur un bordereau, un règlement ou un litige d''assurance : annulez-les d''abord.', NEW.numero_facture;
    END IF;
    RAISE EXCEPTION 'La part assurance de la facture % est déjà réclamée ou réglée : elle ne se modifie plus que par un litige (Assurances › Litiges).', NEW.numero_facture;
  END IF;

  -- Contrôles à la création et quand la part assurance change
  IF COALESCE(NEW.montant_assurance, 0) = 0
     OR (TG_OP = 'UPDATE' AND NEW.montant_assurance IS NOT DISTINCT FROM OLD.montant_assurance
         AND NEW.assureur_id IS NOT DISTINCT FROM OLD.assureur_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.assureur_id IS NULL THEN
    SELECT assureur_id INTO NEW.assureur_id FROM patients WHERE id = NEW.patient_id;
  END IF;
  IF NEW.assureur_id IS NULL THEN
    RAISE EXCEPTION 'Le patient n''a pas d''assureur enregistré : la prise en charge par une assurance est impossible.';
  END IF;

  -- Rattachement d'une ancienne facture (assureur ajouté après coup) : pas de nouveau contrôle
  IF TG_OP = 'UPDATE' AND NEW.montant_assurance IS NOT DISTINCT FROM OLD.montant_assurance THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_ass FROM assureurs WHERE id = NEW.assureur_id;
  IF NOT v_par_litige THEN
    IF NOT v_ass.actif THEN
      RAISE EXCEPTION 'L''assureur « % » est désactivé : aucune nouvelle prise en charge n''est possible.', v_ass.nom;
    END IF;
    IF v_ass.plafond_facture IS NOT NULL AND NEW.montant_assurance > v_ass.plafond_facture THEN
      RAISE EXCEPTION 'La part assurance (% FC) dépasse le plafond par facture de % (% FC).', NEW.montant_assurance, v_ass.nom, v_ass.plafond_facture;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_factures_controle_assurance ON factures;
CREATE TRIGGER trg_factures_controle_assurance BEFORE INSERT OR UPDATE ON factures
  FOR EACH ROW EXECUTE FUNCTION public.factures_controle_assurance();

-- Factures existantes : rattachement à l'assureur du patient
UPDATE factures f SET assureur_id = p.assureur_id
FROM patients p
WHERE f.patient_id = p.id AND f.assureur_id IS NULL
  AND COALESCE(f.montant_assurance, 0) > 0 AND p.assureur_id IS NOT NULL;

-- -------------------------------------------------------------------------
-- 6. FONCTIONS DE GESTION (seules voies d'écriture des bordereaux,
--    règlements et litiges)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assurance_auteur()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM personnel WHERE lower(email) = lower(auth.jwt() ->> 'email') LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.assurance_controle_caisse()
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(ARRAY['super_admin', 'admin', 'caissier']) THEN
    RAISE EXCEPTION 'Action réservée à la caisse et à l''administration.';
  END IF;
END;
$$;

-- 6.1 Bordereau : création (brouillon, ou envoyé directement)
CREATE OR REPLACE FUNCTION public.creer_bordereau_assurance(
  p_assureur_id UUID,
  p_factures UUID[],
  p_periode_debut DATE DEFAULT NULL,
  p_periode_fin DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_envoyer BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ass assureurs%ROWTYPE;
  v_id UUID;
  v_fac RECORD;
  v_nb INTEGER := 0;
BEGIN
  PERFORM public.assurance_controle_caisse();
  SELECT * INTO v_ass FROM assureurs WHERE id = p_assureur_id;
  IF v_ass.id IS NULL THEN RAISE EXCEPTION 'Assureur introuvable.'; END IF;
  IF p_factures IS NULL OR array_length(p_factures, 1) IS NULL THEN
    RAISE EXCEPTION 'Choisissez au moins une facture à réclamer.';
  END IF;

  -- Verrouillage des factures : deux bordereaux simultanés ne peuvent pas reprendre la même facture
  PERFORM 1 FROM factures WHERE id = ANY(p_factures) FOR UPDATE;

  INSERT INTO bordereaux_assurance (numero, assureur_id, periode_debut, periode_fin, notes, cree_par, statut, date_envoi, date_echeance)
  VALUES (
    'BRD-' || to_char(NOW(), 'YYYYMM') || '-' || lpad(nextval('seq_bordereaux_assurance')::TEXT, 4, '0'),
    p_assureur_id, p_periode_debut, p_periode_fin, NULLIF(trim(p_notes), ''), public.assurance_auteur(),
    CASE WHEN p_envoyer THEN 'envoyé' ELSE 'brouillon' END,
    CASE WHEN p_envoyer THEN NOW() END,
    CASE WHEN p_envoyer THEN CURRENT_DATE + v_ass.delai_paiement_jours END
  )
  RETURNING id INTO v_id;

  FOR v_fac IN SELECT * FROM v_creances_assurance WHERE facture_id = ANY(p_factures) LOOP
    IF v_fac.assureur_id IS DISTINCT FROM p_assureur_id THEN
      RAISE EXCEPTION 'La facture % n''est pas prise en charge par %.', v_fac.numero_facture, v_ass.nom;
    END IF;
    IF v_fac.statut_facture = 'annulée' THEN
      RAISE EXCEPTION 'La facture % est annulée.', v_fac.numero_facture;
    END IF;
    IF v_fac.bordereau_id IS NOT NULL THEN
      RAISE EXCEPTION 'La facture % figure déjà sur le bordereau %.', v_fac.numero_facture, v_fac.bordereau_numero;
    END IF;
    IF v_fac.reste <= 0 THEN
      RAISE EXCEPTION 'La part assurance de la facture % est déjà soldée.', v_fac.numero_facture;
    END IF;
    -- Ancienne facture sans assureur : rattachement à l'assureur du patient
    UPDATE factures SET assureur_id = p_assureur_id WHERE id = v_fac.facture_id AND assureur_id IS NULL;
    INSERT INTO bordereau_factures (bordereau_id, facture_id, montant) VALUES (v_id, v_fac.facture_id, v_fac.reste);
    v_nb := v_nb + 1;
  END LOOP;

  IF v_nb <> array_length(p_factures, 1) THEN
    RAISE EXCEPTION 'Certaines factures choisies n''ont pas de part assurance à réclamer.';
  END IF;
  RETURN v_id;
END;
$$;

-- 6.2 Bordereau : envoi à l'assureur (fixe l'échéance de paiement)
CREATE OR REPLACE FUNCTION public.envoyer_bordereau_assurance(p_bordereau_id UUID, p_date_envoi DATE DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_b bordereaux_assurance%ROWTYPE;
  v_delai INTEGER;
  v_date DATE := COALESCE(p_date_envoi, CURRENT_DATE);
BEGIN
  PERFORM public.assurance_controle_caisse();
  SELECT * INTO v_b FROM bordereaux_assurance WHERE id = p_bordereau_id FOR UPDATE;
  IF v_b.id IS NULL THEN RAISE EXCEPTION 'Bordereau introuvable.'; END IF;
  IF v_b.statut <> 'brouillon' THEN RAISE EXCEPTION 'Seul un bordereau en préparation peut être envoyé.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM bordereau_factures WHERE bordereau_id = p_bordereau_id) THEN
    RAISE EXCEPTION 'Le bordereau ne contient aucune facture.';
  END IF;
  SELECT delai_paiement_jours INTO v_delai FROM assureurs WHERE id = v_b.assureur_id;
  UPDATE bordereaux_assurance
  SET statut = 'envoyé', date_envoi = v_date::TIMESTAMPTZ, date_echeance = v_date + v_delai
  WHERE id = p_bordereau_id;
END;
$$;

-- 6.3 Bordereau en préparation : retrait d'une facture
CREATE OR REPLACE FUNCTION public.retirer_facture_bordereau(p_bordereau_id UUID, p_facture_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assurance_controle_caisse();
  IF NOT EXISTS (SELECT 1 FROM bordereaux_assurance WHERE id = p_bordereau_id AND statut = 'brouillon') THEN
    RAISE EXCEPTION 'Seul un bordereau en préparation peut être modifié.';
  END IF;
  DELETE FROM bordereau_factures WHERE bordereau_id = p_bordereau_id AND facture_id = p_facture_id;
END;
$$;

-- 6.4 Bordereau : annulation (libère ses factures). Un bordereau envoyé ne
-- s'annule que par l'administration, et jamais après un règlement.
CREATE OR REPLACE FUNCTION public.annuler_bordereau_assurance(p_bordereau_id UUID, p_motif TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_b bordereaux_assurance%ROWTYPE;
BEGIN
  PERFORM public.assurance_controle_caisse();
  IF NULLIF(trim(p_motif), '') IS NULL THEN RAISE EXCEPTION 'Indiquez le motif de l''annulation.'; END IF;
  SELECT * INTO v_b FROM bordereaux_assurance WHERE id = p_bordereau_id FOR UPDATE;
  IF v_b.id IS NULL THEN RAISE EXCEPTION 'Bordereau introuvable.'; END IF;
  IF v_b.statut = 'annulé' THEN RAISE EXCEPTION 'Ce bordereau est déjà annulé.'; END IF;
  IF v_b.statut = 'envoyé' AND NOT public.has_role(ARRAY['super_admin', 'admin']) THEN
    RAISE EXCEPTION 'Un bordereau envoyé à l''assureur ne peut être annulé que par l''administration.';
  END IF;
  IF EXISTS (SELECT 1 FROM paiements_assurance WHERE bordereau_id = p_bordereau_id AND statut = 'validé') THEN
    RAISE EXCEPTION 'Un règlement a été reçu sur ce bordereau : annulez d''abord le règlement.';
  END IF;
  UPDATE bordereaux_assurance SET statut = 'annulé', motif_annulation = trim(p_motif) WHERE id = p_bordereau_id;
END;
$$;

-- 6.5 Règlement d'un assureur, ventilé sur ses factures.
-- Sans ventilation fournie : affectation automatique aux factures les plus
-- anciennes (celles du bordereau indiqué le cas échéant), factures en litige en dernier.
CREATE OR REPLACE FUNCTION public.encaisser_paiement_assurance(
  p_assureur_id UUID,
  p_montant NUMERIC,
  p_mode TEXT DEFAULT 'virement',
  p_reference TEXT DEFAULT NULL,
  p_date TIMESTAMPTZ DEFAULT NULL,
  p_bordereau_id UUID DEFAULT NULL,
  p_ventilation JSONB DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ass assureurs%ROWTYPE;
  v_id UUID;
  v_numero TEXT;
  v_restant NUMERIC := p_montant;
  v_part NUMERIC;
  v_total_du NUMERIC;
  v_nb INTEGER := 0;
  v_fac RECORD;
  v_item JSONB;
BEGIN
  PERFORM public.assurance_controle_caisse();
  IF p_montant IS NULL OR p_montant <= 0 THEN RAISE EXCEPTION 'Montant invalide.'; END IF;
  SELECT * INTO v_ass FROM assureurs WHERE id = p_assureur_id;
  IF v_ass.id IS NULL THEN RAISE EXCEPTION 'Assureur introuvable.'; END IF;
  IF p_date IS NOT NULL AND p_date > NOW() + INTERVAL '1 day' THEN
    RAISE EXCEPTION 'La date du règlement ne peut pas être dans le futur.';
  END IF;
  IF p_bordereau_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM bordereaux_assurance WHERE id = p_bordereau_id AND assureur_id = p_assureur_id AND statut <> 'annulé'
  ) THEN
    RAISE EXCEPTION 'Bordereau introuvable ou annulé pour cet assureur.';
  END IF;

  -- Verrouillage des factures de l'assureur (deux règlements simultanés ne peuvent pas dépasser le dû)
  PERFORM 1 FROM factures f
  WHERE f.id IN (SELECT facture_id FROM v_creances_assurance WHERE assureur_id = p_assureur_id AND reste > 0)
  FOR UPDATE;

  v_numero := 'RGA-' || to_char(NOW(), 'YYYYMM') || '-' || lpad(nextval('seq_paiements_assurance')::TEXT, 4, '0');
  INSERT INTO paiements_assurance (numero, assureur_id, bordereau_id, date_paiement, montant, mode_paiement, reference, notes, recu_par)
  VALUES (v_numero, p_assureur_id, p_bordereau_id, COALESCE(p_date, NOW()), p_montant, COALESCE(p_mode, 'virement'),
          NULLIF(trim(p_reference), ''), NULLIF(trim(p_notes), ''), public.assurance_auteur())
  RETURNING id INTO v_id;

  IF p_ventilation IS NOT NULL AND jsonb_array_length(p_ventilation) > 0 THEN
    -- Ventilation saisie par la caisse
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_ventilation) LOOP
      v_part := (v_item ->> 'montant')::NUMERIC;
      CONTINUE WHEN v_part IS NULL OR v_part <= 0;
      SELECT * INTO v_fac FROM v_creances_assurance WHERE facture_id = (v_item ->> 'facture_id')::UUID;
      IF v_fac.facture_id IS NULL OR v_fac.assureur_id IS DISTINCT FROM p_assureur_id THEN
        RAISE EXCEPTION 'Une facture de la ventilation n''appartient pas à %.', v_ass.nom;
      END IF;
      IF v_part > v_fac.reste THEN
        RAISE EXCEPTION 'Facture % : % FC affectés pour un reste dû de % FC.', v_fac.numero_facture, v_part, v_fac.reste;
      END IF;
      INSERT INTO paiements_assurance_factures (paiement_id, facture_id, montant) VALUES (v_id, v_fac.facture_id, v_part);
      v_restant := v_restant - v_part;
      v_nb := v_nb + 1;
    END LOOP;
    IF v_restant <> 0 THEN
      RAISE EXCEPTION 'La ventilation (% FC) ne correspond pas au montant du règlement (% FC).', p_montant - v_restant, p_montant;
    END IF;
  ELSE
    SELECT COALESCE(SUM(reste), 0) INTO v_total_du FROM v_creances_assurance c
    WHERE c.assureur_id = p_assureur_id AND c.reste > 0
      AND (p_bordereau_id IS NULL OR c.facture_id IN (SELECT facture_id FROM bordereau_factures WHERE bordereau_id = p_bordereau_id));
    IF p_montant > v_total_du THEN
      RAISE EXCEPTION 'Le règlement (% FC) dépasse le reste dû % (% FC).', p_montant,
        CASE WHEN p_bordereau_id IS NULL THEN 'par ' || v_ass.nom ELSE 'sur ce bordereau' END, v_total_du;
    END IF;
    FOR v_fac IN
      SELECT * FROM v_creances_assurance c
      WHERE c.assureur_id = p_assureur_id AND c.reste > 0
        AND (p_bordereau_id IS NULL OR c.facture_id IN (SELECT facture_id FROM bordereau_factures WHERE bordereau_id = p_bordereau_id))
      ORDER BY (c.litiges_ouverts > 0), c.date_facture, c.numero_facture
    LOOP
      EXIT WHEN v_restant <= 0;
      v_part := LEAST(v_fac.reste, v_restant);
      INSERT INTO paiements_assurance_factures (paiement_id, facture_id, montant) VALUES (v_id, v_fac.facture_id, v_part);
      v_restant := v_restant - v_part;
      v_nb := v_nb + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('paiement_id', v_id, 'numero', v_numero, 'factures', v_nb);
END;
$$;

-- 6.6 Annulation d'un règlement (administration uniquement)
CREATE OR REPLACE FUNCTION public.annuler_paiement_assurance(p_paiement_id UUID, p_motif TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(ARRAY['super_admin', 'admin']) THEN
    RAISE EXCEPTION 'L''annulation d''un règlement d''assureur est réservée à l''administration.';
  END IF;
  IF NULLIF(trim(p_motif), '') IS NULL THEN RAISE EXCEPTION 'Indiquez le motif de l''annulation.'; END IF;
  UPDATE paiements_assurance SET statut = 'annulé', motif_annulation = trim(p_motif)
  WHERE id = p_paiement_id AND statut = 'validé';
  IF NOT FOUND THEN RAISE EXCEPTION 'Règlement introuvable ou déjà annulé.'; END IF;
END;
$$;

-- 6.7 Litige : ouverture sur une facture
CREATE OR REPLACE FUNCTION public.ouvrir_litige_assurance(
  p_facture_id UUID,
  p_motif TEXT,
  p_montant NUMERIC,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fac RECORD;
  v_id UUID;
BEGIN
  PERFORM public.assurance_controle_caisse();
  PERFORM 1 FROM factures WHERE id = p_facture_id FOR UPDATE;
  SELECT * INTO v_fac FROM v_creances_assurance WHERE facture_id = p_facture_id;
  IF v_fac.facture_id IS NULL OR v_fac.assureur_id IS NULL THEN
    RAISE EXCEPTION 'Cette facture n''a pas de part prise en charge par un assureur.';
  END IF;
  IF v_fac.statut_facture = 'annulée' THEN RAISE EXCEPTION 'La facture est annulée.'; END IF;
  IF p_montant IS NULL OR p_montant <= 0 THEN RAISE EXCEPTION 'Montant contesté invalide.'; END IF;
  IF p_montant > v_fac.reste - v_fac.montant_conteste THEN
    RAISE EXCEPTION 'Montant contesté trop élevé : % FC au plus (reste dû par l''assureur, hors litiges déjà ouverts).',
      GREATEST(v_fac.reste - v_fac.montant_conteste, 0);
  END IF;

  INSERT INTO litiges_assurance (numero, facture_id, assureur_id, motif, description, montant_conteste, ouvert_par)
  VALUES (
    'LIT-' || to_char(NOW(), 'YYYYMM') || '-' || lpad(nextval('seq_litiges_assurance')::TEXT, 4, '0'),
    p_facture_id, v_fac.assureur_id, COALESCE(p_motif, 'autre'), NULLIF(trim(p_description), ''), p_montant, public.assurance_auteur()
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 6.8 Litige : suivi (en cours de traitement, annulation, commentaire)
CREATE OR REPLACE FUNCTION public.maj_litige_assurance(p_litige_id UUID, p_statut TEXT, p_description TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_l litiges_assurance%ROWTYPE;
BEGIN
  PERFORM public.assurance_controle_caisse();
  IF p_statut NOT IN ('ouvert', 'en_cours', 'annulé') THEN
    RAISE EXCEPTION 'Statut invalide : utilisez la résolution pour clôturer un litige.';
  END IF;
  SELECT * INTO v_l FROM litiges_assurance WHERE id = p_litige_id FOR UPDATE;
  IF v_l.id IS NULL THEN RAISE EXCEPTION 'Litige introuvable.'; END IF;
  IF v_l.statut IN ('résolu', 'annulé') THEN RAISE EXCEPTION 'Ce litige est clôturé.'; END IF;
  UPDATE litiges_assurance
  SET statut = p_statut, description = COALESCE(NULLIF(trim(p_description), ''), description)
  WHERE id = p_litige_id;
END;
$$;

-- 6.9 Litige : décision. Le montant contesté se répartit entre la part
-- finalement payée par l'assureur, la part reportée au patient (ajoutée à son
-- reste à payer) et la part abandonnée (perte pour l'hôpital).
CREATE OR REPLACE FUNCTION public.resoudre_litige_assurance(
  p_litige_id UUID,
  p_accepte NUMERIC,
  p_transfere NUMERIC,
  p_abandonne NUMERIC,
  p_resolution TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_l litiges_assurance%ROWTYPE;
  v_fac RECORD;
  v_paye_patient NUMERIC;
  v_net NUMERIC;
  a NUMERIC := COALESCE(p_accepte, 0);
  t NUMERIC := COALESCE(p_transfere, 0);
  ab NUMERIC := COALESCE(p_abandonne, 0);
BEGIN
  PERFORM public.assurance_controle_caisse();
  SELECT * INTO v_l FROM litiges_assurance WHERE id = p_litige_id FOR UPDATE;
  IF v_l.id IS NULL THEN RAISE EXCEPTION 'Litige introuvable.'; END IF;
  IF v_l.statut NOT IN ('ouvert', 'en_cours') THEN RAISE EXCEPTION 'Ce litige est déjà clôturé.'; END IF;
  IF a < 0 OR t < 0 OR ab < 0 THEN RAISE EXCEPTION 'Montants invalides.'; END IF;
  IF a + t + ab <> v_l.montant_conteste THEN
    RAISE EXCEPTION 'La décision doit répartir exactement le montant contesté (% FC) : % FC répartis.', v_l.montant_conteste, a + t + ab;
  END IF;

  PERFORM 1 FROM factures WHERE id = v_l.facture_id FOR UPDATE;
  SELECT * INTO v_fac FROM v_creances_assurance WHERE facture_id = v_l.facture_id;
  IF t + ab > v_fac.reste THEN
    RAISE EXCEPTION 'L''assureur a déjà réglé une partie de cette facture : % FC au plus peuvent être reportés ou abandonnés.', v_fac.reste;
  END IF;

  IF t > 0 THEN
    -- Report au patient : la part assurance diminue, le net patient augmente
    PERFORM set_config('nyagbadali.decision_litige', 'on', true);
    SELECT COALESCE(SUM(montant), 0) INTO v_paye_patient FROM paiements WHERE facture_id = v_l.facture_id;
    v_net := v_fac.montant_patient + t;
    UPDATE factures
    SET montant_assurance = montant_assurance - t,
        montant_patient = v_net,
        statut = CASE
          WHEN statut = 'annulée' THEN statut
          WHEN v_paye_patient >= v_net THEN 'payée'
          WHEN v_paye_patient > 0 THEN 'partielle'
          ELSE 'en_attente'
        END
    WHERE id = v_l.facture_id;
    PERFORM set_config('nyagbadali.decision_litige', 'off', true);
  END IF;

  UPDATE litiges_assurance
  SET statut = 'résolu', montant_accepte = a, montant_transfere = t, montant_abandonne = ab,
      date_resolution = NOW(), resolution = NULLIF(trim(p_resolution), ''), resolu_par = public.assurance_auteur()
  WHERE id = p_litige_id;
END;
$$;

-- -------------------------------------------------------------------------
-- 7. SÉCURITÉ PAR RÔLE
-- -------------------------------------------------------------------------
ALTER TABLE assureurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bordereaux_assurance ENABLE ROW LEVEL SECURITY;
ALTER TABLE bordereau_factures ENABLE ROW LEVEL SECURITY;
ALTER TABLE paiements_assurance ENABLE ROW LEVEL SECURITY;
ALTER TABLE paiements_assurance_factures ENABLE ROW LEVEL SECURITY;
ALTER TABLE litiges_assurance ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON assureurs, bordereaux_assurance, bordereau_factures, paiements_assurance,
  paiements_assurance_factures, litiges_assurance FROM anon;
REVOKE ALL ON public.v_creances_assurance, public.v_bordereaux_assurance FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON assureurs TO authenticated;
-- Bordereaux, règlements et litiges : lecture directe, écriture par les fonctions uniquement
GRANT SELECT ON bordereaux_assurance, bordereau_factures, paiements_assurance,
  paiements_assurance_factures, litiges_assurance TO authenticated;
GRANT SELECT ON public.v_creances_assurance, public.v_bordereaux_assurance TO authenticated;

DROP POLICY IF EXISTS "assureurs_select" ON assureurs;
DROP POLICY IF EXISTS "assureurs_insert" ON assureurs;
DROP POLICY IF EXISTS "assureurs_update" ON assureurs;
DROP POLICY IF EXISTS "assureurs_delete" ON assureurs;
-- Tout le personnel lit les assureurs (choix de l'assureur à l'enregistrement du patient)
CREATE POLICY "assureurs_select" ON assureurs FOR SELECT TO authenticated
  USING ((SELECT public.is_staff()));
CREATE POLICY "assureurs_insert" ON assureurs FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin', 'admin'])));
CREATE POLICY "assureurs_update" ON assureurs FOR UPDATE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin', 'admin'])))
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin', 'admin'])));
CREATE POLICY "assureurs_delete" ON assureurs FOR DELETE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin', 'admin'])));

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['bordereaux_assurance', 'bordereau_factures', 'paiements_assurance', 'paiements_assurance_factures', 'litiges_assurance'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING ((SELECT public.has_role(ARRAY[''super_admin'', ''admin'', ''caissier''])))',
      t || '_select', t
    );
  END LOOP;
END $$;

DO $$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.facture_assurance_engagee(UUID)',
    'public.assurance_auteur()',
    'public.assurance_controle_caisse()',
    'public.creer_bordereau_assurance(UUID, UUID[], DATE, DATE, TEXT, BOOLEAN)',
    'public.envoyer_bordereau_assurance(UUID, DATE)',
    'public.retirer_facture_bordereau(UUID, UUID)',
    'public.annuler_bordereau_assurance(UUID, TEXT)',
    'public.encaisser_paiement_assurance(UUID, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, UUID, JSONB, TEXT)',
    'public.annuler_paiement_assurance(UUID, TEXT)',
    'public.ouvrir_litige_assurance(UUID, TEXT, NUMERIC, TEXT)',
    'public.maj_litige_assurance(UUID, TEXT, TEXT)',
    'public.resoudre_litige_assurance(UUID, NUMERIC, NUMERIC, NUMERIC, TEXT)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

-- -------------------------------------------------------------------------
-- 8. JOURNAL D'AUDIT ET TEMPS RÉEL
-- -------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['assureurs', 'bordereaux_assurance', 'bordereau_factures', 'paiements_assurance', 'paiements_assurance_factures', 'litiges_assurance'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_audit_' || t, t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION nyagbadali_audit()', 'trg_audit_' || t, t);
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  FOREACH t IN ARRAY ARRAY['assureurs', 'bordereaux_assurance', 'paiements_assurance', 'litiges_assurance'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
