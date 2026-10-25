-- =========================================================================
-- NYAGBADALI — REMISE À ZÉRO AVANT LA MISE EN PRODUCTION (25/10/2026)
-- -------------------------------------------------------------------------
-- À exécuter UNE SEULE FOIS dans l'éditeur SQL de Supabase.
-- ⚠ IRRÉVERSIBLE : faites une sauvegarde (Database › Backups) avant.
--
-- CONSERVÉ :
--   • départements
--   • catalogue des actes et tarifs (dont le catalogue des examens de labo)
--   • personnel : DIEU MERCI MUTONGWA et Rodriguez ESABE (fiches + comptes de connexion)
--
-- SUPPRIMÉ :
--   patients, rendez-vous, consultations, prescriptions, demandes et résultats
--   de laboratoire, hospitalisations et suivis, factures, lignes, paiements,
--   assureurs et tout le module assurance, médicaments et mouvements de stock,
--   dépenses, bâtiments, chambres et lits, journal d'audit, autres membres du personnel et leurs comptes.
--
-- Tout se fait dans une transaction : si les 2 comptes à conserver ne sont pas
-- retrouvés exactement, rien n'est supprimé.
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 0. COMPTES À CONSERVER (contrôle de sécurité)
-- -------------------------------------------------------------------------
CREATE TEMP TABLE personnel_conserve ON COMMIT DROP AS
SELECT id, lower(email) AS email, prenom, nom
FROM personnel
WHERE regexp_replace(upper(coalesce(prenom, '') || coalesce(nom, '')), '[^A-Z]', '', 'g')
        IN ('DIEUMERCIMUTONGWA', 'MUTONGWADIEUMERCI', 'RODRIGUEZESABE', 'ESABERODRIGUEZ');

DO $$
DECLARE
  v_nb INTEGER;
  v_noms TEXT;
BEGIN
  SELECT count(*), string_agg(prenom || ' ' || nom || ' <' || email || '>', ', ')
    INTO v_nb, v_noms
  FROM personnel_conserve;

  IF v_nb <> 2 THEN
    RAISE EXCEPTION 'Arrêt : % fiche(s) trouvée(s) au lieu de 2 (%). Aucune donnée supprimée.',
      v_nb, coalesce(v_noms, 'aucune');
  END IF;
  RAISE NOTICE 'Comptes conservés : %', v_noms;
END $$;

-- -------------------------------------------------------------------------
-- 1. DONNÉES D'ACTIVITÉ
--    Sans CASCADE : si une table liée a été oubliée, tout est annulé.
-- -------------------------------------------------------------------------
DO $$
DECLARE
  v_tables TEXT;
BEGIN
  SELECT string_agg(format('%I', t), ', ')
    INTO v_tables
  FROM unnest(ARRAY[
    'patients', 'rendez_vous', 'consultations', 'prescriptions',
    'demandes_laboratoire', 'analyses_laboratoire',
    'hospitalisations', 'suivis_hospitalisation',
    'factures', 'lignes_facture', 'paiements',
    'assureurs', 'bordereaux_assurance', 'bordereau_factures',
    'paiements_assurance', 'paiements_assurance_factures', 'litiges_assurance',
    'medicaments', 'mouvements_stock', 'depenses',
    'chambres', 'lits'
  ]) AS t
  WHERE to_regclass('public.' || t) IS NOT NULL;

  EXECUTE 'TRUNCATE TABLE ' || v_tables || ' RESTART IDENTITY';
END $$;

-- -------------------------------------------------------------------------
-- 2. PERSONNEL ET COMPTES DE CONNEXION
-- -------------------------------------------------------------------------
UPDATE departements SET chef_departement_id = NULL
WHERE chef_departement_id IS NOT NULL
  AND chef_departement_id NOT IN (SELECT id FROM personnel_conserve);

DELETE FROM personnel WHERE id NOT IN (SELECT id FROM personnel_conserve);

DELETE FROM auth.users
WHERE lower(coalesce(email, '')) NOT IN (SELECT email FROM personnel_conserve);

-- -------------------------------------------------------------------------
-- 3. JOURNAL D'AUDIT ET NUMÉROTATIONS (en dernier : les étapes ci-dessus l'alimentent)
-- -------------------------------------------------------------------------
TRUNCATE TABLE audit_logs;

DO $$
DECLARE
  s TEXT;
BEGIN
  FOREACH s IN ARRAY ARRAY['demandes_laboratoire_seq', 'seq_bordereaux_assurance',
                           'seq_paiements_assurance', 'seq_litiges_assurance'] LOOP
    IF to_regclass('public.' || s) IS NOT NULL THEN
      EXECUTE format('ALTER SEQUENCE %I RESTART WITH 1', s);
    END IF;
  END LOOP;
END $$;

COMMIT;

-- -------------------------------------------------------------------------
-- 4. VÉRIFICATION
-- -------------------------------------------------------------------------
SELECT 'personnel' AS table_, count(*) FROM personnel
UNION ALL SELECT 'comptes de connexion', count(*) FROM auth.users
UNION ALL SELECT 'patients', count(*) FROM patients
UNION ALL SELECT 'factures', count(*) FROM factures
UNION ALL SELECT 'départements', count(*) FROM departements
UNION ALL SELECT 'actes / tarifs', count(*) FROM actes_tarifs
UNION ALL SELECT 'chambres', count(*) FROM chambres
UNION ALL SELECT 'lits', count(*) FROM lits;
