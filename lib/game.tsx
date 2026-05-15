import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, AppState, type AppStateStatus } from 'react-native';

import { useAuth } from './auth';
import { supabase, supabaseConfigured } from './supabase';
import { type Locale, useI18n } from './i18n';

/** מינימום זמן מחוץ לאפליקציה לפני שמציגים הודעת חזרה */
const WELCOME_BACK_MIN_ABSENCE_SEC = 5;

function lastBgAtStorageKey(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return `@estate-empire/last-bg-at/${userId}`;
}

/** יתרת התחלה רק למסלול ללא סופבייס / שגיאת טעינה; משתמש חדש מקבל 10k מטריגר ב-Supabase. */
export const STARTING_BALANCE = 10_000;

/** עיכוב סימולציית "חיפוש שוכר" לפני מתן הכנסה (שניות לשכב דמו). */
export const VACANCY_SECONDS = 48;

const BROKER_FEE_RATE = 0.07;
const MS_PER_YEAR = 365.25 * 86400 * 1000;
const MAX_RESALE_PRICE_MULT = 4;
const RENOV_INCOME_MULT_PER_TIER = 0.11;
const RENOV_RESALE_MULT_PER_TIER = 0.07;
const RENOV_COST_FRAC_BASE = 0.065;
export const MAX_RENOVATION_TIER = 3;

/** שיעור הערכה שנתית לפי סוג נכס (נדל״ן) */
export const APR_BY_SLUG: Record<string, number> = {
  'small-shop': 0.034,
  'office-building': 0.046,
  'luxury-villa': 0.058,
};

export type CatalogItem = {
  slug: string;
  name: string;
  description: string;
  price: number;
  incomePerSecond: number;
};

export const CATALOG: CatalogItem[] = [
  {
    slug: 'small-shop',
    name: 'Small Shop',
    description: 'נכס קטן עם תזרים יציב — נקודת פתיחה מצוינת לאימפריה.',
    price: 5000,
    incomePerSecond: 2,
  },
  {
    slug: 'office-building',
    name: 'Office Building',
    description: 'מגדל משרדים — דמי שכירות גבוהים יותר לכל שנייה במשחק.',
    price: 25000,
    incomePerSecond: 12,
  },
  {
    slug: 'luxury-villa',
    name: 'Luxury Villa',
    description: 'ווילה פרימיום לאליטה הכלכלית של Estate Empire.',
    price: 100000,
    incomePerSecond: 55,
  },
];

export type HoldingMode = 'idle' | 'vacancy' | 'leasing';

export type Holding = {
  id: string;
  slug: string;
  acquiredAtMs: number;
  mode: HoldingMode;
  vacancyEndsAtMs: number | null;
  renovationTier: number;
};

/** נגזר מתיק Holdings (מספר יחידות לכל slug, כולל idle). */
export function deriveQuantitiesFromHoldings(holdings: Holding[]): Record<string, number> {
  const q: Record<string, number> = {};
  for (const h of holdings) q[h.slug] = (q[h.slug] ?? 0) + 1;
  return q;
}

/** האם ההחזקה מייצרת הכנסה בשעה nowMs — כולל מעבר אוטומטי מתוקף vacancy. */
export function holdingProducesIncome(h: Holding, nowMs: number): boolean {
  if (h.mode === 'leasing') return true;
  if (h.mode === 'vacancy') {
    if (h.vacancyEndsAtMs == null) return false;
    return nowMs >= h.vacancyEndsAtMs;
  }
  return false;
}

export function computeIncomeFromHoldings(holdings: Holding[], nowMs: number): number {
  let sum = 0;
  for (const h of holdings) {
    if (!holdingProducesIncome(h, nowMs)) continue;
    const item = CATALOG.find((c) => c.slug === h.slug);
    if (!item) continue;
    const mult = 1 + RENOV_INCOME_MULT_PER_TIER * h.renovationTier;
    sum += item.incomePerSecond * mult;
  }
  return sum;
}

/** @deprecated השתמש ב-computeIncomeFromHoldings; נשמר לקוד ישן */
export function computeIncomeRate(quantities: Record<string, number>): number {
  return CATALOG.reduce((sum, item) => sum + (quantities[item.slug] ?? 0) * item.incomePerSecond, 0);
}

