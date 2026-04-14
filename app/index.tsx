import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { View, ActivityIndicator } from 'react-native';

const MNEMONIC_STORE_KEY = 'opago_wallet_mnemonic';

export default function Index() {
  const [loading, setLoading] = useState(true);
  const [hasWallet, setHasWallet] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      try {
        const item = await SecureStore.getItemAsync(MNEMONIC_STORE_KEY);
        setHasWallet(!!item);
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0c', justifyContent: 'center', alignItems: 'center' }}>
         <ActivityIndicator color="#14F195" />
      </View>
    );
  }

  if (hasWallet) {
    return <Redirect href="/(tabs)" />;
  } else {
    return <Redirect href="/(auth)/login" />;
  }
}
