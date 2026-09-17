-- =====================================================
-- HOSPITAL MANAGEMENT SYSTEM - Supabase Schema
-- MediCare Pro - Database Migration
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- DEPARTEMENTS
-- =====================================================
CREATE TABLE IF NOT EXISTS departements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nom VARCHAR(100) NOT NULL,
    code VARCHAR(10) UNIQUE NOT NULL,
    description TEXT,
    chef_departement_id UUID,
    etage VARCHAR(20),
    telephone VARCHAR(20),
    statut VARCHAR(20) DEFAULT 'actif' CHECK (statut IN ('actif', 'inactif')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PERSONNEL
-- =====================================================
CREATE TABLE IF NOT EXISTS personnel (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code_personnel VARCHAR(20) UNIQUE NOT NULL,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    sexe CHAR(1) CHECK (sexe IN ('M', 'F')),
    telephone VARCHAR(20),
    email VARCHAR(100) UNIQUE NOT NULL,
    specialite VARCHAR(100),
    role VARCHAR(30) NOT NULL CHECK (role IN (
        'super_admin', 'admin', 'medecin_chef', 'medecin',
        'infirmier_chef', 'infirmier', 'technicien_labo',
        'pharmacien', 'caissier', 'receptionniste'
    )),
    departement_id UUID REFERENCES departements(id),
    date_embauche DATE NOT NULL,
    statut VARCHAR(20) DEFAULT 'actif' CHECK (statut IN ('actif', 'inactif', 'congé')),
    photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- FK: chef de département
ALTER TABLE departements
    ADD CONSTRAINT fk_chef_departement
    FOREIGN KEY (chef_departement_id) REFERENCES personnel(id);

-- =====================================================
-- PATIENTS
-- =====================================================
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code_patient VARCHAR(20) UNIQUE NOT NULL,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    date_naissance DATE NOT NULL,
    sexe CHAR(1) CHECK (sexe IN ('M', 'F')),
    groupe_sanguin VARCHAR(5),
    adresse TEXT,
    telephone VARCHAR(20),
    email VARCHAR(100),
    photo_url TEXT,
    numero_assurance VARCHAR(50),
    assureur VARCHAR(100),
    contact_urgence_nom VARCHAR(100),
    contact_urgence_tel VARCHAR(20),
    statut VARCHAR(20) DEFAULT 'actif' CHECK (statut IN ('actif', 'inactif', 'décédé')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-generate patient code
CREATE OR REPLACE FUNCTION generate_patient_code()
RETURNS TRIGGER AS $$
DECLARE
    next_num INTEGER;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(code_patient FROM 10) AS INTEGER)), 0) + 1
    INTO next_num
    FROM patients
    WHERE code_patient LIKE 'PAT-' || TO_CHAR(NOW(), 'YYYY') || '-%';

    NEW.code_patient := 'PAT-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(next_num::TEXT, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_patient_code
    BEFORE INSERT ON patients
    FOR EACH ROW
    WHEN (NEW.code_patient IS NULL)
    EXECUTE FUNCTION generate_patient_code();