export function estimateResaleGross(h: Holding, nowMs: number): number {
  const item = CATALOG.find((c) => c.slug === h.slug);
  if (!item) return 0;
  const yearsHeld = Math.max(0, (nowMs - h.acquiredAtMs) / MS_PER_YEAR);
  const cappedYears = Math.min(yearsHeld, 42);
  const apr = APR_BY_SLUG[item.slug] ?? 0.045;
  let price = item.price * (1 + apr * cappedYears);
  price *= 1 + RENOV_RESALE_MULT_PER_TIER * h.renovationTier;
  price = Math.min(price, item.price * MAX_RESALE_PRICE_MULT);
  return Math.max(1, Math.floor(price));
}

export function resaleNetFromGross(gross: number): { fee: number; net: number } {
  const fee = Math.round(gross * BROKER_FEE_RATE);
  return { fee: Math.max(0, fee), net: Math.max(0, gross - fee) };
}

export function renovationCostForNextTier(h: Holding): number | null {
  if (h.renovationTier >= MAX_RENOVATION_TIER) return null;
  const item = CATALOG.find((c) => c.slug === h.slug);
  if (!item) return null;
  return Math.round(item.price * RENOV_COST_FRAC_BASE * (h.renovationTier + 1));
}

function parseHoldingMode(m: string): HoldingMode {
  if (m === 'idle' || m === 'vacancy' || m === 'leasing') return m;
  return 'idle';
}

function applyVacancyTransitions(holdings: Holding[], nowMs: number): { next: Holding[]; changed: boolean } {
  let changed = false;
  const next = holdings.map((h) => {
    if (h.mode === 'vacancy' && h.vacancyEndsAtMs != null && nowMs >= h.vacancyEndsAtMs) {
      changed = true;
      return { ...h, mode: 'leasing' as const, vacancyEndsAtMs: null };
    }
    return h;
  });
  return { next, changed };
}

function formatAwayDuration(seconds: number, locale: Locale): string {
  if (seconds >= 3600) {
    const h = Math.max(1, Math.round(seconds / 3600));
    return locale === 'he' ? `כ-${h} שעות` : `~${h} hr`;
  }
  if (seconds >= 90) {
    const m = Math.max(1, Math.round(seconds / 60));
    return locale === 'he' ? `כ-${m} דקות` : `~${m} min`;
  }
  const s = Math.max(1, Math.round(seconds));
  return locale === 'he' ? `${s} שניות` : `${s} sec`;
}

