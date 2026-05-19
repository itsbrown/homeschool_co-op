import { createClient, type User as SupabaseAuthUser } from '@supabase/supabase-js';
import type { AuthError } from '@supabase/supabase-js';

export function getSupabaseAdminClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Paginated lookup — listUsers() without paging only returns the first page. */
export async function findAuthUserByEmail(
  email: string,
): Promise<SupabaseAuthUser | null> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    return null;
  }

  const normalized = email.trim().toLowerCase();
  const perPage = 200;

  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw error;
    }

    const match = data.users.find(
      (u) => u.email?.trim().toLowerCase() === normalized,
    );
    if (match) {
      return match;
    }

    if (!data.users.length || data.users.length < perPage) {
      break;
    }
  }

  return null;
}

export function mapSupabaseAuthError(error: AuthError | Error): {
  status: number;
  message: string;
} {
  const code = 'code' in error ? String((error as AuthError).code) : '';
  const msg = error.message || 'Unknown authentication error';
  const lower = msg.toLowerCase();

  if (
    code === 'email_exists' ||
    lower.includes('already registered') ||
    lower.includes('already been registered')
  ) {
    return {
      status: 400,
      message: 'An account with this email already exists. Please sign in instead.',
    };
  }

  if (lower.includes('password') || code === 'weak_password') {
    return {
      status: 400,
      message:
        'Password does not meet security requirements. Use at least 8 characters.',
    };
  }

  if (lower.includes('invalid email') || code === 'email_address_invalid') {
    return {
      status: 400,
      message: 'Please enter a valid email address.',
    };
  }

  return {
    status: 500,
    message: `Failed to create authentication account: ${msg}`,
  };
}

/** Remove a Supabase auth user by email (for orphaned auth after DB-only deletes). */
export async function deleteAuthUserByEmail(email: string): Promise<boolean> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const authUser = await findAuthUserByEmail(email);
  if (!authUser) {
    return false;
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(authUser.id);
  if (error) {
    throw error;
  }

  return true;
}
