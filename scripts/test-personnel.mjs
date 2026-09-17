import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mpqnjcdvoktnktxammer.supabase.co';
const SUPABASE_SERVICE_KEY = 'VOTRE_CLE_SECRETE_ICI';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  const { data, error } = await supabaseAdmin.from('personnel').select('*');
  console.log(error ? error : data);
}
run();
