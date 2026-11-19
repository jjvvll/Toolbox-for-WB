// The Supabase client for server code only (route handlers). It uses the secret
// service-role key, which must never reach the browser: this file is only imported by
// files under app/api.

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** The server's Supabase client, or null when the env vars aren't set. */
export function supabaseServer(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
