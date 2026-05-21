import { createClient, type User as SupabaseAuthUser } from '@supabase/supabase-js';
import { normalizeEmailForLookup } from '@shared/parent-identity';

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return null;
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Paginated lookup — listUsers() without page only returns the first batch. */
export async function findSupabaseAuthUserByEmail(
  email: string,
): Promise<SupabaseAuthUser | null> {
  const normalized = normalizeEmailForLookup(email);
  if (!normalized) {
    return null;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return null;
  }

  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(`Supabase listUsers failed: ${error.message}`);
    }
    const users = data?.users ?? [];
    const match = users.find(
      (u) => normalizeEmailForLookup(u.email) === normalized,
    );
    if (match) {
      return match;
    }
    if (users.length < 200) {
      break;
    }
  }
  return null;
}

export async function deleteSupabaseAuthUserByEmail(email: string): Promise<boolean> {
  const user = await findSupabaseAuthUserByEmail(email);
  if (!user) {
    return false;
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error('Supabase admin client not configured');
  }
  const { error } = await supabase.auth.admin.deleteUser(user.id);
  if (error) {
    throw new Error(`Supabase deleteUser failed: ${error.message}`);
  }
  return true;
}
