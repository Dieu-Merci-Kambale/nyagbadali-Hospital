'use server';

import { createClient } from '@supabase/supabase-js';

// La clé service est nécessaire pour créer les comptes Auth (elle contourne la RLS) :
// chaque appel doit donc être strictement authentifié et autorisé ci-dessous.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

const ROLES_VALIDES = [
  'super_admin', 'admin', 'medecin_chef', 'medecin', 'infirmier_chef',
  'infirmier', 'technicien_labo', 'pharmacien', 'caissier', 'receptionniste',
] as const;

const ROLES_GESTIONNAIRES = ['super_admin', 'admin'];

// Mot de passe attribué lors d'une réinitialisation par le super administrateur (hors du code source)
const MOT_DE_PASSE_PAR_DEFAUT = process.env.DEFAULT_RESET_PASSWORD;

/**
 * Vérifie que l'appelant est un membre actif ayant l'un des rôles autorisés.
 * Le jeton d'accès Supabase est validé côté serveur (impossible à falsifier).
 */
async function verifierAppelant(
  accessToken: string | undefined,
  rolesAutorises: string[],
  messageRefus: string,
) {
  if (!accessToken) return { error: 'Session expirée. Veuillez vous reconnecter.' };

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  const email = userData?.user?.email;
  if (userError || !email) return { error: 'Session invalide. Veuillez vous reconnecter.' };

  const { data: appelant } = await supabaseAdmin
    .from('personnel')
    .select('id, role, statut')
    .ilike('email', email)
    .eq('statut', 'actif')
    .maybeSingle();

  if (!appelant || !rolesAutorises.includes(appelant.role)) {
    return { error: messageRefus };
  }
  return { appelant };
}

function verifierAdministrateur(accessToken: string | undefined) {
  return verifierAppelant(accessToken, ROLES_GESTIONNAIRES, "Vous n'êtes pas autorisé à créer des comptes du personnel.");
}

function verifierSuperAdministrateur(accessToken: string | undefined) {
  return verifierAppelant(accessToken, ['super_admin'], 'Seul un super administrateur peut effectuer cette opération.');
}

/** Retrouve le compte de connexion (Auth) associé à un email. */
async function trouverCompteAuth(email: string) {
  const cible = email.trim().toLowerCase();
  for (let page = 1; ; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const trouve = data.users.find((u) => u.email?.toLowerCase() === cible);
    if (trouve) return trouve;
    if (data.users.length < 1000) return null;
  }
}

async function chargerPersonnel(personnelId: string) {
  const { data } = await supabaseAdmin
    .from('personnel')
    .select('id, nom, prenom, email, role')
    .eq('id', personnelId)
    .maybeSingle();
  return data;
}

