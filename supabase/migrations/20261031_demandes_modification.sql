-- =========================================================================
-- NYAGBADALI — DEMANDES DE MODIFICATION (31/10/2026)
-- -------------------------------------------------------------------------
-- À exécuter dans l'éditeur SQL de Supabase, APRÈS 20261010_securite_roles.sql.
--
-- Fiche de demande de correction d'une erreur de saisie, en trois signatures :
--   1. l'agent qui a commis l'erreur décrit l'erreur, la correction voulue,
--      explique pourquoi l'erreur est survenue, puis signe ;
--   2. le médecin chef donne son avis (favorable / défavorable) et signe ;
--   3. la direction (administrateur ou super administrateur) approuve ou
--      rejette et signe.
-- Une demande approuvée est ensuite marquée « exécutée » par l'administration
-- une fois la correction faite dans le système.
--
-- Règles :
--   * tout membre actif du personnel peut créer une demande ;
--   * un avis défavorable du médecin chef ou un rejet de la direction clôt la demande ;
--   * personne ne valide sa propre demande ; une demande du médecin chef
--     passe directement à la direction ;
--   * la table n'est modifiable QUE par les fonctions ci-dessous (aucun INSERT,
--     UPDATE ou DELETE direct) : les signatures ne peuvent pas être falsifiées.
-- Lecture : le demandeur voit ses demandes ; médecin chef et administration voient tout.
-- Idempotent : peut être relancé sans risque, ne supprime aucune donnée.
-- =========================================================================

CREATE SEQUENCE IF NOT EXISTS demandes_modification_seq;

CREATE TABLE IF NOT EXISTS demandes_modification (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero VARCHAR(30) UNIQUE NOT NULL,
    module VARCHAR(30) NOT NULL DEFAULT 'autre',
    reference_enregistrement VARCHAR(150),
    date_erreur DATE,
    description_erreur TEXT NOT NULL,
    correction_demandee TEXT NOT NULL,
    explication TEXT NOT NULL,
    mesures_preventives TEXT,
    statut VARCHAR(30) NOT NULL DEFAULT 'en_attente_medecin_chef',

    -- 1. Demandeur (auteur de l'erreur)
    demandeur_id UUID REFERENCES personnel(id) ON DELETE SET NULL,
    signature_demandeur TEXT NOT NULL,
    date_signature_demandeur TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 2. Médecin chef
    medecin_chef_id UUID REFERENCES personnel(id) ON DELETE SET NULL,
    avis_medecin_chef VARCHAR(20),
    commentaire_medecin_chef TEXT,
    signature_medecin_chef TEXT,
    date_signature_medecin_chef TIMESTAMPTZ,

    -- 3. Direction de l'hôpital
    direction_id UUID REFERENCES personnel(id) ON DELETE SET NULL,
    decision_direction VARCHAR(20),
    commentaire_direction TEXT,
    signature_direction TEXT,
    date_signature_direction TIMESTAMPTZ,

    -- Exécution de la correction
    execute_par UUID REFERENCES personnel(id) ON DELETE SET NULL,
    date_execution TIMESTAMPTZ,
    note_execution TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Contraintes (recréées pour rester alignées sur src/lib/demandes-modification.ts)
ALTER TABLE demandes_modification DROP CONSTRAINT IF EXISTS demandes_modification_module_check;
ALTER TABLE demandes_modification ADD CONSTRAINT demandes_modification_module_check CHECK (module IN (
  'patients', 'rendez_vous', 'consultations', 'prescriptions', 'hospitalisation', 'laboratoire',
  'pharmacie', 'facturation', 'depenses', 'assurances', 'personnel', 'autre'
));

ALTER TABLE demandes_modification DROP CONSTRAINT IF EXISTS demandes_modification_statut_check;
ALTER TABLE demandes_modification ADD CONSTRAINT demandes_modification_statut_check CHECK (statut IN (
  'en_attente_medecin_chef', 'en_attente_direction', 'approuvée', 'rejetée', 'exécutée'
));

ALTER TABLE demandes_modification DROP CONSTRAINT IF EXISTS demandes_modification_avis_check;
ALTER TABLE demandes_modification ADD CONSTRAINT demandes_modification_avis_check
  CHECK (avis_medecin_chef IS NULL OR avis_medecin_chef IN ('favorable', 'défavorable'));

ALTER TABLE demandes_modification DROP CONSTRAINT IF EXISTS demandes_modification_decision_check;
ALTER TABLE demandes_modification ADD CONSTRAINT demandes_modification_decision_check
  CHECK (decision_direction IS NULL OR decision_direction IN ('approuvée', 'rejetée'));

CREATE INDEX IF NOT EXISTS idx_demandes_modification_statut ON demandes_modification(statut);
CREATE INDEX IF NOT EXISTS idx_demandes_modification_demandeur ON demandes_modification(demandeur_id);

-- Date de mise à jour automatique
CREATE OR REPLACE FUNCTION public.demandes_modification_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_demandes_modification_updated_at ON demandes_modification;
CREATE TRIGGER trg_demandes_modification_updated_at BEFORE UPDATE ON demandes_modification
  FOR EACH ROW EXECUTE FUNCTION public.demandes_modification_touch_updated_at();

-- Journal d'audit (fonction créée par 20261009_fonctionnalites_completes.sql)
DROP TRIGGER IF EXISTS trg_audit_demandes_modification ON demandes_modification;
CREATE TRIGGER trg_audit_demandes_modification AFTER INSERT OR UPDATE OR DELETE ON demandes_modification
  FOR EACH ROW EXECUTE FUNCTION nyagbadali_audit();

-- -------------------------------------------------------------------------
-- SÉCURITÉ PAR RÔLE : lecture seule, écriture par les fonctions uniquement
-- -------------------------------------------------------------------------
ALTER TABLE demandes_modification ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON demandes_modification FROM anon;
REVOKE INSERT, UPDATE, DELETE ON demandes_modification FROM authenticated;
GRANT SELECT ON demandes_modification TO authenticated;

-- Membre actif du personnel connecté
CREATE OR REPLACE FUNCTION public.demande_modif_moi()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM personnel
  WHERE lower(email) = lower(auth.jwt() ->> 'email') AND statut = 'actif'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.demande_modif_moi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.demande_modif_moi() TO authenticated;

DROP POLICY IF EXISTS "demandes_modification_select" ON demandes_modification;
CREATE POLICY "demandes_modification_select" ON demandes_modification FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role(ARRAY['super_admin','admin','medecin_chef']))
    OR demandeur_id = (SELECT public.demande_modif_moi())
  );

