import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';

type Extra = {
  supabaseUrl?: string;
  supabasePublishableKey?: string;
};

function readExtra(): Extra {
  return (Constants.expoConfig?.extra ?? {}) as Extra;
}

/** Dashboard may label this "anon" or "publishable" — same public client key. */
function resolveSupabaseCredentials() {
  const extra = readExtra();
  const supabaseUrl =
    process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl ?? '';
  const supabaseAnonKey =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    extra.supabasePublishableKey ??
    '';
  return { supabaseUrl, supabaseAnonKey };
}

const { supabaseUrl, supabaseAnonKey } = resolveSupabaseCredentials();

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

function createSafeClient() {
  if (!supabaseConfigured) {
    return createClient('https://placeholder.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.invalid', {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

export const supabase = createSafeClient();