export async function createPersonnelAction(formData: FormData, accessToken?: string) {
  try {
    const auth = await verifierAdministrateur(accessToken);
    if ('error' in auth) return { error: auth.error };

    const email = String(formData.get('email') || '').trim().toLowerCase();
    const password = String(formData.get('password') || '');
    const prenom = String(formData.get('prenom') || '').trim();
    const nom = String(formData.get('nom') || '').trim();
    const sexe = String(formData.get('sexe') || '');
    const telephone = String(formData.get('telephone') || '').trim();
    const role = String(formData.get('role') || '');
    const specialite = String(formData.get('specialite') || '').trim();
    const departement_id = String(formData.get('departement_id') || '');

    // Validation côté serveur (ne jamais se fier au formulaire)
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Adresse email invalide.' };
    if (!prenom || !nom) return { error: 'Le nom et le prénom sont obligatoires.' };
    if (password.length < 8) return { error: 'Le mot de passe doit contenir au moins 8 caractères.' };
    if (!(ROLES_VALIDES as readonly string[]).includes(role)) return { error: 'Rôle invalide.' };
    if (sexe && !['M', 'F'].includes(sexe)) return { error: 'Sexe invalide.' };
    if (role === 'super_admin' && auth.appelant.role !== 'super_admin') {
      return { error: 'Seul un super administrateur peut créer un autre super administrateur.' };
    }

    // 1. Création du compte de connexion
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      if (authError.message.includes('already been registered')) {
        return { error: 'Cet email est déjà utilisé par un autre compte.' };
      }
      return { error: `Erreur création compte : ${authError.message}` };
    }

    // 2. Code personnel unique
    const rolePrefix = role.substring(0, 3).toUpperCase();
    const code_personnel = `${rolePrefix}-${Date.now().toString().slice(-6)}`;

    // 3. Fiche du personnel
    const { error: personnelError } = await supabaseAdmin
      .from('personnel')
      .insert([{
        code_personnel,
        nom,
        prenom,
        sexe: sexe || null,
        telephone: telephone || null,
        email,
        role,
        specialite: specialite || null,
        departement_id: departement_id || null,
        statut: 'actif',
        date_embauche: new Date().toISOString().split('T')[0],
      }]);

    if (personnelError) {
      // Annulation du compte Auth si la fiche n'a pas pu être créée
      if (authData?.user?.id) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      }
      return { error: `Erreur création personnel : ${personnelError.message}` };
    }

    return { success: true };
  } catch (err: any) {
    return { error: `Une erreur inattendue est survenue : ${err.message}` };
  }
}

export async function resetPasswordPersonnelAction(personnelId: string, accessToken?: string) {
  try {
    const auth = await verifierSuperAdministrateur(accessToken);
    if ('error' in auth) return { error: auth.error };
    if (!MOT_DE_PASSE_PAR_DEFAUT) {
      return { error: 'Mot de passe par défaut non configuré (variable DEFAULT_RESET_PASSWORD).' };
    }

    const personne = await chargerPersonnel(personnelId);
    if (!personne) return { error: 'Membre du personnel introuvable.' };

    const compte = await trouverCompteAuth(personne.email);
    if (!compte) return { error: "Aucun compte de connexion n'est associé à cet email." };

    const { error } = await supabaseAdmin.auth.admin.updateUserById(compte.id, {
      password: MOT_DE_PASSE_PAR_DEFAUT,
    });
    if (error) return { error: `Erreur réinitialisation : ${error.message}` };

    return { success: true, motDePasse: MOT_DE_PASSE_PAR_DEFAUT };
  } catch (err: any) {
    return { error: `Une erreur inattendue est survenue : ${err.message}` };
  }
}

export async function deletePersonnelAction(personnelId: string, accessToken?: string) {
  try {
    const auth = await verifierSuperAdministrateur(accessToken);
    if ('error' in auth) return { error: auth.error };
    if (auth.appelant.id === personnelId) {
      return { error: 'Vous ne pouvez pas supprimer votre propre compte.' };
    }

    const personne = await chargerPersonnel(personnelId);
    if (!personne) return { error: 'Membre du personnel introuvable.' };

    // 1. Fiche du personnel en premier : si elle est liée à un historique
    //    (consultations, hospitalisations…), la suppression est refusée et le compte reste intact.
    const { error: personnelError } = await supabaseAdmin
      .from('personnel')
      .delete()
      .eq('id', personnelId);

    if (personnelError) {
      if (personnelError.code === '23503') {
        return {
          error: "Ce membre est lié à un historique médical ou administratif et ne peut pas être supprimé. Passez plutôt son statut à « Inactif » pour bloquer sa connexion.",
        };
      }
      return { error: `Erreur suppression personnel : ${personnelError.message}` };
    }

    // 2. Compte de connexion
    const compte = await trouverCompteAuth(personne.email);
    if (compte) {
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(compte.id);
      if (authError) {
        return { error: `Fiche supprimée, mais le compte de connexion n'a pas pu l'être : ${authError.message}` };
      }
    }

    return { success: true };
  } catch (err: any) {
    return { error: `Une erreur inattendue est survenue : ${err.message}` };
  }
}