-- -------------------------------------------------------------------------
-- FONCTIONS DU CIRCUIT DE SIGNATURE
-- -------------------------------------------------------------------------

-- Signature manuscrite dessinée à l'écran : image PNG encodée (taille limitée)
CREATE OR REPLACE FUNCTION public.demande_modif_controle_signature(p_signature TEXT)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_signature IS NULL OR p_signature NOT LIKE 'data:image/png;base64,%' THEN
    RAISE EXCEPTION 'La signature est obligatoire.';
  END IF;
  IF length(p_signature) > 300000 THEN
    RAISE EXCEPTION 'La signature est trop volumineuse. Effacez-la et signez à nouveau.';
  END IF;
END;
$$;

-- 1. Création et signature par l'auteur de l'erreur
CREATE OR REPLACE FUNCTION public.creer_demande_modification(
  p_module TEXT,
  p_reference TEXT,
  p_date_erreur DATE,
  p_description TEXT,
  p_correction TEXT,
  p_explication TEXT,
  p_mesures TEXT,
  p_signature TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_moi UUID := public.demande_modif_moi();
  v_id UUID;
BEGIN
  IF v_moi IS NULL THEN
    RAISE EXCEPTION 'Seul un membre actif du personnel peut faire une demande de modification.';
  END IF;
  IF length(trim(COALESCE(p_description, ''))) < 5 THEN
    RAISE EXCEPTION 'Décrivez l''erreur commise.';
  END IF;
  IF length(trim(COALESCE(p_correction, ''))) < 5 THEN
    RAISE EXCEPTION 'Indiquez la correction demandée.';
  END IF;
  IF length(trim(COALESCE(p_explication, ''))) < 20 THEN
    RAISE EXCEPTION 'Expliquez pourquoi l''erreur a été commise (20 caractères au moins).';
  END IF;
  IF p_date_erreur IS NOT NULL AND p_date_erreur > CURRENT_DATE THEN
    RAISE EXCEPTION 'La date de l''erreur ne peut pas être dans le futur.';
  END IF;
  PERFORM public.demande_modif_controle_signature(p_signature);

  INSERT INTO demandes_modification (
    numero, module, reference_enregistrement, date_erreur, description_erreur, correction_demandee,
    explication, mesures_preventives, demandeur_id, signature_demandeur, statut
  ) VALUES (
    'DM-' || to_char(NOW(), 'YYYYMMDD') || '-' || lpad(nextval('demandes_modification_seq')::TEXT, 4, '0'),
    COALESCE(NULLIF(trim(p_module), ''), 'autre'),
    NULLIF(left(trim(COALESCE(p_reference, '')), 150), ''),
    p_date_erreur,
    trim(p_description),
    trim(p_correction),
    trim(p_explication),
    NULLIF(trim(COALESCE(p_mesures, '')), ''),
    v_moi,
    p_signature,
    -- Le médecin chef ne signe pas sa propre demande : elle va directement à la direction
    CASE WHEN public.has_role(ARRAY['medecin_chef']) THEN 'en_attente_direction' ELSE 'en_attente_medecin_chef' END
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 2. Avis et signature du médecin chef
CREATE OR REPLACE FUNCTION public.signer_demande_modification_medecin_chef(
  p_id UUID,
  p_avis TEXT,
  p_commentaire TEXT,
  p_signature TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_moi UUID := public.demande_modif_moi();
  v_demande demandes_modification%ROWTYPE;
BEGIN
  IF NOT public.has_role(ARRAY['medecin_chef']) THEN
    RAISE EXCEPTION 'Seul le médecin chef peut signer à cette étape.';
  END IF;
  SELECT * INTO v_demande FROM demandes_modification WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande introuvable.';
  END IF;
  IF v_demande.statut <> 'en_attente_medecin_chef' THEN
    RAISE EXCEPTION 'Cette demande n''attend plus l''avis du médecin chef.';
  END IF;
  IF v_demande.demandeur_id = v_moi THEN
    RAISE EXCEPTION 'Vous ne pouvez pas valider votre propre demande.';
  END IF;
  IF p_avis NOT IN ('favorable', 'défavorable') THEN
    RAISE EXCEPTION 'Choisissez un avis favorable ou défavorable.';
  END IF;
  IF p_avis = 'défavorable' AND length(trim(COALESCE(p_commentaire, ''))) = 0 THEN
    RAISE EXCEPTION 'Motivez l''avis défavorable.';
  END IF;
  PERFORM public.demande_modif_controle_signature(p_signature);

  UPDATE demandes_modification SET
    medecin_chef_id = v_moi,
    avis_medecin_chef = p_avis,
    commentaire_medecin_chef = NULLIF(trim(COALESCE(p_commentaire, '')), ''),
    signature_medecin_chef = p_signature,
    date_signature_medecin_chef = NOW(),
    statut = CASE WHEN p_avis = 'favorable' THEN 'en_attente_direction' ELSE 'rejetée' END
  WHERE id = p_id;
END;
$$;

-- 3. Décision et signature de la direction de l'hôpital
CREATE OR REPLACE FUNCTION public.signer_demande_modification_direction(
  p_id UUID,
  p_decision TEXT,
  p_commentaire TEXT,
  p_signature TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_moi UUID := public.demande_modif_moi();
  v_demande demandes_modification%ROWTYPE;
BEGIN
  IF NOT public.has_role(ARRAY['super_admin','admin']) THEN
    RAISE EXCEPTION 'Seule la direction de l''hôpital peut signer à cette étape.';
  END IF;
  SELECT * INTO v_demande FROM demandes_modification WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande introuvable.';
  END IF;
  IF v_demande.statut <> 'en_attente_direction' THEN
    RAISE EXCEPTION 'Cette demande n''attend pas la décision de la direction.';
  END IF;
  IF v_demande.demandeur_id = v_moi THEN
    RAISE EXCEPTION 'Vous ne pouvez pas valider votre propre demande.';
  END IF;
  IF p_decision NOT IN ('approuvée', 'rejetée') THEN
    RAISE EXCEPTION 'Choisissez d''approuver ou de rejeter la demande.';
  END IF;
  IF p_decision = 'rejetée' AND length(trim(COALESCE(p_commentaire, ''))) = 0 THEN
    RAISE EXCEPTION 'Motivez le rejet de la demande.';
  END IF;
  PERFORM public.demande_modif_controle_signature(p_signature);

  UPDATE demandes_modification SET
    direction_id = v_moi,
    decision_direction = p_decision,
    commentaire_direction = NULLIF(trim(COALESCE(p_commentaire, '')), ''),
    signature_direction = p_signature,
    date_signature_direction = NOW(),
    statut = p_decision
  WHERE id = p_id;
END;
$$;

-- 4. Correction effectuée dans le système
CREATE OR REPLACE FUNCTION public.executer_demande_modification(p_id UUID, p_note TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_statut TEXT;
BEGIN
  IF NOT public.has_role(ARRAY['super_admin','admin']) THEN
    RAISE EXCEPTION 'Seule l''administration enregistre l''exécution d''une correction.';
  END IF;
  SELECT statut INTO v_statut FROM demandes_modification WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande introuvable.';
  END IF;
  IF v_statut <> 'approuvée' THEN
    RAISE EXCEPTION 'Seule une demande approuvée peut être marquée comme exécutée.';
  END IF;

  UPDATE demandes_modification SET
    statut = 'exécutée',
    execute_par = public.demande_modif_moi(),
    date_execution = NOW(),
    note_execution = NULLIF(trim(COALESCE(p_note, '')), '')
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.creer_demande_modification(TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.signer_demande_modification_medecin_chef(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.signer_demande_modification_direction(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.executer_demande_modification(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.creer_demande_modification(TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.signer_demande_modification_medecin_chef(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.signer_demande_modification_direction(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.executer_demande_modification(UUID, TEXT) TO authenticated;

-- -------------------------------------------------------------------------
-- TEMPS RÉEL (mise à jour des autres postes ouverts)
-- -------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'demandes_modification'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.demandes_modification;
  END IF;
END $$;
