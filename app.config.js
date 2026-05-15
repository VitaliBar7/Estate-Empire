/**
 * Bridges .env (incl. NEXT_PUBLIC_*) into extra. Must merge with app.json so we never drop
 * scheme, ios, android, plugins — a shallow `expo: { extra }` merge was stripping them.
 */
const appJson = require('./app.json');

module.exports = ({ config }) => {
  const fromAppJson = appJson.expo ?? {};
  const fromConfig = config?.expo ?? {};
  const merged = { ...fromAppJson, ...fromConfig };

  return {
    ...config,
    expo: {
      ...merged,
      scheme: merged.scheme ?? 'estate-empire',
      extra: {
        ...(fromAppJson.extra ?? {}),
        ...(fromConfig.extra ?? {}),
        supabaseUrl:
          process.env.EXPO_PUBLIC_SUPABASE_URL ??
          process.env.NEXT_PUBLIC_SUPABASE_URL ??
          '',
        supabasePublishableKey:
          process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
          process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
          '',
      },
    },
  };
};
