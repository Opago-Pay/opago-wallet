import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';

export default function SettingsScreen() {
  const router = useRouter();

  const handleReset = async () => {
    await SecureStore.deleteItemAsync('opago_wallet_mnemonic');
    // Force a hard reload basically by jumping to Login
    router.replace('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>Manage your cross-chain wallet keys.</Text>

      <View style={styles.section}>
        <TouchableOpacity style={styles.dangerButton} onPress={handleReset}>
          <Text style={styles.dangerButtonText}>Reset Wallet / Logout</Text>
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
    paddingTop: 60,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 20,
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
