import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Locale = 'en' | 'he';

const STORAGE_KEY = '@estate-empire/locale';

type Dict = Record<string, string>;

const en: Dict = {
  'tab.home': 'Home',
  'tab.market': 'Market',
  'tab.premium': 'Premium',
  'tab.profile': 'Profile',
  'tab.a11y.home': 'Home dashboard',
  'tab.a11y.market': 'Property marketplace',
  'tab.a11y.premium': 'Premium store',
  'tab.a11y.profile': 'Account profile',

  'header.brand': 'Estate Empire',
  'header.empireCoins': 'Empire Coins',
  'header.premiumGold': 'Premium Gold',

  'home.heroTitle': 'Empire Coins',
  'home.heroSubtitle': 'Your liquid empire treasury · Earn more by owning premium assets.',
  'home.passiveIncome': 'Passive income',
  'home.perSec': 'EC / sec',
  'home.portfolio': 'Portfolio pulse',
  'home.noHoldingsTitle': 'No holdings yet',
  'home.noHoldingsDesc': 'Open the Market tab to acquire Small Shops, Offices, and Villas.',
  'home.owned': 'Owned',
  'home.output': 'Output',
  'home.mode.idle': 'Vacant · not earning yet',
  'home.mode.vacancy': 'Finding a tenant…',
  'home.mode.leasing': 'Leased · earning',

  'home.portfolioSummary':
    '{{total}} units · leased {{leasing}}, vacant {{idle}}, onboarding {{vacancy}}',
  'home.leaseOne': 'Start lease',
  'home.stopLease': 'Stop leasing',
  'home.leaseAllIdle': 'Lease all vacant',
  'home.vacancyEta': '~{{seconds}} sec until rent starts',
  'home.estSale': 'Est. sale (gross)',
  'home.tierRenov': 'Renovation tier',

  'home.sellConfirmTitle': 'Sell this asset?',
  'home.sellConfirmBody':
    'Roughly {{gross}} EC gross · broker fee {{fee}} EC · {{net}} EC net · removes one unit.',
  'home.sellConfirmOk': 'Sell',

  'home.renovate': 'Renovate',
  'home.renovateFor': '~{{cost}} EC',

  'market.title': 'Property marketplace',
  'market.subtitle':
    'New purchases start vacant — lease from Home to earn. Values appreciate over holding time.',

  'market.yield': 'Yield:',
  'market.perUnit': 'per unit',
  'market.purchase': 'Purchase asset',

  'premium.title': 'Premium store',
  'premium.body':
    'Connect real In-App Purchases later (boost packs, cosmetics, VIP markets). Built on HeroUI Native for a consistent premium look.',

  'profile.account': 'Account',
  'profile.signedInFallback': 'Signed in player',
  'profile.signOut': 'Sign out',
  'profile.language': 'Language',
  'profile.languageHint': 'Choose interface language.',
  'profile.lang.en': 'English',
  'profile.lang.he': 'Hebrew',

  'profile.resetGame': 'Reset game',
  'profile.resetGameHint':
    'Empire Coins return to your starting balance and all owned properties are removed. Signed-in progress is synced to the server.',
  'profile.resetConfirmTitle': 'Reset game progress?',
  'profile.resetConfirmBody':
    'This clears your portfolio and balance (fresh start amount). You cannot undo this.',
  'profile.resetCancel': 'Cancel',
  'profile.resetConfirmOk': 'Reset',
  'profile.resetErrorTitle': 'Reset failed',
  'profile.resetErrorBody': 'Check your connection and try again.',

  'login.secureAccess': 'Secure access',
  'login.tagline': 'Premium real-estate strategy. Sign in to sync your portfolio and empire wealth.',
  'login.welcomeTitle': 'Welcome back',
  'login.welcomeDesc': 'Continue with Google to enter your command center.',
  'login.liveTicker': 'Live ticker',
  'login.liveTickerLines': 'Yield streams · Portfolio sync · Secure vault',
  'login.google': 'Continue with Google',
  'login.envHint':
    'Configure EXPO_PUBLIC_SUPABASE_URL plus EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY (Publishable key from Supabase).',
  'login.footer': 'Protected by Supabase Auth · HeroUI Native interface',

  'game.insufficientTitle': 'Insufficient balance',
  'game.insufficientBody': 'Earn more Empire Coins before purchasing.',
  'game.welcomeBackTitle': 'Welcome back!',
  'game.welcomeBackBody':
    'You were away roughly {{duration}}.\n\nCoins earned while away (estimate): {{amount}} EC.{{extraTip}}',
  'game.welcomeBackTipNoPassive':
    '\n\nOpen the Market to buy properties — they earn Empire Coins even when you’re not playing.',
  'game.welcomeBackOk': 'Nice',

  'game.renovateMaxTitle': 'Max renovation',
  'game.renovateMaxBody': 'Already at tier 3.',

  'loading.session': 'Loading session',
};

