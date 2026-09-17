import { createClient } from '@supabase/supabase-js';
import type { 
  Patient, Personnel, Departement, Consultation, RendezVous, 
  Prescription, Medicament, Facture, LigneFacture, Paiement, 
  Hospitalisation, Lit, Chambre 
} from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      patients: {
        Row: Patient;
        Insert: Omit<Patient, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Patient, 'id'>>;
      };
      personnel: {
        Row: Personnel;
        Insert: Omit<Personnel, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Personnel, 'id'>>;
      };
      departements: {
        Row: Departement;
        Insert: Omit<Departement, 'id' | 'created_at'>;
        Update: Partial<Omit<Departement, 'id'>>;
      };
      consultations: {
        Row: Consultation;
        Insert: Omit<Consultation, 'id' | 'created_at'>;
        Update: Partial<Omit<Consultation, 'id'>>;
      };
      rendez_vous: {
        Row: RendezVous;
        Insert: Omit<RendezVous, 'id' | 'created_at'>;
        Update: Partial<Omit<RendezVous, 'id'>>;
      };
      prescriptions: {
        Row: Prescription;
        Insert: Omit<Prescription, 'id' | 'created_at'>;
        Update: Partial<Omit<Prescription, 'id'>>;
      };
      medicaments: {
        Row: Medicament;
        Insert: Omit<Medicament, 'id' | 'created_at'>;
        Update: Partial<Omit<Medicament, 'id'>>;
      };
      factures: {
        Row: Facture;
        Insert: Omit<Facture, 'id' | 'created_at'>;
        Update: Partial<Omit<Facture, 'id'>>;
      };
      lignes_facture: {
        Row: LigneFacture;
        Insert: Omit<LigneFacture, 'id'>;
        Update: Partial<Omit<LigneFacture, 'id'>>;
      };
      paiements: {
        Row: Paiement;
        Insert: Omit<Paiement, 'id' | 'created_at'>;
        Update: Partial<Omit<Paiement, 'id'>>;
      };
      hospitalisations: {
        Row: Hospitalisation;
        Insert: Omit<Hospitalisation, 'id' | 'created_at'>;
        Update: Partial<Omit<Hospitalisation, 'id'>>;
      };
      lits: {
        Row: Lit;
        Insert: Omit<Lit, 'id'>;
        Update: Partial<Omit<Lit, 'id'>>;
      };
      chambres: {
        Row: Chambre;
        Insert: Omit<Chambre, 'id'>;
        Update: Partial<Omit<Chambre, 'id'>>;
      };
    };
  };
};
