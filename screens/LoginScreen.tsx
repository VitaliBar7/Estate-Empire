import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Button, Card } from 'heroui-native';
import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { supabaseConfigured } from '../lib/supabase';

export function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signInWithGoogle, oauthLoading } = useAuth();
  const { t } = useI18n();

  return (
    <LinearGradient
      colors={['#050508', '#0f0d12', '#151018', '#0a090c']}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ flex: 1 }}>
      <View
        className="flex-1 justify-between px-6"
        style={{ paddingTop: insets.top + 24, paddingBottom: Math.max(insets.bottom, 24) }}>
        <View className="gap-6">
          <View className="items-center gap-2">
            <View className="rounded-full border border-accent/35 bg-accent/10 px-4 py-1.5">
              <Text className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
                {t('login.secureAccess')}
              </Text>
            </View>
            <Text className="text-center text-4xl font-bold tracking-tight text-foreground">
              {t('header.brand')}
            </Text>
            <Text className="text-center text-base leading-relaxed text-muted">{t('login.tagline')}</Text>
          </View>

          <Card variant="secondary" className="border border-white/10 shadow-sm">
            <Card.Body className="gap-5 py-6">
              <View className="gap-1">
                <Card.Title className="text-xl">{t('login.welcomeTitle')}</Card.Title>
                <Card.Description className="text-base">{t('login.welcomeDesc')}</Card.Description>
              </View>

              <View className="rounded-xl border border-dashed border-white/15 bg-background/60 px-4 py-3">
                <Text className="text-xs uppercase tracking-wide text-muted">{t('login.liveTicker')}</Text>
                <Text className="mt-1 font-mono text-sm text-accent">{t('login.liveTickerLines')}</Text>
              </View>

              <Button
                size="lg"
                className="w-full flex-row items-center justify-center gap-3 border border-accent/50 bg-accent"
                isDisabled={oauthLoading || !supabaseConfigured}
                onPress={() => void signInWithGoogle()}>
                {oauthLoading ? (
                  <ActivityIndicator color="#171717" />
                ) : (
                  <>
                    <Ionicons name="logo-google" size={22} color="#171717" />
                    <Button.Label className="font-semibold text-[#171717]">{t('login.google')}</Button.Label>
                  </>
                )}
              </Button>

              {!supabaseConfigured ? (
                <Text className="text-center text-xs text-danger">{t('login.envHint')}</Text>
              ) : null}
            </Card.Body>
          </Card>
        </View>

        <Text className="text-center text-[11px] text-muted">{t('login.footer')}</Text>
      </View>
    </LinearGradient>
  );
}
