import * as AuthSession from 'expo-auth-session';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import { supabase, supabaseConfigured } from './supabase';

WebBrowser.maybeCompleteAuthSession();

/** Same shape Expo docs use for Expo Go (`exp://…/--/auth/callback`) vs dev builds (`estate-empire://…`). */
function getOAuthRedirectUri(): string {
  return AuthSession.makeRedirectUri({
    scheme: 'estate-empire',
    path: 'auth/callback',
  });
}

function looksLikeOAuthReturn(url: string): boolean {
  return (
    url.includes('/auth/callback') ||
    url.includes('access_token=') ||
    url.includes('refresh_token=') ||
    /[?&#]code=/.test(url)
  );
}

function parseAuthCallbackUrl(rawUrl: string): {
  accessToken: string | null;
  refreshToken: string | null;
  code: string | null;
  oauthError: string | null;
} {
  try {
    const hashIndex = rawUrl.indexOf('#');
    const queryIndex = rawUrl.indexOf('?');
    const fragment = hashIndex >= 0 ? rawUrl.slice(hashIndex + 1) : '';
    const queryEnd = hashIndex >= 0 ? hashIndex : rawUrl.length;
    const search = queryIndex >= 0 ? rawUrl.slice(queryIndex + 1, queryEnd) : '';
    const fromFragment = new URLSearchParams(fragment);
    const fromQuery = new URLSearchParams(search);
    const get = (k: string) => fromFragment.get(k) ?? fromQuery.get(k);

    const oauthError = get('error');
    const oauthErrorDesc = get('error_description');

    return {
      accessToken: get('access_token'),
      refreshToken: get('refresh_token'),
      code: get('code'),
      oauthError: oauthError ? oauthErrorDesc ?? oauthError : null,
    };
  } catch {
    return {
      accessToken: null,
      refreshToken: null,
      code: null,
      oauthError: null,
    };
  }
}

async function finalizeOAuthFromRedirectUrl(url: string) {
  const { accessToken, refreshToken, code, oauthError } = parseAuthCallbackUrl(url);
  if (oauthError) {
    throw new Error(oauthError);
  }
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return;
  }
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }
  throw new Error('Missing tokens or authorization code in redirect URL.');
}

async function dismissAuthBrowserSafely() {
  try {
    await WebBrowser.dismissBrowser();
  } catch {
    /* already closed */
  }
}

/** After Safari hands off to Expo Go, session sometimes appears slightly later — short poll. */
async function waitForSession(maxAttempts = 24, delayMs = 250): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    const { data } = await supabase.auth.getSession();
    if (data.session) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

type AuthContextValue = {
  session: Session | null;
  initialized: boolean;
  oauthLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const handlingOAuthUrlRef = useRef(false);

  useEffect(() => {
    if (!supabaseConfigured) {
      setInitialized(true);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitialized(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return;

    const handleUrl = async (rawUrl: string) => {
      if (!rawUrl || !looksLikeOAuthReturn(rawUrl) || handlingOAuthUrlRef.current) return;
      handlingOAuthUrlRef.current = true;
      try {
        await finalizeOAuthFromRedirectUrl(rawUrl);
        await dismissAuthBrowserSafely();
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (__DEV__) console.warn('[OAuth] Deep link finalize failed:', message);
      } finally {
        handlingOAuthUrlRef.current = false;
      }
    };

    const sub = Linking.addEventListener('url', ({ url }) => {
      void handleUrl(url);
    });

    void Linking.getInitialURL().then((url) => {
      if (url) void handleUrl(url);
    });

    return () => sub.remove();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!supabaseConfigured) {
      Alert.alert(
        'Supabase required',
        'Add EXPO_PUBLIC_SUPABASE_URL and your public API key as EXPO_PUBLIC_SUPABASE_ANON_KEY or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (same value as Publishable key in Supabase), then restart Metro.',
      );
      return;
    }

    setOauthLoading(true);
    try {
      const redirectTo = getOAuthRedirectUri();
      if (__DEV__) {
        console.warn('[OAuth] Add this exact Redirect URL in Supabase → Authentication → URL Configuration:', redirectTo);
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });

      if (error) {
        Alert.alert('Sign-in failed', error.message);
        return;
      }

      const url = data.url;
      if (!url) {
        Alert.alert('Sign-in', 'No OAuth URL returned from Supabase.');
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(url, redirectTo, { showInRecents: true });

      if (result.type === 'success' && result.url) {
        try {
          await finalizeOAuthFromRedirectUrl(result.url);
          await dismissAuthBrowserSafely();
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Could not complete sign-in.';
          Alert.alert('Sign-in', message);
        }
      } else {
        /** `cancel` / `dismiss` — iOS often opens Expo Go via deep link instead of returning success here. */
        const ok = await waitForSession();
        if (!ok) {
          Alert.alert(
            'Sign-in did not finish',
            `Could not restore the session after the browser closed.\n\nIn Supabase, add this Redirect URL exactly:\n${redirectTo}\n\nIf your Wi‑Fi IP changed, copy the new URL from the Metro log after tapping Sign in.`,
          );
        }
      }
    } finally {
      setOauthLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({
      session,
      initialized,
      oauthLoading,
      signInWithGoogle,
      signOut,
    }),
    [initialized, oauthLoading, session, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
