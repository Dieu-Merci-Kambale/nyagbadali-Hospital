// ===== Patient =====
export interface Patient {
  id: string;
  code_patient: string;
  nom: string;
  prenom: string;
  date_naissance: string;
  sexe: 'M' | 'F';
  groupe_sanguin?: string;
  adresse?: string;
  telephone?: string;
  email?: string;
  photo_url?: string;
  numero_assurance?: string;
  assureur?: string;
  contact_urgence_nom?: string;
  contact_urgence_tel?: string;
  statut: 'actif' | 'inactif' | 'décédé';
  created_at: string;
  updated_at: string;
}

// ===== Personnel =====
export type RolePersonnel =
  | 'super_admin'
  | 'admin'
  | 'medecin_chef'
  | 'medecin'
  | 'infirmier_chef'
  | 'infirmier'
  | 'technicien_labo'
  | 'pharmacien'
  | 'caissier'
  | 'receptionniste';

export interface Personnel {
  id: string;
  code_personnel: string;
  nom: string;
  prenom: string;
  sexe: 'M' | 'F';
  telephone?: string;
  email: string;
  specialite?: string;
  role: RolePersonnel;
  departement_id?: string;
  departement?: Departement;
  date_embauche: string;
  statut: 'actif' | 'inactif' | 'congé';
  photo_url?: string;
  created_at: string;
  updated_at: string;
}

// ===== Département =====
export interface Departement {
  id: string;
  nom: string;
  code: string;
  description?: string;
  chef_departement_id?: string;
  etage?: string;
  telephone?: string;
  statut: 'actif' | 'inactif';
  created_at: string;
}

// ===== Rendez-vous =====
export type StatutRDV = 'planifié' | 'confirmé' | 'en_cours' | 'terminé' | 'annulé' | 'absent';

export interface RendezVous {
  id: string;
  patient_id: string;
  patient?: Patient;
  medecin_id: string;
  medecin?: Personnel;
  departement_id?: string;
  departement?: Departement;
  date_heure: string;
  duree_minutes: number;
  motif: string;
  type: 'consultation' | 'suivi' | 'urgence' | 'examen';
  statut: StatutRDV;
  notes?: string;
  numero_queue?: number;
  created_at: string;
}

// ===== Consultation =====
export type StatutConsultation = 'en_cours' | 'terminée' | 'annulée';

export interface Consultation {
  id: string;
  patient_id: string;
  patient?: Patient;
  medecin_id: string;
  medecin?: Personnel;
  departement_id?: string;
  departement?: Departement;
  rdv_id?: string;
  date_consultation: string;
  motif: string;
  anamnese?: string;
  examen_physique?: Record<string, unknown>;
  diagnostic_principal?: string;
  diagnostics_secondaires?: string[];
  plan_traitement?: string;
  notes_privees?: string;
  constantes?: {
    temperature?: number;
    tension_systolique?: number;
    tension_diastolique?: number;
    pouls?: number;
    poids?: number;
    taille?: number;
    saturation_o2?: number;
  };
  statut: StatutConsultation;
  created_at: string;
}

// ===== Prescription =====
export interface Prescription {
  id: string;
  consultation_id: string;
  medicament_id?: string;
  medicament?: Medicament;
  nom_medicament: string;
  dosage: string;
  voie_administration: 'orale' | 'iv' | 'im' | 'sc' | 'rectale' | 'topique' | 'inhalation';
  frequence: string;
  duree: string;
  instructions?: string;
  statut: 'active' | 'dispensée' | 'annulée';
  created_at: string;
}

// ===== Médicament =====
export interface Medicament {
  id: string;
  code: string;
  nom_commercial: string;
  nom_generique: string;
  forme: string;
  dosage: string;
  famille: string;
  prix_unitaire: number;
  stock_actuel: number;
  stock_minimum: number;
  date_peremption?: string;
  fournisseur?: string;
  statut: 'disponible' | 'rupture' | 'expiré';
  created_at: string;
}

// ===== Facturation =====
export type StatutFacture = 'en_attente' | 'payée' | 'partielle' | 'annulée';

export interface Facture {
  id: string;
  numero_facture: string;
  patient_id: string;
  patient?: Patient;
  consultation_id?: string;
  hospitalisation_id?: string;
  date_facture: string;
  montant_total: number;
  montant_assurance: number;
  montant_patient: number;
  tva: number;
  statut: StatutFacture;
  created_at: string;
}

export interface LigneFacture {
  id: string;
  facture_id: string;
  description: string;
  code_acte?: string;
  quantite: number;
  prix_unitaire: number;
  montant: number;
  couvert_assurance: boolean;
}

export interface Paiement {
  id: string;
  facture_id: string;
  montant: number;
  mode_paiement: 'cash' | 'carte' | 'mobile_money' | 'virement' | 'chèque';
  reference?: string;
  date_paiement: string;
  recu_par?: string;
  created_at: string;
}

// ===== Hospitalisation =====
export type StatutHospitalisation = 'actif' | 'sorti' | 'transféré' | 'décédé';

export interface Hospitalisation {
  id: string;
  patient_id: string;
  patient?: Patient;
  medecin_responsable_id?: string;
  medecin?: Personnel;
  lit_id?: string;
  lit?: Lit;
  date_admission: string;
  date_sortie?: string;
  motif_admission: string;
  type_admission: 'urgence' | 'programmée' | 'transfert';
  diagnostic_entree?: string;
  diagnostic_sortie?: string;
  resume_sortie?: string;
  statut: StatutHospitalisation;
  created_at: string;
}

export interface Lit {
  id: string;
  numero: string;
  chambre_id: string;
  chambre?: Chambre;
  type_lit: 'standard' | 'soins_intensifs' | 'pédiatrique' | 'maternité';
  statut: 'disponible' | 'occupé' | 'maintenance' | 'réservé';
  equipements?: Record<string, unknown>;
}

export interface Chambre {
  id: string;
  numero: string;
  departement_id: string;
  departement?: Departement;
  etage: string;
  type: 'individuelle' | 'double' | 'commune';
  capacite: number;
}

// ===== Dashboard Stats =====
export interface DashboardStats {
  totalPatients: number;
  patientsAujourdhui: number;
  rdvAujourdhui: number;
  consultationsEnCours: number;
  litsOccupes: number;
  litsTotal: number;
  revenuAujourdhui: number;
  revenuMensuel: number;
  facturesImpayees: number;
}
