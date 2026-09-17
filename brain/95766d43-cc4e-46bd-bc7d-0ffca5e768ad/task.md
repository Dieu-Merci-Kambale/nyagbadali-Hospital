# Tâches d'implémentation - Module Hospitalisation

- [x] **1. Base de données & RLS**
  - [x] Créer le script `scripts/fix_hospitalisation_rls.sql`.
  - [x] Définir les politiques `SELECT`, `INSERT`, `UPDATE` pour `chambres`, `lits`, `hospitalisations`.
  - [x] Inclure une insertion de données initiales (Chambres et Lits) pour les tests.

- [x] **2. UI : Liste des Hospitalisations (`/hospitalisation/page.tsx`)**
  - [x] Créer la page listant les patients actuellement admis.
  - [x] Ajouter les statistiques en haut de la page.
  - [x] Inclure un onglet ou lien pour la vue "Gestion des Lits".

- [x] **3. UI : Gestion des Lits (`/hospitalisation/lits/page.tsx`)**
  - [x] Créer une vue sous forme de carte (ou grille) affichant les chambres.
  - [x] Afficher les lits dans chaque chambre avec leur code couleur (Disponible, Occupé).

- [x] **4. UI : Admission d'un patient (`/hospitalisation/nouvelle/page.tsx`)**
  - [x] Formulaire de nouvelle admission.
  - [x] Sélection du patient, médecin, et **Lit disponible**.
  - [x] Mise à jour transactionnelle : Création de l'hospitalisation + MAJ statut du lit.
  - [x] Intégrer `useConfirm`.

- [x] **5. UI : Suivi et Sortie (`/hospitalisation/[id]/edit/page.tsx`)**
  - [x] Détails de l'hospitalisation.
  - [x] Formulaire de mise à jour (Marquer comme sorti).
  - [x] Mise à jour transactionnelle : Modification hospitalisation + Libération du lit.
  - [x] Intégrer `useConfirm`.
