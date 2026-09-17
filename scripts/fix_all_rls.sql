-- =========================================================================
-- DÉVERROUILLAGE COMPLET DES POLITIQUES DE SÉCURITÉ (RLS)
-- Exécutez ce script dans l'éditeur SQL de Supabase pour donner les 
-- permissions de Lecture/Écriture à l'application sur TOUTES les tables.
-- =========================================================================

-- 1. Activer RLS sur toutes les tables
ALTER TABLE departements ENABLE ROW LEVEL SECURITY;
ALTER TABLE personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE rendez_vous ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chambres ENABLE ROW LEVEL SECURITY;
ALTER TABLE lits ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospitalisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE factures ENABLE ROW LEVEL SECURITY;
ALTER TABLE lignes_facture ENABLE ROW LEVEL SECURITY;
ALTER TABLE paiements ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 2. Fonction utilitaire pour recréer les politiques (évite les erreurs si elles existent déjà)
DO $$
DECLARE
    t_name text;
    tables_list text[] := ARRAY[
        'departements', 'personnel', 'patients', 'rendez_vous', 
        'consultations', 'medicaments', 'prescriptions', 'chambres', 
        'lits', 'hospitalisations', 'factures', 'lignes_facture', 
        'paiements', 'audit_logs'
    ];
BEGIN
    FOREACH t_name IN ARRAY tables_list LOOP
        -- Supprimer les anciennes politiques si elles existent
        EXECUTE format('DROP POLICY IF EXISTS "Permettre la lecture %I" ON %I', t_name, t_name);
        EXECUTE format('DROP POLICY IF EXISTS "Permettre l''insertion %I" ON %I', t_name, t_name);
        EXECUTE format('DROP POLICY IF EXISTS "Permettre la modification %I" ON %I', t_name, t_name);
        EXECUTE format('DROP POLICY IF EXISTS "Permettre la suppression %I" ON %I', t_name, t_name);
        
        -- Anciens noms de politiques possibles (nettoyage)
        EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can read %I" ON %I', t_name, t_name);
        EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can insert %I" ON %I', t_name, t_name);
        EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can update %I" ON %I', t_name, t_name);

        -- Créer les nouvelles politiques permissives pour les utilisateurs authentifiés
        EXECUTE format('CREATE POLICY "Permettre la lecture %I" ON %I FOR SELECT TO authenticated USING (true)', t_name, t_name);
        EXECUTE format('CREATE POLICY "Permettre l''insertion %I" ON %I FOR INSERT TO authenticated WITH CHECK (true)', t_name, t_name);
        EXECUTE format('CREATE POLICY "Permettre la modification %I" ON %I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t_name, t_name);
        EXECUTE format('CREATE POLICY "Permettre la suppression %I" ON %I FOR DELETE TO authenticated USING (true)', t_name, t_name);
    END LOOP;
END $$;

-- 3. (Optionnel) Si vous ne l'avez pas encore fait, voici l'injection des lits pour l'hospitalisation
DO $$
DECLARE
    chambre_id_1 UUID := uuid_generate_v4();
    chambre_id_2 UUID := uuid_generate_v4();
    chambre_id_3 UUID := uuid_generate_v4();
BEGIN
    -- Insertion de 3 chambres de types différents
    INSERT INTO chambres (id, numero, etage, type, capacite)
    VALUES 
        (chambre_id_1, '101', '1er Étage', 'individuelle', 1),
        (chambre_id_2, '102', '1er Étage', 'double', 2),
        (chambre_id_3, '201', '2ème Étage', 'commune', 4)
    ON CONFLICT DO NOTHING;

    -- Lits pour chambre 101
    INSERT INTO lits (numero, chambre_id, type_lit, statut) VALUES ('LIT-101-A', chambre_id_1, 'standard', 'disponible');

    -- Lits pour chambre 102
    INSERT INTO lits (numero, chambre_id, type_lit, statut) VALUES ('LIT-102-A', chambre_id_2, 'standard', 'disponible'), ('LIT-102-B', chambre_id_2, 'standard', 'disponible');

    -- Lits pour chambre 201
    INSERT INTO lits (numero, chambre_id, type_lit, statut) VALUES ('LIT-201-A', chambre_id_3, 'soins_intensifs', 'disponible'), ('LIT-201-B', chambre_id_3, 'soins_intensifs', 'disponible'), ('LIT-201-C', chambre_id_3, 'soins_intensifs', 'disponible'), ('LIT-201-D', chambre_id_3, 'soins_intensifs', 'disponible');
END $$;
