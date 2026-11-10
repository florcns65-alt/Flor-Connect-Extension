import { createClient, type SupabaseClient, type SupportedStorage } from "@supabase/supabase-js";
import { fetchWithTimeoutAndRetry } from "../api/fetch";

export interface FlorClientConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
}

export function supabaseAuthOptions(storage: SupportedStorage) {
  return {
    flowType: "pkce" as const,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage,
  };
}

export function createFlorClient(config: FlorClientConfig, storage: SupportedStorage): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: supabaseAuthOptions(storage),
    global: { fetch: fetchWithTimeoutAndRetry },
  });
}
