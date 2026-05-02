import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { useLoginWithOAuth } from '@privy-io/expo';
import { validateMnemonic } from 'bip39';
import { setSecureItem } from '@/lib/storage';

const { width, height } = Dimensions.get('window');

export default function LoginScreen() {
  const router = useRouter();
  const { loadOrGenerateWallet, isInitializing, walletReady, initStatus } = useWalletAuth();
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

  const [isRestoring, setIsRestoring] = useState(false);
  const [mnemonicInput, setMnemonicInput] = useState('');

  const handleRestore = async () => {
    const phrase = mnemonicInput.trim().toLowerCase();
    if (!validateMnemonic(phrase)) {
      Alert.alert("Invalid Phrase", "Please enter a valid 12 or 24-word recovery phrase.");
      return;
    }
    setLoggingIn(true);
    await setSecureItem('opago_wallet_mnemonic', phrase);
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
          {isRestoring ? (
            <>
               <Text style={styles.cardTitle}>Restore Wallet</Text>
               <Text style={styles.cardDesc}>Enter your 12-word recovery phrase separated by spaces.</Text>
               
               <TextInput 
                 style={styles.input} 
                 placeholder="e.g. abandon ability able..." 
                 placeholderTextColor="#666"
                 value={mnemonicInput} 
                 onChangeText={setMnemonicInput} 
                 autoCapitalize="none" 
                 multiline
               />

               <TouchableOpacity 
                 style={[styles.button, styles.providerBtn, { backgroundColor: '#6b5cc3' }]} 
                 onPress={handleRestore} disabled={loggingIn || isInitializing}
               >
                 <Text style={[styles.buttonText, { color: '#fff' }]}>Restore Now</Text>
               </TouchableOpacity>

               <TouchableOpacity 
                 style={[styles.button, styles.providerBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#333' }]} 
                 onPress={() => setIsRestoring(false)} disabled={loggingIn || isInitializing}
               >
                 <Text style={styles.buttonText}>Cancel</Text>
               </TouchableOpacity>
            </>
          ) : (
            <>
               <Text style={styles.cardTitle}>Create Wallet</Text>
               <Text style={styles.cardDesc}>Create your new universal bridge wallet.</Text>
               
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

               <TouchableOpacity 
                 style={{ marginTop: 16, alignItems: 'center' }} 
                 onPress={() => setIsRestoring(true)} disabled={loggingIn || isInitializing}
               >
                 <Text style={{ color: '#6b5cc3', fontWeight: 'bold' }}>Restore from Recovery Phrase</Text>
               </TouchableOpacity>
            </>
          )}

          {(loggingIn || isInitializing) && (
            <View style={{marginTop: 24, alignItems: 'center'}}>
               <ActivityIndicator color="#ffb000" size="large" />
               <Text style={{color: '#a0a0ab', marginTop: 16, fontSize: 14, fontWeight: '600', textAlign: 'center'}}>
                 {initStatus || 'Authenticating...'}
               </Text>
            </View>
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
  input: { 
    backgroundColor: '#1a1a1f', 
    color: '#fff', 
    fontSize: 16, 
    padding: 16, 
    borderRadius: 12, 
    marginBottom: 20, 
    minHeight: 80, 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.1)' 
  },
});