const he: Dict = {
  'tab.home': 'בית',
  'tab.market': 'שוק',
  'tab.premium': 'פרימיום',
  'tab.profile': 'פרופיל',
  'tab.a11y.home': 'מסך הבית',
  'tab.a11y.market': 'שוק הנכסים',
  'tab.a11y.premium': 'חנות פרימיום',
  'tab.a11y.profile': 'פרופיל משתמש',

  'header.brand': 'Estate Empire',
  'header.empireCoins': 'מטבעות אימפריה',
  'header.premiumGold': 'זהב פרימיום',

  'home.heroTitle': 'מטבעות אימפריה',
  'home.heroSubtitle': 'אוצר האימפריה שלך · הרוויח יותר בעזרת נכסים פרימיום.',
  'home.passiveIncome': 'הכנסה פסיבית',
  'home.perSec': 'מ״ט לשנייה',
  'home.portfolio': 'פעימות תיק',
  'home.noHoldingsTitle': 'עדיין אין החזקות',
  'home.noHoldingsDesc': 'פתח את טאב השוק כדי לרכוש חנויות, משרדים וווילות.',
  'home.owned': 'בבעלות',
  'home.output': 'תפוקה',
  'home.mode.idle': 'ריק · עדיין לא מוכר בהשכרה',
  'home.mode.vacancy': 'מחפשים שוכר…',
  'home.mode.leasing': 'מושכר · יוצא הכנסה',

  'home.portfolioSummary':
    '{{total}} יחידות · מושכר {{leasing}}, ריקים {{idle}}, בתהליכי שוכר {{vacancy}}',
  'home.leaseOne': 'השכר נכס',
  'home.stopLease': 'הפסק השכרה',
  'home.leaseAllIdle': 'השכר כל הריקים',
  'home.vacancyEta': 'עוד ~{{seconds}} שנ׳ להתחלת דמי שכירות',
  'home.estSale': 'שווי מכירה משוער (ברוטו)',
  'home.tierRenov': 'שלב שיפוצים',

  'home.sellConfirmTitle': 'למכור נכס זה?',
  'home.sellConfirmBody':
    'בערך {{gross}} מ״ט ברוטו · תיווך {{fee}} מ״ט · {{net}} מ״ט נטו — יוחסר צ׳וק אחד.',
  'home.sellConfirmOk': 'מכור',

  'home.renovate': 'שדרג נכס',
  'home.renovateFor': 'בערך {{cost}} מ״ט',

  'market.title': 'שוק הנכסים',
  'market.subtitle':
    'רכישה חדשה נכנסת ריקה — להפעלת הכנסה התחל השכרה ממסך הבית. שווי הנכס עולה עם זמן החזקה.',
  'market.yield': 'תשואה:',
  'market.perUnit': 'ליחידה',
  'market.purchase': 'רכוש נכס',

  'premium.title': 'חנות פרימיום',
  'premium.body':
    'כאן תחבר בעתיד רכישות בתוך האפליקציה (חבילות בוסט, קוסמטיקה, שוק VIP). ממשק HeroUI Native לאחידות פרימיום.',

  'profile.account': 'חשבון',
  'profile.signedInFallback': 'משתמש מחובר',
  'profile.signOut': 'התנתק',
  'profile.language': 'שפה',
  'profile.languageHint': 'בחר שפת ממשק.',
  'profile.lang.en': 'English',
  'profile.lang.he': 'עברית',

  'profile.resetGame': 'איפוס משחק',
  'profile.resetGameHint':
    'מטבעות האימפריה חוזרים ליתרת ההתחלה וכל הנכסים נמחקים. עם חשבון מחובר — מתעדכן גם בשרת.',
  'profile.resetConfirmTitle': 'לאפס את המצב במשחק?',
  'profile.resetConfirmBody': 'כל הנכסים והיתרה יימחקו (יתרת התחלה מחדש). לא ניתן לשחזר.',
  'profile.resetCancel': 'ביטול',
  'profile.resetConfirmOk': 'איפוס',
  'profile.resetErrorTitle': 'האיפוס נכשל',
  'profile.resetErrorBody': 'בדוק חיבור לרשת ונסה שוב.',

  'login.secureAccess': 'גישה מאובטחת',
  'login.tagline': 'אסטרטגיית נדל״ן פרימיום. התחבר כדי לסנכרן תיק והון האימפריה.',
  'login.welcomeTitle': 'ברוך השב',
  'login.welcomeDesc': 'המשך עם Google למרכז הפיקוד שלך.',
  'login.liveTicker': 'מהירות חיה',
  'login.liveTickerLines': 'זרמי תשואה · סנכרון תיק · כספת מאובטחת',
  'login.google': 'המשך עם Google',
  'login.envHint':
    'הגדר EXPO_PUBLIC_SUPABASE_URL וגם EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY או EXPO_PUBLIC_SUPABASE_ANON_KEY (מפתח Publishable מ-Supabase).',
  'login.footer': 'מוגן באמצעות Supabase Auth · ממשק HeroUI Native',

  'game.insufficientTitle': 'אין מספיק יתרה',
  'game.insufficientBody': 'צבור עוד מטבעות אימפריה לפני הרכישה.',
  'game.welcomeBackTitle': 'כיף שחזרת!',
  'game.welcomeBackBody':
    'לא היית כאן בערך {{duration}}.\n\nמטבעות שנצברו בתקופה הזאת (הערכה): {{amount}} מ״ט.{{extraTip}}',
  'game.welcomeBackTipNoPassive':
    '\n\nרכוש נכסים בטאב השוק — הם ימשיכו להרוויח גם כשאתה לא במשחק.',
  'game.welcomeBackOk': 'יאללה',

  'game.renovateMaxTitle': 'שיפוץ מקסימלי',
  'game.renovateMaxBody': 'כבר בשלב השיפוצים הגבוה ביותר (3).',

  'loading.session': 'טוען סשן',
};

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
  t: (key: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'he' || stored === 'en') setLocaleState(stored);
    });
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    setLocaleState(next);
    await AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  const t = useCallback(
    (key: string) => {
      const table = locale === 'he' ? he : en;
      return table[key] ?? en[key] ?? key;
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useI18n must be used within LanguageProvider');
  return ctx;
}
