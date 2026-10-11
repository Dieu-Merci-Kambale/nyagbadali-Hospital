-- =========================================================================
-- NYAGBADALI — MISE À JOUR EN TEMPS RÉEL ENTRE LES POSTES (10/10/2026)
-- -------------------------------------------------------------------------
-- Active la diffusion Supabase Realtime des tables partagées entre plusieurs
-- postes (caisse, pharmacie, laboratoire, accueil, services).
-- Un paiement, une délivrance ou un résultat saisi sur un poste apparaît
-- alors immédiatement sur les autres écrans ouverts, sans recharger la page.
--
-- La diffusion respecte les règles de sécurité (RLS) : chaque utilisateur ne
-- reçoit que les changements des données qu'il a le droit de voir.
-- Idempotent : peut être relancé sans risque.
-- =========================================================================

DO $$
DECLARE
  t TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'factures', 'paiements', 'lignes_facture',
    'rendez_vous', 'prescriptions', 'medicaments', 'mouvements_stock',
    'analyses_laboratoire', 'hospitalisations', 'suivis_hospitalisation'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
