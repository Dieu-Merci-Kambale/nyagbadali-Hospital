import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mpqnjcdvoktnktxammer.supabase.co';
const SUPABASE_SERVICE_KEY = 'VOTRE_CLE_SECRETE_ICI';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const defaultDepartements = [
  { code: 'URG', nom: 'Urgences', description: 'Service des urgences 24/7' },
  { code: 'PED', nom: 'Pédiatrie', description: 'Soins pour enfants' },
  { code: 'CAR', nom: 'Cardiologie', description: 'Maladies du cœur' },
  { code: 'MAT', nom: 'Maternité', description: 'Gynécologie et obstétrique' },
  { code: 'CHI', nom: 'Chirurgie', description: 'Bloc opératoire et soins intensifs' },
  { code: 'LAB', nom: 'Laboratoire', description: 'Analyses médicales' },
  { code: 'PHA', nom: 'Pharmacie', description: 'Gestion des médicaments' },
  { code: 'ADM', nom: 'Administration', description: 'Ressources humaines et finances' },
  { code: 'REC', nom: 'Réception', description: 'Accueil et orientation des patients' },
];

async function seedDepartements() {
  console.log('Vérification des départements...');
  const { data, error } = await supabaseAdmin.from('departements').select('id');
  
  if (error) {
    console.error('Erreur de lecture des départements:', error.message);
    return;
  }

  if (data.length === 0) {
    console.log('La table départements est vide. Insertion des départements par défaut...');
    const { error: insertError } = await supabaseAdmin.from('departements').insert(defaultDepartements);
    if (insertError) {
      console.error('Erreur lors de l\'insertion:', insertError.message);
    } else {
      console.log('Départements insérés avec succès !');
    }
  } else {
    console.log(`${data.length} départements existent déjà.`);
  }
}

seedDepartements().catch(console.error);
