import React from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatCoins, formatCoinsCompact, useGame } from '../lib/game';
import { useI18n } from '../lib/i18n';

export function DashboardHeader() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { virtualBalance, premiumGold, hydrated } = useGame();
  const topPad = Math.max(insets.top, 10);

  return (
    <View className="border-b border-white/10 bg-background px-4 pb-4" style={{ paddingTop: topPad }}>
      <Text className="text-xs uppercase tracking-widest text-muted">{t('header.brand')}</Text>
      <View className="mt-3 flex-row gap-3">
        <View className="min-h-[72px] flex-1 rounded-2xl bg-surface-secondary px-3 py-3">
          <Text className="text-xs text-muted" numberOfLines={1}>
            {t('header.empireCoins')}
          </Text>
          <Text
            className="mt-1 shrink text-lg font-semibold text-foreground"
            accessibilityRole="text"
            accessibilityLabel={`${t('header.empireCoins')} ${hydrated ? formatCoins(virtualBalance) : '…'}`}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}>
            {hydrated ? `${formatCoinsCompact(virtualBalance)} EC` : '…'}
          </Text>
        </View>
        <View className="min-h-[72px] flex-1 rounded-2xl border border-accent/40 bg-surface-secondary px-3 py-3">
          <Text className="text-xs text-accent" numberOfLines={1}>
            {t('header.premiumGold')}
          </Text>
          <Text
            className="mt-1 shrink text-lg font-semibold text-accent"
            accessibilityRole="text"
            accessibilityLabel={`${t('header.premiumGold')} ${hydrated ? premiumGold : '…'}`}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}>
            {hydrated ? `${formatCoinsCompact(premiumGold)} PG` : '…'}
          </Text>
        </View>
      </View>
    </View>
  );
}
