/**
 * Script de création du premier Super Admin
 * ===========================================
 * Ce script crée :
 * 1. Un utilisateur dans Supabase Auth (email + mot de passe)
 * 2. Un enregistrement correspondant dans la table `personnel` avec le rôle super_admin
 *
 * Usage: node scripts/create-admin.mjs
 */

import { createClient } from '@supabase/supabase-js';

// =====================================================
// ⚠️ MODIFIEZ CES VALEURS AVANT D'EXÉCUTER LE SCRIPT
// =====================================================
const ADMIN_EMAIL = 'admin@hopital.cd';
const ADMIN_PASSWORD = 'Admin@2026';
const ADMIN_NOM = 'Administrateur';
const ADMIN_PRENOM = 'Super';
const ADMIN_TELEPHONE = '+243 999 000 000';

// =====================================================
// Configuration Supabase (lecture depuis .env.local)
// =====================================================
const SUPABASE_URL = 'https://mpqnjcdvoktnktxammer.supabase.co';
const SUPABASE_SERVICE_KEY = 'VOTRE_CLE_SECRETE_ICI';

// Client admin avec service_role key (bypass RLS)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function createSuperAdmin() {
  console.log('🏥 MediCare Pro — Création du Super Admin');
  console.log('==========================================\n');

  // Étape 1 : Créer l'utilisateur Auth
  console.log('📧 Étape 1 : Création du compte Auth...');
  console.log(`   Email: ${ADMIN_EMAIL}`);

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true, // Confirmer l'email directement
  });

  if (authError) {
    if (authError.message.includes('already been registered')) {
      console.log('   ⚠️  Cet email existe déjà dans Auth. Poursuite...\n');
    } else {
      console.error('   ❌ Erreur Auth:', authError.message);
      process.exit(1);
    }
  } else {
    console.log(`   ✅ Compte Auth créé (ID: ${authData.user?.id})\n`);
  }

  // Étape 2 : Créer l'enregistrement dans la table personnel
  console.log('👤 Étape 2 : Création du profil personnel...');

  // Vérifier si le personnel existe déjà
  const { data: existing } = await supabaseAdmin
    .from('personnel')
    .select('id')
    .eq('email', ADMIN_EMAIL)
    .single();

  if (existing) {
    console.log('   ⚠️  Ce personnel existe déjà dans la base.\n');
  } else {
    const { data: personnel, error: personnelError } = await supabaseAdmin
      .from('personnel')
      .insert([{
        code_personnel: 'ADM-001',
        nom: ADMIN_NOM,
        prenom: ADMIN_PRENOM,
        sexe: 'M',
        telephone: ADMIN_TELEPHONE,
        email: ADMIN_EMAIL,
        role: 'super_admin',
        date_embauche: new Date().toISOString().split('T')[0],
        statut: 'actif',
      }])
      .select()
      .single();

    if (personnelError) {
      console.error('   ❌ Erreur Personnel:', personnelError.message);
      process.exit(1);
    } else {
      console.log(`   ✅ Personnel créé (ID: ${personnel?.id})`);
      console.log(`   📋 Code: ADM-001`);
      console.log(`   🏷️  Rôle: Super Administrateur\n`);
    }
  }

  // Résumé
  console.log('==========================================');
  console.log('🎉 Super Admin créé avec succès !\n');
  console.log('📝 Identifiants de connexion :');
  console.log(`   Email    : ${ADMIN_EMAIL}`);
  console.log(`   Mot de passe : ${ADMIN_PASSWORD}`);
  console.log('\n🌐 Connectez-vous sur : http://localhost:3000/login');
  console.log('==========================================\n');
}

createSuperAdmin().catch(console.error);
