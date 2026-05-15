import { Card } from 'heroui-native';
import React, { useCallback } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';

import { DashboardHeader } from '../components/DashboardHeader';

import {
  estimateResaleGross,
  formatCoins,
  holdingProducesIncome,
  MAX_RENOVATION_TIER,
  renovationCostForNextTier,
  resaleNetFromGross,
  type Holding,
  useGame,
} from '../lib/game';
import { useI18n } from '../lib/i18n';

function modeLabel(t: (k: string) => string, h: Holding, now: number): string {
  if (h.mode === 'idle') return t('home.mode.idle');
  if (h.mode === 'vacancy') {
    if (h.vacancyEndsAtMs != null && now < h.vacancyEndsAtMs) return t('home.mode.vacancy');
    return t('home.mode.leasing');
  }
  return t('home.mode.leasing');
}

export function HomeScreen() {
  const { t } = useI18n();
  const {
    catalog,
    holdings,
    virtualBalance,
    incomePerSecond,
    premiumGold,
    hydrated,
    startLease,
    stopLease,
    leaseAllIdleOfSlug,
    sellHolding,
    renovateHolding,
  } = useGame();

  const now = Date.now();

  const confirmSell = useCallback(
    (h: Holding) => {
      const gross = estimateResaleGross(h, Date.now());
      const { fee, net } = resaleNetFromGross(gross);
      Alert.alert(
        t('home.sellConfirmTitle'),
        t('home.sellConfirmBody')
          .replace('{{gross}}', formatCoins(gross))
          .replace('{{fee}}', formatCoins(fee))
          .replace('{{net}}', formatCoins(net)),
        [
          { text: t('profile.resetCancel'), style: 'cancel' },
          {
            text: t('home.sellConfirmOk'),
            style: 'destructive',
            onPress: () => void sellHolding(h.id),
          },
        ],
      );
    },
    [sellHolding, t],
  );

  const slugGroups = catalog
    .map((item) => ({
      item,
      lots: holdings.filter((h) => h.slug === item.slug),
    }))
    .filter((g) => g.lots.length > 0);

  return (
    <View className="flex-1 bg-background">
      <DashboardHeader />
      <ScrollView contentContainerClassName="gap-6 pb-28 px-4 pt-6">
        <View className="overflow-hidden rounded-3xl border border-accent/25 bg-surface-secondary px-5 py-6">
          <Text className="text-xs uppercase tracking-[0.25em] text-accent">{t('home.heroTitle')}</Text>
          <Text
            className="mt-3 max-w-full font-bold tracking-tight text-foreground"
            style={{ fontSize: 42, lineHeight: 48 }}
            accessibilityRole="header"
            accessibilityLabel={`${t('home.heroTitle')} ${hydrated ? formatCoins(virtualBalance) : '…'}`}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.35}>
            {hydrated ? formatCoins(virtualBalance) : '…'}
          </Text>
          <Text className="mt-2 text-sm text-muted">{t('home.heroSubtitle')}</Text>
          <View className="mt-6 flex-row flex-wrap gap-4 border-t border-white/10 pt-5">
            <View className="min-w-[46%] flex-1">
              <Text className="text-xs text-muted">{t('home.passiveIncome')}</Text>
              <Text
                className="mt-1 font-semibold text-accent"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={{ fontSize: 18 }}>
                {formatCoins(incomePerSecond)} {t('home.perSec')}
              </Text>
            </View>
            <View className="min-w-[46%] flex-1">
              <Text className="text-xs text-muted">{t('header.premiumGold')}</Text>
              <Text
                className="mt-1 font-semibold text-accent"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={{ fontSize: 18 }}>
                {premiumGold.toLocaleString()} PG
              </Text>
            </View>
          </View>
        </View>

        <View className="gap-3">
          <Text className="text-lg font-semibold text-foreground">{t('home.portfolio')}</Text>
          {slugGroups.length === 0 ? (
            <Card variant="secondary" className="border border-white/10">
              <Card.Body className="gap-2 py-5">
                <Card.Title>{t('home.noHoldingsTitle')}</Card.Title>
                <Card.Description>{t('home.noHoldingsDesc')}</Card.Description>
              </Card.Body>
            </Card>
          ) : (
            slugGroups.map(({ item, lots }) => {
              const leasing = lots.filter((h) => holdingProducesIncome(h, now)).length;
              const idle = lots.filter((h) => h.mode === 'idle').length;
              const vacancy = lots.filter(
                (h) => h.mode === 'vacancy' && h.vacancyEndsAtMs != null && now < h.vacancyEndsAtMs,
              ).length;
              const rateIfLeased =
                lots.reduce((sum, h) => {
                  if (!holdingProducesIncome(h, now)) return sum;
                  const mult = 1 + 0.11 * h.renovationTier;
                  return sum + item.incomePerSecond * mult;
                }, 0) / Math.max(1, leasing || 1);

              return (
                <Card key={item.slug} variant="secondary" className="border border-white/8">
                  <Card.Body className="gap-3 py-4">
                    <Card.Title>{item.name}</Card.Title>
                    <Card.Description>
                      {t('home.portfolioSummary')
                        .replace('{{total}}', String(lots.length))
                        .replace('{{leasing}}', String(leasing))
                        .replace('{{idle}}', String(idle))
                        .replace('{{vacancy}}', String(vacancy))}
                    </Card.Description>
                    <Text className="text-xs text-muted">
                      {t('home.output')} {leasing > 0 ? formatCoins(Math.round(rateIfLeased)) : '0'}{' '}
                      {t('home.perSec')} ({t('home.mode.leasing')})
                    </Text>

                    {idle > 0 ? (
                      <View className="pt-1">
                        <Card.Footer className="px-0 pt-0">
                          <View className="w-full">
                            <Text
                              className="mb-2 w-full rounded-lg border border-accent/30 bg-accent/10 py-2 text-center text-xs text-accent"
                              onPress={() => void leaseAllIdleOfSlug(item.slug)}>
                              {t('home.leaseAllIdle')}
                            </Text>
                          </View>
                        </Card.Footer>
                      </View>
                    ) : null}

                    <View className="gap-3 border-t border-white/8 pt-3">
                      {lots.map((h) => {
                        const gross = estimateResaleGross(h, now);
                        const nextCost = renovationCostForNextTier(h);
                        const vacLeftSec =
                          h.mode === 'vacancy' && h.vacancyEndsAtMs != null && now < h.vacancyEndsAtMs
                            ? Math.max(1, Math.ceil((h.vacancyEndsAtMs - now) / 1000))
                            : null;

                        return (
                          <View key={h.id} className="gap-2 rounded-xl border border-white/8 bg-background/40 p-3">
                            <Text className="text-xs font-medium text-muted">
                              {modeLabel(t, h, now)}
                              {vacLeftSec != null
                                ? ` · ${t('home.vacancyEta').replace('{{seconds}}', String(vacLeftSec))}`
                                : ''}
                            </Text>
                            <Text className="text-xs text-muted">
                              {t('home.estSale')}: {formatCoins(gross)} EC · {t('home.tierRenov')}{' '}
                              {h.renovationTier}/{MAX_RENOVATION_TIER}
                            </Text>
                            <View className="flex-row flex-wrap gap-2">
                              {h.mode === 'idle' ? (
                                <Text
                                  className="rounded-lg border border-accent/40 bg-accent/15 px-3 py-1.5 text-xs text-accent"
                                  onPress={() => void startLease(h.id)}>
                                  {t('home.leaseOne')}
                                </Text>
                              ) : null}
                              {(h.mode === 'leasing' || (h.mode === 'vacancy' && vacLeftSec == null)) &&
                              holdingProducesIncome(h, now) ? (
                                <Text
                                  className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-foreground"
                                  onPress={() => void stopLease(h.id)}>
                                  {t('home.stopLease')}
                                </Text>
                              ) : null}
                              <Text
                                className="rounded-lg border border-red-500/35 px-3 py-1.5 text-xs text-red-400"
                                onPress={() => confirmSell(h)}>
                                {t('home.sellConfirmOk')}
                              </Text>
                              {nextCost != null ? (
                                <Text
                                  className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-muted"
                                  onPress={() => void renovateHolding(h.id)}>
                                  {t('home.renovate')} (
                                  {t('home.renovateFor').replace('{{cost}}', formatCoins(nextCost))})
                                </Text>
                              ) : null}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </Card.Body>
                </Card>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}
