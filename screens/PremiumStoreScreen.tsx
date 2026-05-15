import React from 'react';
import { View } from 'react-native';

import { DashboardHeader } from '../components/DashboardHeader';
import { Card } from 'heroui-native';

import { useI18n } from '../lib/i18n';

export function PremiumStoreScreen() {
  const { t } = useI18n();
  return (
    <View className="flex-1 bg-background">
      <DashboardHeader />
      <View className="flex-1 justify-center px-6">
        <Card variant="secondary" className="border border-white/10">
          <Card.Body className="gap-2">
            <Card.Title>{t('premium.title')}</Card.Title>
            <Card.Description>{t('premium.body')}</Card.Description>
          </Card.Body>
        </Card>
      </View>
    </View>
  );
}
