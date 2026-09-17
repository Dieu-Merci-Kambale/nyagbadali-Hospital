-- Ce script permet d'autoriser les mises à jour sur la table consultations
-- Si RLS est activé, il faut ajouter une politique explicite pour UPDATE.

-- Créer une politique permettant aux utilisateurs connectés de mettre à jour les consultations
CREATE POLICY "Permettre la mise à jour des consultations" 
ON consultations 
FOR UPDATE 
TO authenticated 
USING (true)
WITH CHECK (true);

-- Alternative : si vous souhaitez simplement désactiver RLS pour la table (moins sécurisé mais plus simple en dev)
-- ALTER TABLE consultations DISABLE ROW LEVEL SECURITY;