export type GameContextValue = {
  catalog: CatalogItem[];
  holdings: Holding[];
  /** סה״כ יחידות לפי slug (לתצוגה / שוק). */
  ownedQuantities: Record<string, number>;
  virtualBalance: number;
  premiumGold: number;
  incomePerSecond: number;
  buyProperty: (slug: string) => void;
  startLease: (holdingId: string) => Promise<void>;
  stopLease: (holdingId: string) => Promise<void>;
  leaseAllIdleOfSlug: (slug: string) => Promise<void>;
  sellHolding: (holdingId: string) => Promise<void>;
  renovateHolding: (holdingId: string) => Promise<void>;
  resetGame: () => Promise<void>;
  hydrated: boolean;
};

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const { t, locale } = useI18n();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [hydrated, setHydrated] = useState(!supabaseConfigured);
  const [balanceSynced, setBalanceSynced] = useState(() => (supabaseConfigured ? 0 : STARTING_BALANCE));
  const [syncedAtMs, setSyncedAtMs] = useState(() => Date.now());
  const [premiumGold, setPremiumGold] = useState(0);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [wallNow, setWallNow] = useState(() => Date.now());

  const slugToIdRef = useRef<Record<string, string>>({});
  const balanceSyncedRef = useRef(balanceSynced);
  const syncedAtMsRef = useRef(syncedAtMs);
  const latestPremiumRef = useRef(premiumGold);
  const latestHoldingsRef = useRef(holdings);
  const latestBalanceRef = useRef(0);
  const persistInFlightRef = useRef(false);
  const lastInactiveAtMsRef = useRef<number | null>(null);
  const lastWelcomePromptAtMsRef = useRef(0);

  useEffect(() => {
    balanceSyncedRef.current = balanceSynced;
  }, [balanceSynced]);
  useEffect(() => {
    syncedAtMsRef.current = syncedAtMs;
  }, [syncedAtMs]);
  useEffect(() => {
    latestPremiumRef.current = premiumGold;
  }, [premiumGold]);
  useEffect(() => {
    latestHoldingsRef.current = holdings;
  }, [holdings]);

  const ownedQuantities = useMemo(() => deriveQuantitiesFromHoldings(holdings), [holdings]);

  const incomePerSecond = useMemo(
    () => computeIncomeFromHoldings(holdings, wallNow),
    [holdings, wallNow],
  );

  const virtualBalance = useMemo(() => {
    return balanceSynced + incomePerSecond * Math.max(0, (wallNow - syncedAtMs) / 1000);
  }, [balanceSynced, incomePerSecond, syncedAtMs, wallNow]);

  useEffect(() => {
    latestBalanceRef.current = virtualBalance;
  }, [virtualBalance]);

  const persistSnapshot = useCallback(async () => {
    if (!userId || !supabaseConfigured || persistInFlightRef.current) return;
    persistInFlightRef.current = true;
    try {
      const now = Date.now();
      const rate = computeIncomeFromHoldings(latestHoldingsRef.current, now);
      const live =
        balanceSyncedRef.current + rate * Math.max(0, (now - syncedAtMsRef.current) / 1000);
      const pg = latestPremiumRef.current;

      const { error: profileErr } = await supabase
        .from('profiles')
        .update({
          virtual_balance: live,
          premium_gold: Math.round(pg),
          last_passive_accrual_at: new Date(now).toISOString(),
        })
        .eq('id', userId);

      if (profileErr && __DEV__) {
        console.warn('[game] persist profile failed:', profileErr.message);
      }

      balanceSyncedRef.current = live;
      syncedAtMsRef.current = now;
      setBalanceSynced(live);
      setSyncedAtMs(now);
    } finally {
      persistInFlightRef.current = false;
    }
  }, [userId]);

  const showWelcomeBackForAbsence = useCallback(
    (elapsedSec: number) => {
      if (!Number.isFinite(elapsedSec) || elapsedSec < WELCOME_BACK_MIN_ABSENCE_SEC) return;

      const nowWall = Date.now();
      if (nowWall - lastWelcomePromptAtMsRef.current < 1800) return;

      const rate = computeIncomeFromHoldings(latestHoldingsRef.current, nowWall);
      const earned = Math.max(0, rate * elapsedSec);
      const amountStr = formatCoins(Math.floor(earned));
      const durationLabel = formatAwayDuration(elapsedSec, locale);
      const extraTip = rate > 0 ? '' : t('game.welcomeBackTipNoPassive');

      const body = t('game.welcomeBackBody')
        .replace('{{duration}}', durationLabel)
        .replace('{{amount}}', amountStr)
        .replace('{{extraTip}}', extraTip);

      lastWelcomePromptAtMsRef.current = nowWall;
      Alert.alert(t('game.welcomeBackTitle'), body, [{ text: t('game.welcomeBackOk') }]);
    },
    [locale, t],
  );

  /** מעבר vacancy → leasing + עדכון DB */
  useEffect(() => {
    const now = wallNow;
    const { next, changed } = applyVacancyTransitions(holdings, now);
    if (!changed) return;

    setHoldings(next);
    latestHoldingsRef.current = next;

    if (!supabaseConfigured || !userId) return;

    void (async () => {
      const prev = holdings;
      const done = prev.filter(
        (h) => h.mode === 'vacancy' && h.vacancyEndsAtMs != null && now >= h.vacancyEndsAtMs,
      );
      for (const h of done) {
        const { error } = await supabase
          .from('user_holdings')
          .update({ mode: 'leasing', vacancy_until: null })
          .eq('id', h.id)
          .eq('user_id', userId);
        if (error && __DEV__) console.warn('[game] vacancy->leasing:', error.message);
      }
    })();
  }, [holdings, wallNow, userId]);

  /** טעינה */
  useEffect(() => {
    if (!supabaseConfigured || !userId) {
      const now = Date.now();
      setHydrated(true);
      balanceSyncedRef.current = STARTING_BALANCE;
      syncedAtMsRef.current = now;
      setBalanceSynced(STARTING_BALANCE);
      setSyncedAtMs(now);
      setPremiumGold(0);
      setHoldings([]);
      setWallNow(now);
      return;
    }

    let cancelled = false;

    const hydrate = async () => {
      setHydrated(false);

      const { data: types, error: typesErr } = await supabase.from('property_types').select('id, slug');
      if (cancelled) return;

      if (typesErr || !types?.length) {
        if (__DEV__) console.warn('[game] load property_types:', typesErr?.message ?? 'empty');
        const now = Date.now();
        balanceSyncedRef.current = STARTING_BALANCE;
        syncedAtMsRef.current = now;
        setBalanceSynced(STARTING_BALANCE);
        setSyncedAtMs(now);
        setPremiumGold(0);
        setHoldings([]);
        slugToIdRef.current = {};
        setWallNow(now);
        setHydrated(true);
        return;
      }

      const slugToId: Record<string, string> = {};
      for (const row of types) {
        if (row.slug && row.id) slugToId[row.slug] = row.id;
      }
      slugToIdRef.current = slugToId;

      const idToSlug = Object.fromEntries(
        Object.entries(slugToId).map(([slug, id]) => [id, slug]),
      );

      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select(
          'virtual_balance, premium_gold, last_passive_accrual_at, updated_at, created_at',
        )
        .eq('id', userId)
        .maybeSingle();

      if (cancelled) return;

      if (profileErr || !profile) {
        const now = Date.now();
        balanceSyncedRef.current = STARTING_BALANCE;
        syncedAtMsRef.current = now;
        setBalanceSynced(STARTING_BALANCE);
        setSyncedAtMs(now);
        setPremiumGold(0);
        setHoldings([]);
        setWallNow(now);
        setHydrated(true);
        return;
      }

      const { data: holdingRows, error: hErr } = await supabase
        .from('user_holdings')
        .select('id, property_type_id, acquired_at, mode, vacancy_until, renovation_tier')
        .eq('user_id', userId);

      if (cancelled) return;

      if (hErr && __DEV__) {
        console.warn('[game] user_holdings (הרץ מיגרציה 004 אם החסר):', hErr.message);
      }

      const parsed: Holding[] = [];
      for (const row of holdingRows ?? []) {
        const slug = idToSlug[row.property_type_id as string];
        if (!slug) continue;
        const vac = row.vacancy_until ? new Date(row.vacancy_until as string).getTime() : null;
        parsed.push({
          id: row.id as string,
          slug,
          acquiredAtMs: new Date(row.acquired_at as string).getTime(),
          mode: parseHoldingMode(row.mode as string),
          vacancyEndsAtMs: Number.isFinite(vac ?? NaN) ? vac : null,
          renovationTier: Math.min(
            MAX_RENOVATION_TIER,
            Math.max(0, Number(row.renovation_tier ?? 0)),
          ),
        });
      }

      const balance = Number(profile.virtual_balance ?? 0);
      const pg = Number(profile.premium_gold ?? 0);

      const lastPassiveIso =
        (profile as { last_passive_accrual_at?: string }).last_passive_accrual_at ??
        profile.updated_at ??
        profile.created_at;

      let anchorMs = lastPassiveIso ? new Date(lastPassiveIso).getTime() : Date.now();
      if (!Number.isFinite(anchorMs)) anchorMs = Date.now();

      const now = Date.now();
      balanceSyncedRef.current = balance;
      syncedAtMsRef.current = anchorMs;
      setBalanceSynced(balance);
      setSyncedAtMs(anchorMs);
      setPremiumGold(Number.isFinite(pg) ? Math.round(pg) : 0);

      let nextHoldings = parsed;
      const { next: transitioned, changed } = applyVacancyTransitions(parsed, now);
      if (changed) nextHoldings = transitioned;

      setHoldings(nextHoldings);
      latestHoldingsRef.current = nextHoldings;
      setWallNow(now);
      setHydrated(true);

      if (changed && userId && supabaseConfigured) {
        for (const h of parsed) {
          if (h.mode === 'vacancy' && h.vacancyEndsAtMs != null && now >= h.vacancyEndsAtMs) {
            void supabase
              .from('user_holdings')
              .update({ mode: 'leasing', vacancy_until: null })
              .eq('id', h.id)
              .eq('user_id', userId);
          }
        }
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const id = setInterval(() => setWallNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!userId || !supabaseConfigured || !hydrated) return;
    const id = setInterval(() => void persistSnapshot(), 12_000);
    return () => clearInterval(id);
  }, [userId, hydrated, persistSnapshot]);

  useEffect(() => {
    if (!hydrated) return;

    let welcomeTimer: ReturnType<typeof setTimeout> | undefined;

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        if (welcomeTimer) clearTimeout(welcomeTimer);
        welcomeTimer = undefined;
        const t0 = Date.now();
        lastInactiveAtMsRef.current = t0;
        const bgKey = lastBgAtStorageKey(userId);
        if (bgKey) void AsyncStorage.setItem(bgKey, String(t0));
        void persistSnapshot();
        return;
      }

      if (next !== 'active') return;

      setWallNow(Date.now());

      const goneAt = lastInactiveAtMsRef.current;
      lastInactiveAtMsRef.current = null;

      if (goneAt == null) return;

      const bgKey = lastBgAtStorageKey(userId);
      if (bgKey) void AsyncStorage.removeItem(bgKey);

      const elapsedSec = (Date.now() - goneAt) / 1000;
      if (elapsedSec < WELCOME_BACK_MIN_ABSENCE_SEC) return;

      if (welcomeTimer) clearTimeout(welcomeTimer);
      welcomeTimer = setTimeout(() => {
        showWelcomeBackForAbsence(elapsedSec);
      }, 380);
    });

    return () => {
      if (welcomeTimer) clearTimeout(welcomeTimer);
      sub.remove();
    };
  }, [hydrated, persistSnapshot, showWelcomeBackForAbsence, userId]);

  useEffect(() => {
    if (!hydrated) return;

    const bgKey = lastBgAtStorageKey(userId);
    if (!bgKey) return;

    let cancelled = false;
    let coldTimer: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      const raw = await AsyncStorage.getItem(bgKey);
      if (cancelled || raw == null) return;

      const goneAt = Number(raw);
      if (!Number.isFinite(goneAt)) {
        await AsyncStorage.removeItem(bgKey);
        return;
      }

      const elapsedSec = (Date.now() - goneAt) / 1000;
      if (elapsedSec < WELCOME_BACK_MIN_ABSENCE_SEC) return;

      await AsyncStorage.removeItem(bgKey);

      coldTimer = setTimeout(() => {
        if (!cancelled) showWelcomeBackForAbsence(elapsedSec);
      }, 450);
    })();

    return () => {
      cancelled = true;
      if (coldTimer) clearTimeout(coldTimer);
    };
  }, [hydrated, showWelcomeBackForAbsence, userId]);

  const pushHoldingsAndRefs = useCallback((next: Holding[]) => {
    latestHoldingsRef.current = next;
    setHoldings(next);
  }, []);

  const resetGame = useCallback(async () => {
    const now = Date.now();
    const isoNow = new Date(now).toISOString();

    if (supabaseConfigured && userId) {
      await supabase.from('user_holdings').delete().eq('user_id', userId);
      await supabase.from('user_properties').delete().eq('user_id', userId);

      const { error: upErr } = await supabase
        .from('profiles')
        .update({
          virtual_balance: STARTING_BALANCE,
          premium_gold: 0,
          last_passive_accrual_at: isoNow,
        })
        .eq('id', userId);
      if (upErr) {
        if (__DEV__) console.warn('[game] reset profile:', upErr.message);
        Alert.alert(t('profile.resetErrorTitle'), upErr.message || t('profile.resetErrorBody'));
        return;
      }
    }

    balanceSyncedRef.current = STARTING_BALANCE;
    syncedAtMsRef.current = now;
    latestHoldingsRef.current = [];
    latestPremiumRef.current = 0;

    setBalanceSynced(STARTING_BALANCE);
    setSyncedAtMs(now);
    pushHoldingsAndRefs([]);
    setPremiumGold(0);
    setWallNow(now);

    const bgKey = lastBgAtStorageKey(userId);
    if (bgKey) await AsyncStorage.removeItem(bgKey);
  }, [pushHoldingsAndRefs, t, userId]);

  const buyProperty = useCallback(
    (slug: string) => {
      const item = CATALOG.find((p) => p.slug === slug);
      if (!item) return;

      const now = Date.now();
      const rateBefore = computeIncomeFromHoldings(latestHoldingsRef.current, now);
      const cur = balanceSyncedRef.current + rateBefore * Math.max(0, (now - syncedAtMsRef.current) / 1000);

      if (cur < item.price) {
        Alert.alert(t('game.insufficientTitle'), t('game.insufficientBody'));
        return;
      }

      const nextBalance = cur - item.price;
      const hid = Crypto.randomUUID();
      const nue: Holding = {
        id: hid,
        slug: item.slug,
        acquiredAtMs: now,
        mode: 'idle',
        vacancyEndsAtMs: null,
        renovationTier: 0,
      };

      balanceSyncedRef.current = nextBalance;
      syncedAtMsRef.current = now;
      pushHoldingsAndRefs([...latestHoldingsRef.current, nue]);

      setBalanceSynced(nextBalance);
      setSyncedAtMs(now);
      setWallNow(now);

      void (async () => {
        await persistSnapshot();
        if (!supabaseConfigured || !userId) return;
        const pt = slugToIdRef.current[item.slug];
        if (!pt) return;
        const { error } = await supabase.from('user_holdings').insert({
          id: hid,
          user_id: userId,
          property_type_id: pt,
          acquired_at: new Date(now).toISOString(),
          mode: 'idle',
          vacancy_until: null,
          renovation_tier: 0,
        });
        if (error && __DEV__) console.warn('[game] insert holding:', error.message);
      })();
    },
    [persistSnapshot, pushHoldingsAndRefs, t, userId],
  );

  const startLease = useCallback(
    async (holdingId: string) => {
      const idx = holdings.findIndex((h) => h.id === holdingId);
      if (idx < 0) return;
      const h = holdings[idx];
      if (h.mode !== 'idle') return;

      const now = Date.now();
      const until = now + VACANCY_SECONDS * 1000;
      const replaced = { ...h, mode: 'vacancy' as const, vacancyEndsAtMs: until };
      const next = holdings.slice();
      next[idx] = replaced;
      pushHoldingsAndRefs(next);

      if (!supabaseConfigured || !userId) return;
      const { error } = await supabase
        .from('user_holdings')
        .update({
          mode: 'vacancy',
          vacancy_until: new Date(until).toISOString(),
        })
        .eq('id', holdingId)
        .eq('user_id', userId);
      if (error && __DEV__) console.warn('[game] startLease:', error.message);
    },
    [holdings, pushHoldingsAndRefs, userId],
  );

  const stopLease = useCallback(
    async (holdingId: string) => {
      const idx = holdings.findIndex((x) => x.id === holdingId);
      if (idx < 0) return;
      const h = holdings[idx];
      if (h.mode === 'idle') return;

      const replaced: Holding = {
        ...h,
        mode: 'idle',
        vacancyEndsAtMs: null,
      };
      const next = holdings.slice();
      next[idx] = replaced;
      pushHoldingsAndRefs(next);

      if (!supabaseConfigured || !userId) return;
      const { error } = await supabase
        .from('user_holdings')
        .update({
          mode: 'idle',
          vacancy_until: null,
        })
        .eq('id', holdingId)
        .eq('user_id', userId);
      if (error && __DEV__) console.warn('[game] stopLease:', error.message);
    },
    [holdings, pushHoldingsAndRefs, userId],
  );

  const leaseAllIdleOfSlug = useCallback(
    async (slug: string) => {
      const targets = holdings.filter((h) => h.slug === slug && h.mode === 'idle');
      if (targets.length === 0) return;
      let next = holdings.slice();
      const now = Date.now();
      const until = now + VACANCY_SECONDS * 1000;
      for (const h of targets) {
        const i = next.findIndex((x) => x.id === h.id);
        if (i >= 0) {
          next[i] = {
            ...next[i],
            mode: 'vacancy',
            vacancyEndsAtMs: until,
          };
        }
      }
      pushHoldingsAndRefs(next);

      if (!supabaseConfigured || !userId) return;
      const iso = new Date(until).toISOString();
      for (const h of targets) {
        await supabase
          .from('user_holdings')
          .update({ mode: 'vacancy', vacancy_until: iso })
          .eq('id', h.id)
          .eq('user_id', userId);
      }
    },
    [holdings, pushHoldingsAndRefs, userId],
  );

  const sellHolding = useCallback(
    async (holdingId: string) => {
      const h = holdings.find((x) => x.id === holdingId);
      if (!h) return;

      const now = Date.now();
      const rateAll = computeIncomeFromHoldings(holdings, now);
      const currentBal =
        balanceSyncedRef.current +
        rateAll * Math.max(0, (now - syncedAtMsRef.current) / 1000);

      const gross = estimateResaleGross(h, now);
      const { net } = resaleNetFromGross(gross);

      const holdingsMinus = holdings.filter((x) => x.id !== holdingId);
      const snapshotBal = currentBal + net;
      balanceSyncedRef.current = snapshotBal;
      syncedAtMsRef.current = now;

      pushHoldingsAndRefs(holdingsMinus);

      setBalanceSynced(snapshotBal);
      setSyncedAtMs(now);
      setWallNow(now);

      await persistSnapshot();

      if (!supabaseConfigured || !userId) return;
      const { error } = await supabase
        .from('user_holdings')
        .delete()
        .eq('id', holdingId)
        .eq('user_id', userId);
      if (error && __DEV__) console.warn('[game] sell delete:', error.message);
    },
    [holdings, persistSnapshot, pushHoldingsAndRefs, userId],
  );

  const renovateHolding = useCallback(
    async (holdingId: string) => {
      const idx = holdings.findIndex((x) => x.id === holdingId);
      if (idx < 0) return;
      const h = holdings[idx];
      const cost = renovationCostForNextTier(h);
      if (cost == null) {
        Alert.alert(t('game.renovateMaxTitle'), t('game.renovateMaxBody'));
        return;
      }

      const now = Date.now();
      const rateAll = computeIncomeFromHoldings(holdings, now);
      const cur =
        balanceSyncedRef.current +
        rateAll * Math.max(0, (now - syncedAtMsRef.current) / 1000);

      if (cur < cost) {
        Alert.alert(t('game.insufficientTitle'), t('game.insufficientBody'));
        return;
      }

      const snapshotBal = cur - cost;
      const replaced: Holding = {
        ...h,
        renovationTier: Math.min(MAX_RENOVATION_TIER, h.renovationTier + 1),
      };

      balanceSyncedRef.current = snapshotBal;
      syncedAtMsRef.current = now;
      const next = holdings.slice();
      next[idx] = replaced;
      pushHoldingsAndRefs(next);

      setBalanceSynced(snapshotBal);
      setSyncedAtMs(now);
      setWallNow(now);

      await persistSnapshot();

      if (!supabaseConfigured || !userId) return;
      const { error } = await supabase
        .from('user_holdings')
        .update({ renovation_tier: replaced.renovationTier })
        .eq('id', holdingId)
        .eq('user_id', userId);
      if (error && __DEV__) console.warn('[game] renovate:', error.message);
    },
    [holdings, persistSnapshot, pushHoldingsAndRefs, t, userId],
  );

  const value = useMemo<GameContextValue>(
    () => ({
      catalog: CATALOG,
      holdings,
      ownedQuantities,
      virtualBalance,
      premiumGold,
      incomePerSecond,
      buyProperty,
      startLease,
      stopLease,
      leaseAllIdleOfSlug,
      sellHolding,
      renovateHolding,
      resetGame,
      hydrated,
    }),
    [
      buyProperty,
      holdings,
      hydrated,
      incomePerSecond,
      leaseAllIdleOfSlug,
      ownedQuantities,
      premiumGold,
      renovateHolding,
      resetGame,
      sellHolding,
      startLease,
      stopLease,
      virtualBalance,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}

export function formatCoins(value: number) {
  const n = Math.round(Number.isFinite(value) ? value : 0);
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function formatCoinsCompact(value: number): string {
  const n = Math.round(Number.isFinite(value) ? value : 0);
  try {
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return formatCoins(n);
  }
}
