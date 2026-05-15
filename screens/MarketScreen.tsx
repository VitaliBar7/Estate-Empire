import React from 'react';
import { ScrollView, Text, View } from 'react-native';

import { DashboardHeader } from '../components/DashboardHeader';
import { Button, Card } from 'heroui-native';

import { formatCoins, useGame } from '../lib/game';
import { useI18n } from '../lib/i18n';

export function MarketScreen() {
  const { t } = useI18n();
  const { catalog, buyProperty, hydrated } = useGame();
  return (
    <View className="flex-1 bg-background">
      <DashboardHeader />
      <ScrollView contentContainerClassName="pb-28 pt-2">
        <Text className="px-4 pb-2 text-xl font-semibold text-foreground">{t('market.title')}</Text>
        <Text className="px-4 pb-4 text-sm text-muted">{t('market.subtitle')}</Text>
        {catalog.map((item) => (
          <Card key={item.slug} variant="secondary" className="mx-4 mb-4 border border-white/8">
            <Card.Header className="flex-row items-center justify-between">
              <Text className="text-xs font-medium uppercase tracking-wide text-accent">{item.slug}</Text>
              <Text className="text-sm font-semibold text-foreground">{formatCoins(item.price)} EC</Text>
            </Card.Header>
            <Card.Body className="gap-2">
              <Card.Title className="text-lg">{item.name}</Card.Title>
              <Card.Description className="text-base leading-relaxed">{item.description}</Card.Description>
              <Text className="text-sm text-muted">
                {t('market.yield')} {formatCoins(item.incomePerSecond)} {t('home.perSec')} · {t('market.perUnit')}
              </Text>
            </Card.Body>
            <Card.Footer>
              <Button className="w-full" isDisabled={!hydrated} onPress={() => buyProperty(item.slug)}>
                <Button.Label>{t('market.purchase')}</Button.Label>
              </Button>
            </Card.Footer>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}
