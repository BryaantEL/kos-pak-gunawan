import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Klien Supabase khusus server. Service role key tidak pernah dikirim ke browser.
 * Saat Supabase Auth ditambahkan, bagian ini tetap menjadi satu-satunya jalur data.
 */
export function getServerSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY belum diatur di .env.local');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function unwrap<T>(res: { data: T[] | null; error: { message: string } | null }): T[] {
  if (res.error) throw new Error(res.error.message);
  return res.data ?? [];
}
