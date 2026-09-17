-- Autoriser la LECTURE (SELECT) pour toutes les tables de facturation
-- Si le SELECT est bloqué, l'application peut insérer des données mais ne peut pas les lire (elles reviennent vides).

CREATE POLICY "Permettre la lecture des factures" 
ON factures 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Permettre la lecture des lignes de facture" 
ON lignes_facture 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Permettre la lecture des paiements" 
ON paiements 
FOR SELECT 
TO authenticated 
USING (true);

-- Au cas où vous auriez aussi besoin de la suppression (DELETE) un jour :
CREATE POLICY "Permettre la suppression des lignes de facture" 
ON lignes_facture 
FOR DELETE 
TO authenticated 
USING (true);

CREATE POLICY "Permettre la suppression des paiements" 
ON paiements 
FOR DELETE 
TO authenticated 
USING (true);
