-- Script pour autoriser les modifications sur toutes les tables de facturation
-- Par défaut, Supabase (avec RLS activé) bloque les UPDATE/INSERT si aucune politique explicite n'existe.

-- 1. Table: factures
CREATE POLICY "Permettre la mise à jour des factures" 
ON factures 
FOR UPDATE 
TO authenticated 
USING (true)
WITH CHECK (true);

-- 2. Table: lignes_facture
CREATE POLICY "Permettre l'insertion de lignes de facture" 
ON lignes_facture 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Permettre la mise à jour des lignes de facture" 
ON lignes_facture 
FOR UPDATE 
TO authenticated 
USING (true)
WITH CHECK (true);

-- 3. Table: paiements
CREATE POLICY "Permettre l'insertion de paiements" 
ON paiements 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Permettre la mise à jour des paiements" 
ON paiements 
FOR UPDATE 
TO authenticated 
USING (true)
WITH CHECK (true);

-- Optionnel: Si vous préférez la solution rapide de développement pour toutes les tables de facturation :
-- ALTER TABLE factures DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE lignes_facture DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE paiements DISABLE ROW LEVEL SECURITY;
