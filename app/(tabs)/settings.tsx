import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { deleteSecureItem } from '../../lib/storage';
import { useRouter } from 'expo-router';
import { wipeWalletGlobally } from '@/hooks/useWalletAuth';
import { usePrivy } from '@privy-io/expo';

export default function SettingsScreen() {
  const router = useRouter();
  const { logout } = usePrivy();

  const handleReset = async () => {
    await wipeWalletGlobally();
    if (logout) await logout();
    // Force a hard reload basically by jumping to Login
    router.replace('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Image source={require('@/assets/images/logo_new.svg')} style={{ width: 36, height: 36 }} contentFit="contain" />
      </View>
      <Text style={styles.subtitle}>Manage your cross-chain wallet keys.</Text>

      <View style={styles.section}>
        <TouchableOpacity style={styles.dangerButton} onPress={handleReset}>
          <Text style={styles.dangerButtonText}>Delete Wallet</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
    paddingHorizontal: 16,
  },
  header: {
    marginTop: 60,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
  },
  subtitle: {
    color: '#8f8f9d'
  },
  section: {
    marginTop: 40,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingTop: 40,
  },
  dangerButton: {
    backgroundColor: 'rgba(255, 60, 60, 0.1)',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 60, 60, 0.3)',
  },
  dangerButtonText: {
    color: '#ff4444',
    fontWeight: '700',
    fontSize: 16,
  }
});
