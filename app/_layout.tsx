import 'react-native-get-random-values';
import * as Crypto from 'expo-crypto';
import { Buffer } from 'buffer';

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

if (typeof global.crypto !== 'object') {
  (global as any).crypto = {};
}
if (!(global as any).crypto.getRandomValues) {
  (global as any).crypto.getRandomValues = function (array: Uint8Array) {
    const rnd = Crypto.getRandomBytes(array.byteLength || array.length);
    for (let i = 0; i < (array.byteLength || array.length); i++) array[i] = rnd[i];
    return array;
  };
}
if (typeof window !== 'undefined' && !(window as any).crypto) {
  (window as any).crypto = (global as any).crypto;
}
if (typeof globalThis !== 'undefined' && !(globalThis as any).crypto) {
  (globalThis as any).crypto = (global as any).crypto;
}

import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import * as Notifications from 'expo-notifications';
import { PrivyProvider } from '@privy-io/expo';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <PrivyProvider
      appId={process.env.EXPO_PUBLIC_PRIVY_APP_ID!}
      clientId={process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID!}
    >
      <ThemeProvider value={DarkTheme}>
        <Stack>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="light" />
      </ThemeProvider>
    </PrivyProvider>
  );
}
