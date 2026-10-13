-- =========================================================================
-- NYAGBADALI — DATE DE CRÉATION DES CHAMBRES ET DES LITS (13/10/2026)
-- -------------------------------------------------------------------------
-- À exécuter dans l'éditeur SQL de Supabase.
--
-- Toutes les listes sont triées de la plus récente à la plus ancienne selon
-- la date et l'heure de création. Les chambres et les lits n'avaient pas de
-- date de création : elle est ajoutée (les éléments existants reçoivent la
-- date d'exécution du script et gardent leur ordre par numéro).
-- Idempotent : peut être relancé sans risque.
-- =========================================================================

ALTER TABLE chambres ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE lits ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

NOTIFY pgrst, 'reload schema';
