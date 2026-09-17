-- =========================================================================
-- ACTIVATION DES POLITIQUES DE SÉCURITÉ POUR LE MODULE HOSPITALISATION
-- =========================================================================

-- Activer RLS sur les tables
ALTER TABLE chambres ENABLE ROW LEVEL SECURITY;
ALTER TABLE lits ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospitalisations ENABLE ROW LEVEL SECURITY;

-- 1. Table : chambres
CREATE POLICY "Permettre la lecture des chambres" 
ON chambres FOR SELECT TO authenticated USING (true);

CREATE POLICY "Permettre l'insertion des chambres" 
ON chambres FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Permettre la modification des chambres" 
ON chambres FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 2. Table : lits
CREATE POLICY "Permettre la lecture des lits" 
ON lits FOR SELECT TO authenticated USING (true);

CREATE POLICY "Permettre l'insertion des lits" 
ON lits FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Permettre la modification des lits" 
ON lits FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 3. Table : hospitalisations
CREATE POLICY "Permettre la lecture des hospitalisations" 
ON hospitalisations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Permettre l'insertion des hospitalisations" 
ON hospitalisations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Permettre la modification des hospitalisations" 
ON hospitalisations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


-- =========================================================================
-- JEU DE DONNÉES DE TEST : INJECTION DE CHAMBRES ET LITS
-- =========================================================================
-- Nous insérons quelques chambres et lits par défaut pour pouvoir tester
-- l'interface d'admission immédiatement, sans devoir construire une interface
-- complète de création de chambres au préalable.

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

    -- Insertion des lits pour la chambre 101 (Individuelle)
    INSERT INTO lits (numero, chambre_id, type_lit, statut)
    VALUES 
        ('LIT-101-A', chambre_id_1, 'standard', 'disponible');

    -- Insertion des lits pour la chambre 102 (Double)
    INSERT INTO lits (numero, chambre_id, type_lit, statut)
    VALUES 
        ('LIT-102-A', chambre_id_2, 'standard', 'disponible'),
        ('LIT-102-B', chambre_id_2, 'standard', 'disponible');

    -- Insertion des lits pour la chambre 201 (Commune / Soins intensifs)
    INSERT INTO lits (numero, chambre_id, type_lit, statut)
    VALUES 
        ('LIT-201-A', chambre_id_3, 'soins_intensifs', 'disponible'),
        ('LIT-201-B', chambre_id_3, 'soins_intensifs', 'disponible'),
        ('LIT-201-C', chambre_id_3, 'soins_intensifs', 'disponible'),
        ('LIT-201-D', chambre_id_3, 'soins_intensifs', 'disponible');
END $$;
