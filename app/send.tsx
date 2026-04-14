import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, Dimensions } from 'react-native';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { executeAtomiqSwap } from '@/lib/atomiq';
import { addTransaction } from '@/lib/database';
import { resolveLightningAddress, fetchInvoiceFromLNURLP } from '@/lib/lnurl';
import { Stack, useRouter } from 'expo-router';

const { width } = Dimensions.get('window');

export default function SendScreen() {
  const router = useRouter();
  const { sparkWallet, solanaKeypair, walletReady, loadOrGenerateWallet } = useWalletAuth();
  
  const [destination, setDestination] = useState('');
  const [amountSat, setAmountSat] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('Execute Payload');
  const [source, setSource] = useState<'spark' | 'atomiq'>('spark');

  React.useEffect(() => {
    if (!walletReady) {
      loadOrGenerateWallet();
    }
  }, [walletReady]);

  const handleSend = async () => {
    if (!destination.trim()) {
      Alert.alert("Error", "Please enter a valid BOLT-11 invoice or Lightning Address.");
      return;
    }
    const parsedAmount = parseInt(amountSat) || 1000;
    
    setLoading(true);
    setStatusText('Resolving Address...');

    try {
      let finalBolt11 = destination.trim();

      // If user provided a Lightning Address (user@domain.com), dynamically resolve it to an invoice
      if (finalBolt11.includes('@')) {
         const lnurlpInfo = await resolveLightningAddress(finalBolt11);
         finalBolt11 = await fetchInvoiceFromLNURLP(lnurlpInfo.callback, parsedAmount);
      }

      if (source === 'spark') {
        setStatusText("Paying Invoice...");
        if (!sparkWallet) throw new Error("Spark wallet not initialized");
        await sparkWallet.payLightningInvoice({ invoice: finalBolt11, maxFeeSats: 200 });
        await addTransaction('outgoing', parsedAmount, 'SAT');
        Alert.alert("Success", "Lightning invoice natively paid!");
      } else {
        setStatusText("Building Internal Bridge Route...");
        if (!sparkWallet) throw new Error("Local Spark Wallet not ready for intermediary hop");
        if (!solanaKeypair) throw new Error("Solana Keypair missing");
        
        // 2-Hop Logic: Instead of paying direct, we mint an intermediary invoice to our OWN wallet
        const intermediaryInvoiceRes = await sparkWallet.createLightningInvoice({ 
             amountSats: parsedAmount, 
             memo: "Internal 2-Hop Bridge Route" 
        });
        
        const internalBolt11 = intermediaryInvoiceRes.invoice.encodedInvoice || intermediaryInvoiceRes.invoice;
        
        setStatusText("Executing Atomiq Swap...");
        await executeAtomiqSwap(solanaKeypair, internalBolt11, parsedAmount);
        
        setStatusText("Finalizing LN Hop...");
        // After Atomiq bridges the SOL strictly to our local Spark wallet, we forcefully pay the end-user out of it
        await sparkWallet.payLightningInvoice({ invoice: finalBolt11, maxFeeSats: 200 });
        
        await addTransaction('outgoing', parsedAmount, 'SOL');
        Alert.alert("Bridge Success", "Safely executed a Trustless 2-Hop Bridge to the destination!");
      }
      setDestination('');
      setAmountSat('');
      router.back();
    } catch (e: any) {
      console.error(e);
      Alert.alert("Send Failed", e.message || "An error occurred during submission.");
    } finally {
      setLoading(false);
      setStatusText('Execute Payload');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Send & Bridge</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
      
      {!walletReady ? (
         <Text style={styles.subtitle}>Wallet initializing...</Text>
      ) : (
         <View style={styles.card}>
           <Text style={styles.cardDesc}>Paste a destination to instantly route your funds.</Text>
           
           <TextInput 
             style={styles.input}
             placeholder="BOLT-11 or user@domain.com"
             placeholderTextColor="#666"
             value={destination}
             onChangeText={setDestination}
             autoCapitalize="none"
             multiline
           />

           <TextInput 
             style={styles.inputAmount}
             placeholder="Amount (SAT) if not embedded"
             placeholderTextColor="#666"
             value={amountSat}
             keyboardType="numeric"
             onChangeText={setAmountSat}
           />

           <Text style={styles.sourceLabel}>Funding Source</Text>
           
           <View style={styles.toggleContainer}>
             <TouchableOpacity 
               style={[styles.toggleBtn, source === 'spark' && styles.activeSparkBtn]}
               onPress={() => setSource('spark')}
             >
               <Text style={[styles.toggleText, source === 'spark' && styles.activeText]}>Spark L2</Text>
             </TouchableOpacity>
             
             <TouchableOpacity 
               style={[styles.toggleBtn, source === 'atomiq' && styles.activeAtomiqBtn]}
               onPress={() => setSource('atomiq')}
             >
               <Text style={[styles.toggleText, source === 'atomiq' && styles.activeText]}>Atomiq API</Text>
             </TouchableOpacity>
           </View>

           <TouchableOpacity style={styles.button} onPress={handleSend} disabled={loading}>
             {loading ? (
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                 <ActivityIndicator color="#000" style={{marginRight: 8}} />
                 <Text style={styles.buttonText}>{statusText}</Text>
                </View>
             ) : (
                <Text style={styles.buttonText}>{statusText}</Text>
             )}
           </TouchableOpacity>
         </View>
      )}
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
  },
  closeBtn: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: { color: '#8f8f9d' },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    padding: 24,
    width: '100%'
  },
  cardDesc: {
    color: '#a0a0ab',
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#1a1a1f',
    color: '#fff',
    fontSize: 16,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    minHeight: 80,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)'
  },
  inputAmount: {
    backgroundColor: '#1a1a1f',
    color: '#fff',
    fontSize: 16,
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)'
  },
  sourceLabel: {
    color: '#8f8f9d',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  toggleContainer: {
    flexDirection: 'row',
    marginBottom: 32,
    backgroundColor: '#1a1a1f',
    borderRadius: 12,
    padding: 4,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeSparkBtn: {
    backgroundColor: '#F7931A', // Bitcoin Orange
  },
  activeAtomiqBtn: {
    backgroundColor: '#14F195', // Solana Green
  },
  toggleText: {
    color: '#8f8f9d',
    fontWeight: '700',
  },
  activeText: {
    color: '#000',
  },
  button: {
    backgroundColor: '#a259ff', // Purple for execution
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
  },
  buttonText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
  }
});
