-- =========================================================================
-- NYAGBADALI — CHAMBRES ET LITS PAR BÂTIMENT (23/10/2026)
-- -------------------------------------------------------------------------
-- À exécuter dans l'éditeur SQL de Supabase.
--
-- 1. L'« étage » d'une chambre devient le « bâtiment » (colonne etage
--    conservée, élargie pour recevoir « Bâtiment 1 », « Bâtiment 2 »...).
-- 2. Le numéro de chambre est élargi pour accepter un nom de salle
--    (« Chirurgie homme », « Salle de réveil », « Privé 1 »...).
-- 3. Création de la nouvelle configuration de l'hébergement :
--      Bâtiment 1 : Chirurgie homme (5), Chirurgie femme (5),
--                   Médecine interne homme (5), Médecine interne femme (5),
--                   Maternité (4), Salle de réveil (2), Salle de travail (2),
--                   Salle de garde (1)
--      Bâtiment 2 : Pédiatrie (9), Salle des infirmiers (2)
--      Bâtiment 3 : Privé — 6 chambres de 1 lit
--      Bâtiment 4 : Salle d'isolement (4), Salle d'urgence (5)
--    Les lits sont numérotés 1, 2, 3... dans chaque salle. Le département
--    est rattaché automatiquement s'il existe un département au nom proche.
-- Idempotent : une salle déjà présente (même nom, même bâtiment) n'est pas
-- recréée ; le script peut être relancé sans risque.
-- =========================================================================

ALTER TABLE chambres ALTER COLUMN numero TYPE VARCHAR(40);
ALTER TABLE chambres ALTER COLUMN etage TYPE VARCHAR(30);

DO $$
DECLARE
  r RECORD;
  v_chambre UUID;
  v_dept UUID;
  i INTEGER;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('Bâtiment 1', 'Chirurgie homme',        'commune',      5, 'standard',        '%chirurg%'),
      ('Bâtiment 1', 'Chirurgie femme',        'commune',      5, 'standard',        '%chirurg%'),
      ('Bâtiment 1', 'Médecine interne homme', 'commune',      5, 'standard',        '%m_decine interne%'),
      ('Bâtiment 1', 'Médecine interne femme', 'commune',      5, 'standard',        '%m_decine interne%'),
      ('Bâtiment 1', 'Maternité',              'commune',      4, 'maternité',       '%maternit%'),
      ('Bâtiment 1', 'Salle de réveil',        'double',       2, 'soins_intensifs', NULL),
      ('Bâtiment 1', 'Salle de travail',       'double',       2, 'maternité',       '%maternit%'),
      ('Bâtiment 1', 'Salle de garde',         'individuelle', 1, 'standard',        NULL),
      ('Bâtiment 2', 'Pédiatrie',              'commune',      9, 'pédiatrique',     '%p_diatr%'),
      ('Bâtiment 2', 'Salle des infirmiers',   'double',       2, 'standard',        NULL),
      ('Bâtiment 3', 'Privé 1',                'individuelle', 1, 'standard',        NULL),
      ('Bâtiment 3', 'Privé 2',                'individuelle', 1, 'standard',        NULL),
      ('Bâtiment 3', 'Privé 3',                'individuelle', 1, 'standard',        NULL),
      ('Bâtiment 3', 'Privé 4',                'individuelle', 1, 'standard',        NULL),
      ('Bâtiment 3', 'Privé 5',                'individuelle', 1, 'standard',        NULL),
      ('Bâtiment 3', 'Privé 6',                'individuelle', 1, 'standard',        NULL),
      ('Bâtiment 4', 'Salle d''isolement',     'commune',      4, 'standard',        NULL),
      ('Bâtiment 4', 'Salle d''urgence',       'commune',      5, 'soins_intensifs', '%urgence%')
    ) AS t(batiment, nom, type_chambre, nb_lits, type_lit, dept_motif)
  LOOP
    IF EXISTS (SELECT 1 FROM chambres WHERE numero = r.nom AND etage = r.batiment) THEN
      CONTINUE;
    END IF;

    v_dept := NULL;
    IF r.dept_motif IS NOT NULL THEN
      SELECT id INTO v_dept FROM departements WHERE nom ILIKE r.dept_motif ORDER BY nom LIMIT 1;
    END IF;

    INSERT INTO chambres (numero, etage, type, capacite, departement_id)
    VALUES (r.nom, r.batiment, r.type_chambre, r.nb_lits, v_dept)
    RETURNING id INTO v_chambre;

    FOR i IN 1..r.nb_lits LOOP
      INSERT INTO lits (numero, chambre_id, type_lit, statut)
      VALUES (i::TEXT, v_chambre, r.type_lit, 'disponible');
    END LOOP;
  END LOOP;
END $$;

-- -------------------------------------------------------------------------
-- FACULTATIF — suppression des anciennes chambres (hors nouvelle
-- configuration) dont aucun lit n'a jamais servi à une hospitalisation.
-- Les chambres ayant un historique de séjours sont conservées (elles peuvent
-- être mises à jour depuis l'application). Retirer les « -- » pour exécuter.
-- -------------------------------------------------------------------------
-- DELETE FROM lits l
-- WHERE l.chambre_id IN (SELECT id FROM chambres WHERE COALESCE(etage, '') NOT LIKE 'Bâtiment %')
--   AND NOT EXISTS (SELECT 1 FROM hospitalisations h WHERE h.lit_id = l.id);
-- DELETE FROM chambres c
-- WHERE COALESCE(c.etage, '') NOT LIKE 'Bâtiment %'
--   AND NOT EXISTS (SELECT 1 FROM lits l WHERE l.chambre_id = c.id);

NOTIFY pgrst, 'reload schema';
