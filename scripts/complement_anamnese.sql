-- Exécutez ce script dans l'éditeur SQL de Supabase AVANT de déployer le champ
-- « Complément d'anamnèse » des consultations.
-- Colonne facultative : les consultations existantes ne sont pas modifiées.

ALTER TABLE consultations ADD COLUMN IF NOT EXISTS complement_anamnese TEXT;

-- Recharge le cache du schéma de l'API Supabase pour que la colonne soit visible tout de suite
NOTIFY pgrst, 'reload schema';
