/// <reference types="uniwind/types" />
import './global.css';

import { Ionicons } from '@expo/vector-icons';
import {
  NavigationContainer,
  DefaultTheme as NavigationDefaultTheme,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HeroUINativeProvider } from 'heroui-native';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Uniwind } from 'uniwind';

import { AuthProvider, useAuth } from './lib/auth';
import { GameProvider } from './lib/game';
import { LanguageProvider, useI18n } from './lib/i18n';
import { HomeScreen } from './screens/HomeScreen';
import { LoginScreen } from './screens/LoginScreen';
import { MarketScreen } from './screens/MarketScreen';
import { PremiumStoreScreen } from './screens/PremiumStoreScreen';
import { ProfileScreen } from './screens/ProfileScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabNavigator() {
  const insets = useSafeAreaInsets();
  const { locale, t } = useI18n();

  return (
    <Tab.Navigator
      key={locale}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#e8c547',
        tabBarInactiveTintColor: '#737373',
        tabBarStyle: {
          backgroundColor: '#0c0c0f',
          borderTopColor: 'rgba(255,255,255,0.08)',
          height: 56 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 10),
          paddingTop: 8,
        },
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: t('tab.home'),
          tabBarAccessibilityLabel: t('tab.a11y.home'),
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Market"
        component={MarketScreen}
        options={{
          tabBarLabel: t('tab.market'),
          tabBarAccessibilityLabel: t('tab.a11y.market'),
          tabBarIcon: ({ color, size }) => <Ionicons name="storefront-outline" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Premium"
        component={PremiumStoreScreen}
        options={{
          tabBarLabel: t('tab.premium'),
          tabBarAccessibilityLabel: t('tab.a11y.premium'),
          tabBarIcon: ({ color, size }) => <Ionicons name="diamond-outline" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: t('tab.profile'),
          tabBarAccessibilityLabel: t('tab.a11y.profile'),
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}

function MainAppScreen() {
  return (
    <GameProvider>
      <TabNavigator />
    </GameProvider>
  );
}

function RootNavigator() {
  const { session, initialized } = useAuth();
  const { t } = useI18n();

  if (!initialized) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#e8c547" accessibilityLabel={t('loading.session')} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      key={session ? 'authenticated' : 'guest'}
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: '#09090b' },
      }}>
      {session ? (
        <Stack.Screen name="MainApp" component={MainAppScreen} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

const navTheme = {
  ...NavigationDefaultTheme,
  colors: {
    ...NavigationDefaultTheme.colors,
    background: '#09090b',
    card: '#09090b',
    border: 'rgba(255,255,255,0.08)',
    primary: '#e8c547',
    text: '#fafafa',
  },
};

export default function App() {
  useEffect(() => {
    Uniwind.setTheme('dark');
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <HeroUINativeProvider>
          <LanguageProvider>
            <AuthProvider>
              <NavigationContainer theme={navTheme}>
                <RootNavigator />
              </NavigationContainer>
            </AuthProvider>
          </LanguageProvider>
        </HeroUINativeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
