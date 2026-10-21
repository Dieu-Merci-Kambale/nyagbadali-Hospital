-- =========================================================================
-- NYAGBADALI — DÉPENSES DE L'HÔPITAL (21/10/2026)
-- -------------------------------------------------------------------------
-- À exécuter dans l'éditeur SQL de Supabase, APRÈS 20261010_securite_roles.sql.
--
-- Enregistre les sorties de caisse : achats de matériel et de médicaments,
-- loyer, salaires, factures d'eau et d'électricité, entretien, etc.
-- Le solde de caisse = encaissements (paiements) − dépenses validées.
--
-- Droits (identiques à src/lib/role-permissions.ts) :
--   * lecture et enregistrement : super_admin, admin, caissier ;
--   * modification et annulation : super_admin, admin ;
--   * suppression : super_admin, admin, uniquement une dépense annulée.
-- Chaque opération est tracée dans le journal d'audit.
-- Idempotent : peut être relancé sans risque, ne supprime aucune donnée.
-- =========================================================================

CREATE TABLE IF NOT EXISTS depenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero VARCHAR(30) UNIQUE NOT NULL,
    date_depense TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    categorie VARCHAR(30) NOT NULL DEFAULT 'autre',
    libelle VARCHAR(200) NOT NULL,
    beneficiaire VARCHAR(150),
    montant DECIMAL(12, 2) NOT NULL,
    mode_paiement VARCHAR(20) NOT NULL DEFAULT 'cash',
    reference VARCHAR(100),
    notes TEXT,
    statut VARCHAR(20) NOT NULL DEFAULT 'validée',
    motif_annulation TEXT,
    enregistre_par UUID REFERENCES personnel(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Contraintes (recréées pour rester alignées sur l'application)
ALTER TABLE depenses DROP CONSTRAINT IF EXISTS depenses_montant_check;
ALTER TABLE depenses ADD CONSTRAINT depenses_montant_check CHECK (montant > 0);

ALTER TABLE depenses DROP CONSTRAINT IF EXISTS depenses_categorie_check;
ALTER TABLE depenses ADD CONSTRAINT depenses_categorie_check CHECK (categorie IN (
  'achat_materiel', 'medicaments', 'loyer', 'salaires', 'eau_electricite',
  'entretien', 'fournitures', 'transport', 'impots', 'autre'
));

ALTER TABLE depenses DROP CONSTRAINT IF EXISTS depenses_mode_paiement_check;
ALTER TABLE depenses ADD CONSTRAINT depenses_mode_paiement_check CHECK (mode_paiement IN (
  'cash', 'mobile_money', 'carte', 'virement', 'chèque'
));

ALTER TABLE depenses DROP CONSTRAINT IF EXISTS depenses_statut_check;
ALTER TABLE depenses ADD CONSTRAINT depenses_statut_check CHECK (statut IN ('validée', 'annulée'));

CREATE INDEX IF NOT EXISTS idx_depenses_date ON depenses(date_depense);
CREATE INDEX IF NOT EXISTS idx_depenses_categorie ON depenses(categorie);

-- Date de mise à jour automatique
CREATE OR REPLACE FUNCTION public.depenses_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_depenses_updated_at ON depenses;
CREATE TRIGGER trg_depenses_updated_at BEFORE UPDATE ON depenses
  FOR EACH ROW EXECUTE FUNCTION public.depenses_touch_updated_at();

-- Journal d'audit (fonction créée par 20261009_fonctionnalites_completes.sql)
DROP TRIGGER IF EXISTS trg_audit_depenses ON depenses;
CREATE TRIGGER trg_audit_depenses AFTER INSERT OR UPDATE OR DELETE ON depenses
  FOR EACH ROW EXECUTE FUNCTION nyagbadali_audit();

-- -------------------------------------------------------------------------
-- SÉCURITÉ PAR RÔLE
-- -------------------------------------------------------------------------
ALTER TABLE depenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON depenses FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON depenses TO authenticated;

DROP POLICY IF EXISTS "depenses_select" ON depenses;
DROP POLICY IF EXISTS "depenses_insert" ON depenses;
DROP POLICY IF EXISTS "depenses_update" ON depenses;
DROP POLICY IF EXISTS "depenses_delete" ON depenses;

CREATE POLICY "depenses_select" ON depenses FOR SELECT TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin','caissier'])));
CREATE POLICY "depenses_insert" ON depenses FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin','caissier'])) AND statut = 'validée');
-- Une dépense enregistrée ne se modifie ou ne s'annule que par l'administration
CREATE POLICY "depenses_update" ON depenses FOR UPDATE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin'])))
  WITH CHECK ((SELECT public.has_role(ARRAY['super_admin','admin'])));
CREATE POLICY "depenses_delete" ON depenses FOR DELETE TO authenticated
  USING ((SELECT public.has_role(ARRAY['super_admin','admin'])) AND statut = 'annulée');

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
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'depenses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.depenses;
  END IF;
END $$;
