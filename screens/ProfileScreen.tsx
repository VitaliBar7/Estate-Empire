import React from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { DashboardHeader } from '../components/DashboardHeader';
import { Button, Card } from 'heroui-native';

import { useAuth } from '../lib/auth';
import { useGame } from '../lib/game';
import { useI18n } from '../lib/i18n';

export function ProfileScreen() {
  const { session, signOut } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const { resetGame, hydrated } = useGame();

  const confirmResetGame = () => {
    Alert.alert(t('profile.resetConfirmTitle'), t('profile.resetConfirmBody'), [
      { text: t('profile.resetCancel'), style: 'cancel' },
      {
        text: t('profile.resetConfirmOk'),
        style: 'destructive',
        onPress: () => void resetGame(),
      },
    ]);
  };

  return (
    <View className="flex-1 bg-background">
      <DashboardHeader />
      <ScrollView contentContainerClassName="gap-4 px-4 pb-28 pt-4">
        <Card variant="secondary" className="border border-white/10">
          <Card.Body className="gap-3">
            <Card.Title>{t('profile.language')}</Card.Title>
            <Card.Description>{t('profile.languageHint')}</Card.Description>
            <View className="flex-row gap-2">
              <Button
                className="flex-1"
                variant={locale === 'en' ? 'primary' : 'secondary'}
                onPress={() => void setLocale('en')}>
                <Button.Label>{t('profile.lang.en')}</Button.Label>
              </Button>
              <Button
                className="flex-1"
                variant={locale === 'he' ? 'primary' : 'secondary'}
                onPress={() => void setLocale('he')}>
                <Button.Label>{t('profile.lang.he')}</Button.Label>
              </Button>
            </View>
          </Card.Body>
        </Card>

        <Card variant="secondary" className="border border-white/10">
          <Card.Body className="gap-3">
            <Card.Title>{t('profile.resetGame')}</Card.Title>
            <Card.Description>{t('profile.resetGameHint')}</Card.Description>
            <Button variant="danger-soft" isDisabled={!hydrated} onPress={confirmResetGame}>
              <Button.Label>{t('profile.resetConfirmOk')}</Button.Label>
            </Button>
          </Card.Body>
        </Card>

        <Card variant="secondary" className="border border-white/10">
          <Card.Body className="gap-3">
            <Card.Title>{t('profile.account')}</Card.Title>
            <Card.Description>{session?.user?.email ?? t('profile.signedInFallback')}</Card.Description>
            <Button variant="danger-soft" onPress={() => void signOut()}>
              <Button.Label>{t('profile.signOut')}</Button.Label>
            </Button>
          </Card.Body>
        </Card>
      </ScrollView>
    </View>
  );
}
