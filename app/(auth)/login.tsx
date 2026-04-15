import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { useLoginWithOAuth } from '@privy-io/expo';

const { width, height } = Dimensions.get('window');

export default function LoginScreen() {
  const router = useRouter();
  const { loadOrGenerateWallet, isInitializing, walletReady } = useWalletAuth();
  const [loggingIn, setLoggingIn] = useState(false);

  // Once the wallet is ready, navigate to tabs
  useEffect(() => {
    if (walletReady) {
      router.replace('/(tabs)');
    }
  }, [walletReady, router]);

  const handlePostAuth = async () => {
    setLoggingIn(true);
    await loadOrGenerateWallet();
    setLoggingIn(false);
  };

  const { login: loginOAuth } = useLoginWithOAuth({
    onSuccess: handlePostAuth
  });

  return (
    <View style={styles.container}>
      {/* Dynamic Background Elements */}
      <View style={styles.glowOrb1} />
      <View style={styles.glowOrb2} />
      
      <View style={styles.content}>
        <Text style={styles.title}>Opago</Text>
        <Text style={styles.subtitle}>Lightning • Solana • Identity</Text>
        
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome Back</Text>
          <Text style={styles.cardDesc}>Sign in to access your universal bridge.</Text>
          
          <TouchableOpacity 
            style={[styles.button, styles.providerBtn]} 
            onPress={() => loginOAuth({ provider: 'google' })} disabled={loggingIn || isInitializing}
          >
            <Text style={styles.providerIcon}>G</Text>
            <Text style={styles.buttonText}>Continue with Google</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.button, styles.providerBtn]} 
            onPress={() => handlePostAuth()} disabled={loggingIn || isInitializing}
          >
            <Text style={styles.providerIcon}>✉</Text>
            <Text style={styles.buttonText}>Continue with Email</Text>
          </TouchableOpacity>

          {(loggingIn || isInitializing) && (
            <ActivityIndicator style={{marginTop: 16}} color="#ffb000" />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  providerBtn: {
    marginBottom: 12,
    flexDirection: 'row',
    backgroundColor: '#1a1a1f',
  },
  providerIcon: {
    fontSize: 20,
    color: '#fff',
    position: 'absolute',
    left: 20,
    fontWeight: '800'
  },
  glowOrb1: {
    position: 'absolute',
    top: -height * 0.1,
    left: -width * 0.2,
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: width * 0.4,
    backgroundColor: '#6b5cc3',
    opacity: 0.15,
    transform: [{ scale: 1.5 }],
  },
  glowOrb2: {
    position: 'absolute',
    bottom: -height * 0.1,
    right: -width * 0.2,
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: width * 0.4,
    backgroundColor: '#ffb000', // solana green
    opacity: 0.15,
    transform: [{ scale: 1.5 }],
  },
  content: {
    width: '100%',
    paddingHorizontal: 24,
    alignItems: 'center',
    zIndex: 10,
  },
  title: {
    fontSize: 48,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -1,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8f8f9d',
    fontWeight: '500',
    marginBottom: 48,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  card: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 24,
    padding: 32,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  cardDesc: {
    fontSize: 15,
    color: '#a0a0ab',
    marginBottom: 32,
    lineHeight: 22,
  },
  button: {
    backgroundColor: '#ffffff',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#fff',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
});
