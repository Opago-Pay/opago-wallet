import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { deleteSecureItem, getSecureItem } from '../../lib/storage';
import { useRouter } from 'expo-router';
import { wipeWalletGlobally } from '@/hooks/useWalletAuth';
import { usePrivy } from '@privy-io/expo';

export default function SettingsScreen() {
  const router = useRouter();
  const { logout } = usePrivy();
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    getSecureItem('opago_wallet_mnemonic').then(setMnemonic);
  }, []);

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

      {mnemonic && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recovery Phrase</Text>
          <Text style={styles.sectionSubtitle}>This phrase is the master key to your funds. Never share it with anyone.</Text>
          
          <TouchableOpacity 
             style={styles.mnemonicBox} 
             onPress={() => setIsRevealed(!isRevealed)}
          >
            <Text style={[styles.mnemonicText, !isRevealed && styles.blurredText]}>
              {isRevealed ? mnemonic : "•••••••• •••••••• •••••••• •••••••• •••••••• •••••••• •••••••• •••••••• •••••••• •••••••• •••••••• ••••••••"}
            </Text>
            {!isRevealed && (
              <View style={styles.overlayTextContainer}>
                <Text style={styles.overlayText}>Tap to Reveal</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}

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
  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  sectionSubtitle: {
    color: '#8f8f9d',
    marginBottom: 16,
  },
  mnemonicBox: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 24,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 120,
  },
  mnemonicText: {
    color: '#fff',
    fontSize: 18,
    lineHeight: 28,
    fontFamily: 'monospace',
    textAlign: 'center',
    letterSpacing: 1,
  },
  blurredText: {
    opacity: 0.3,
  },
  overlayTextContainer: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0, right: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayText: {
    color: '#ffb000',
    fontWeight: '700',
    fontSize: 16,
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