-- =====================================================
-- RENDEZ-VOUS
-- =====================================================
CREATE TABLE IF NOT EXISTS rendez_vous (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id) NOT NULL,
    medecin_id UUID REFERENCES personnel(id) NOT NULL,
    departement_id UUID REFERENCES departements(id),
    date_heure TIMESTAMPTZ NOT NULL,
    duree_minutes INTEGER DEFAULT 30,
    motif TEXT NOT NULL,
    type VARCHAR(20) DEFAULT 'consultation' CHECK (type IN ('consultation', 'suivi', 'urgence', 'examen')),
    statut VARCHAR(20) DEFAULT 'planifié' CHECK (statut IN ('planifié', 'confirmé', 'en_cours', 'terminé', 'annulé', 'absent')),
    notes TEXT,
    numero_queue INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- CONSULTATIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS consultations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id) NOT NULL,
    medecin_id UUID REFERENCES personnel(id) NOT NULL,
    departement_id UUID REFERENCES departements(id),
    rdv_id UUID REFERENCES rendez_vous(id),
    date_consultation TIMESTAMPTZ DEFAULT NOW(),
    motif TEXT NOT NULL,
    anamnese TEXT,
    examen_physique JSONB,
    diagnostic_principal VARCHAR(10), -- Code ICD-10/11
    diagnostics_secondaires TEXT[],
    plan_traitement TEXT,
    notes_privees TEXT,
    constantes JSONB, -- temperature, tension, pouls, poids, taille, spo2
    statut VARCHAR(20) DEFAULT 'en_cours' CHECK (statut IN ('en_cours', 'terminée', 'annulée')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- MEDICAMENTS
-- =====================================================
CREATE TABLE IF NOT EXISTS medicaments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) UNIQUE NOT NULL,
    nom_commercial VARCHAR(200) NOT NULL,
    nom_generique VARCHAR(200) NOT NULL,
    forme VARCHAR(50) NOT NULL,
    dosage VARCHAR(50) NOT NULL,
    famille VARCHAR(100),
    prix_unitaire DECIMAL(10,2) NOT NULL DEFAULT 0,
    stock_actuel INTEGER NOT NULL DEFAULT 0,
    stock_minimum INTEGER NOT NULL DEFAULT 10,
    date_peremption DATE,
    fournisseur VARCHAR(200),
    statut VARCHAR(20) DEFAULT 'disponible' CHECK (statut IN ('disponible', 'rupture', 'expiré')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PRESCRIPTIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS prescriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consultation_id UUID REFERENCES consultations(id) NOT NULL,
    medicament_id UUID REFERENCES medicaments(id),
    nom_medicament VARCHAR(200) NOT NULL,
    dosage VARCHAR(50) NOT NULL,
    voie_administration VARCHAR(30) CHECK (voie_administration IN ('orale', 'iv', 'im', 'sc', 'rectale', 'topique', 'inhalation')),
    frequence VARCHAR(50),
    duree VARCHAR(30),
    instructions TEXT,
    statut VARCHAR(20) DEFAULT 'active' CHECK (statut IN ('active', 'dispensée', 'annulée')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- CHAMBRES & LITS
-- =====================================================
CREATE TABLE IF NOT EXISTS chambres (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero VARCHAR(10) NOT NULL,
    departement_id UUID REFERENCES departements(id),
    etage VARCHAR(10),
    type VARCHAR(20) DEFAULT 'commune' CHECK (type IN ('individuelle', 'double', 'commune')),
    capacite INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS lits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero VARCHAR(10) NOT NULL,
    chambre_id UUID REFERENCES chambres(id),
    type_lit VARCHAR(20) DEFAULT 'standard' CHECK (type_lit IN ('standard', 'soins_intensifs', 'pédiatrique', 'maternité')),
    statut VARCHAR(20) DEFAULT 'disponible' CHECK (statut IN ('disponible', 'occupé', 'maintenance', 'réservé')),
    equipements JSONB
);

-- =====================================================
-- HOSPITALISATIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS hospitalisations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id) NOT NULL,
    medecin_responsable_id UUID REFERENCES personnel(id),
    lit_id UUID REFERENCES lits(id),
    date_admission TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_sortie TIMESTAMPTZ,
    motif_admission TEXT NOT NULL,
    type_admission VARCHAR(20) CHECK (type_admission IN ('urgence', 'programmée', 'transfert')),
    diagnostic_entree VARCHAR(10),
    diagnostic_sortie VARCHAR(10),
    resume_sortie TEXT,
    statut VARCHAR(20) DEFAULT 'actif' CHECK (statut IN ('actif', 'sorti', 'transféré', 'décédé')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- FACTURATION
-- =====================================================
CREATE TABLE IF NOT EXISTS factures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero_facture VARCHAR(20) UNIQUE NOT NULL,
    patient_id UUID REFERENCES patients(id) NOT NULL,
    consultation_id UUID REFERENCES consultations(id),
    hospitalisation_id UUID REFERENCES hospitalisations(id),
    date_facture TIMESTAMPTZ DEFAULT NOW(),
    montant_total DECIMAL(12,2) NOT NULL,
    montant_assurance DECIMAL(12,2) DEFAULT 0,
    montant_patient DECIMAL(12,2) NOT NULL,
    tva DECIMAL(12,2) DEFAULT 0,
    statut VARCHAR(20) DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'payée', 'partielle', 'annulée')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lignes_facture (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facture_id UUID REFERENCES factures(id) ON DELETE CASCADE NOT NULL,
    description TEXT NOT NULL,
    code_acte VARCHAR(20),
    quantite INTEGER DEFAULT 1,
    prix_unitaire DECIMAL(10,2) NOT NULL,
    montant DECIMAL(12,2) NOT NULL,
    couvert_assurance BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS paiements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facture_id UUID REFERENCES factures(id) NOT NULL,
    montant DECIMAL(12,2) NOT NULL,
    mode_paiement VARCHAR(20) CHECK (mode_paiement IN ('cash', 'carte', 'mobile_money', 'virement', 'chèque')),
    reference VARCHAR(100),
    date_paiement TIMESTAMPTZ DEFAULT NOW(),
    recu_par UUID REFERENCES personnel(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- AUDIT LOG (immutable)
-- =====================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID,
    action VARCHAR(50) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES for Performance
-- =====================================================
CREATE INDEX idx_patients_nom ON patients(nom, prenom);
CREATE INDEX idx_patients_code ON patients(code_patient);
CREATE INDEX idx_patients_telephone ON patients(telephone);
CREATE INDEX idx_personnel_role ON personnel(role);
CREATE INDEX idx_personnel_departement ON personnel(departement_id);
CREATE INDEX idx_rdv_date ON rendez_vous(date_heure);
CREATE INDEX idx_rdv_patient ON rendez_vous(patient_id);
CREATE INDEX idx_rdv_medecin ON rendez_vous(medecin_id);
CREATE INDEX idx_consultations_patient ON consultations(patient_id);
CREATE INDEX idx_consultations_date ON consultations(date_consultation);
CREATE INDEX idx_factures_patient ON factures(patient_id);
CREATE INDEX idx_factures_statut ON factures(statut);
CREATE INDEX idx_factures_date ON factures(date_facture);
CREATE INDEX idx_hospitalisations_patient ON hospitalisations(patient_id);
CREATE INDEX idx_hospitalisations_statut ON hospitalisations(statut);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_table ON audit_logs(table_name);
CREATE INDEX idx_medicaments_nom ON medicaments(nom_commercial, nom_generique);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) Policies
-- =====================================================
-- Enable RLS on all tables
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE rendez_vous ENABLE ROW LEVEL SECURITY;
ALTER TABLE factures ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospitalisations ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all data (within hospital)
CREATE POLICY "Authenticated users can read patients"
    ON patients FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can insert patients"
    ON patients FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Authenticated users can update patients"
    ON patients FOR UPDATE
    TO authenticated
    USING (true);

-- =====================================================
-- updated_at trigger
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_patients_updated_at
    BEFORE UPDATE ON patients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_personnel_updated_at
    BEFORE UPDATE ON personnel
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
