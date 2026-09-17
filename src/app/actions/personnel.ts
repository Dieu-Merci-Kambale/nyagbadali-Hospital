'use server';

import { createClient } from '@supabase/supabase-js';

// We must use the service role key to bypass RLS and create Auth users
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

export async function createPersonnelAction(formData: FormData) {
  try {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const prenom = formData.get('prenom') as string;
    const nom = formData.get('nom') as string;
    const sexe = formData.get('sexe') as string;
    const telephone = formData.get('telephone') as string;
    const role = formData.get('role') as string;
    const specialite = formData.get('specialite') as string;
    const departement_id = formData.get('departement_id') as string;

    // 1. Create Auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      if (authError.message.includes('already been registered')) {
        return { error: "Cet email est déjà utilisé par un autre compte." };
      }
      return { error: `Erreur création compte: ${authError.message}` };
    }

    // 2. Generate a personnel code
    const rolePrefix = role.substring(0, 3).toUpperCase();
    const uniqueId = Math.floor(100 + Math.random() * 900); // 3 random digits
    const code_personnel = `${rolePrefix}-${uniqueId}`;

    // 3. Create Personnel record
    const { error: personnelError } = await supabaseAdmin
      .from('personnel')
      .insert([{
        code_personnel,
        nom,
        prenom,
        sexe,
        telephone,
        email,
        role,
        specialite: specialite || null,
        departement_id: departement_id || null,
        statut: 'actif',
        date_embauche: new Date().toISOString().split('T')[0],
      }]);

    if (personnelError) {
      // Rollback Auth user if personnel creation fails
      if (authData?.user?.id) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      }
      return { error: `Erreur création personnel: ${personnelError.message}` };
    }

    return { success: true };
  } catch (err: any) {
    return { error: `Une erreur inattendue est survenue: ${err.message}` };
  }
}
