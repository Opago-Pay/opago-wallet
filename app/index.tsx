import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { getSecureItem } from '../lib/storage';
import { View, ActivityIndicator } from 'react-native';
import { useWalletAuth } from '../hooks/useWalletAuth';

const MNEMONIC_STORE_KEY = 'opago_wallet_mnemonic';

export default function Index() {
  const [loading, setLoading] = useState(true);
  const [hasWallet, setHasWallet] = useState(false);
  const { loadOrGenerateWallet } = useWalletAuth();

  useEffect(() => {
    async function checkAuth() {
      try {
        const item = await getSecureItem(MNEMONIC_STORE_KEY);
        if (item) {
          await loadOrGenerateWallet();
        }
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
         <ActivityIndicator color="#ffb000" />
      </View>
    );
  }

  if (hasWallet) {
    return <Redirect href="/(tabs)" />;
  } else {
    return <Redirect href="/(auth)/login" />;
  }
}
