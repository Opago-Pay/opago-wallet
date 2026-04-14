import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, Switch } from 'react-native';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import QRCode from 'react-native-qrcode-svg';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { addTransaction } from '@/lib/database';
import * as Notifications from 'expo-notifications';

export default function ReceiveScreen() {
  const { sparkWallet, walletReady, loadOrGenerateWallet } = useWalletAuth();
  const rates = useExchangeRates();
  
  const [invoice, setInvoice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [amountStr, setAmountStr] = useState('10');
  const [isEur, setIsEur] = useState(true);

  React.useEffect(() => {
    if (!walletReady) {
      loadOrGenerateWallet();
    }
  }, [walletReady]);

  // Request permissions for notifications
  React.useEffect(() => {
    Notifications.requestPermissionsAsync();
  }, []);

  const handleGenerateInvoice = async () => {
    if (!sparkWallet) return;
    setLoading(true);
    try {
      const inputVal = parseFloat(amountStr) || 0;
      let satAmount = inputVal;
      
      if (isEur) {
        // EUR to SAT
        satAmount = Math.floor((inputVal / rates.btcToEur) * 1e8);
      }
      
      const res = await sparkWallet.createLightningInvoice(satAmount);
      setInvoice(res);

      // MOCK behavior for hackathon: simulate getting paid 5 seconds later
      setTimeout(async () => {
        await addTransaction('incoming', satAmount, 'SAT');
        Notifications.scheduleNotificationAsync({
          content: {
            title: "Payment Received! ⚡",
            body: `You received ${satAmount} SAT`,
          },
          trigger: null,
        });
      }, 5000);

    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const equivalentText = isEur 
    ? `≈ ${Math.floor((parseFloat(amountStr||'0') / rates.btcToEur) * 1e8)} SAT`
    : `≈ €${((parseFloat(amountStr||'0') / 1e8) * rates.btcToEur).toFixed(2)}`;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Receive</Text>
      
      {!walletReady ? (
         <Text style={styles.subtitle}>Wallet initializing...</Text>
      ) : (
         <View style={styles.card}>
           <Text style={styles.cardDesc}>Generate a Lightning invoice to receive Sats.</Text>
           
           {!invoice ? (
             <View style={styles.inputContainer}>
                <View style={styles.toggleRow}>
                  <Text style={[styles.toggleLabel, !isEur && styles.activeLabel]}>SAT</Text>
                  <Switch 
                    value={isEur} 
                    onValueChange={setIsEur} 
                    trackColor={{ false: '#333', true: '#14F195' }}
                    thumbColor="#fff"
                  />
                  <Text style={[styles.toggleLabel, isEur && styles.activeLabel]}>EUR</Text>
                </View>

                <TextInput 
                  style={styles.input}
                  keyboardType="numeric"
                  value={amountStr}
                  onChangeText={setAmountStr}
                  placeholder="0"
                  placeholderTextColor="#666"
                />
                <Text style={styles.equivalent}>{equivalentText}</Text>

                <TouchableOpacity style={styles.button} onPress={handleGenerateInvoice} disabled={loading}>
                  {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Generate Invoice</Text>}
                </TouchableOpacity>
             </View>
           ) : (
             <View style={styles.invoiceContainer}>
               <View style={styles.qrWrapper}>
                  <QRCode
                    value={invoice}
                    size={200}
                    color="#fff"
                    backgroundColor="#1a1a1f"
                  />
               </View>

               <Text style={styles.invoiceText}>{invoice.slice(0, 25)}...</Text>
               <TouchableOpacity style={styles.newButton} onPress={() => setInvoice(null)}>
                 <Text style={styles.newButtonText}>Generate Another</Text>
               </TouchableOpacity>
             </View>
           )}

           <View style={styles.staticAddressContainer}>
              <Text style={styles.staticTitle}>Lightning Address</Text>
              <Text style={styles.staticAddress}>hackathon@spark.io</Text>
           </View>
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
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 20,
  },
  subtitle: { color: '#8f8f9d' },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  cardDesc: {
    color: '#a0a0ab',
    marginBottom: 24,
    textAlign: 'center',
  },
  inputContainer: { width: '100%', alignItems: 'center' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  toggleLabel: {
    color: '#8f8f9d',
    marginHorizontal: 8,
    fontWeight: '600',
  },
  activeLabel: { color: '#fff' },
  input: {
    backgroundColor: '#1a1a1f',
    color: '#fff',
    fontSize: 36,
    fontWeight: '700',
    textAlign: 'center',
    width: '80%',
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)'
  },
  equivalent: {
    color: '#a0a0ab',
    marginTop: 8,
    marginBottom: 24,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#14F195',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center'
  },
  buttonText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
  },
  invoiceContainer: { width: '100%', alignItems: 'center' },
  qrWrapper: {
    padding: 16,
    backgroundColor: '#1a1a1f',
    borderRadius: 16,
    marginBottom: 16,
  },
  invoiceText: {
    color: '#8f8f9d',
    fontFamily: 'monospace',
    marginBottom: 16,
  },
  newButton: { padding: 10 },
  newButtonText: {
    color: '#a259ff',
    fontWeight: 'bold'
  },
  staticAddressContainer: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    width: '100%',
    alignItems: 'center'
  },
  staticTitle: {
    color: '#8f8f9d',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  staticAddress: {
    color: '#a259ff',
    fontSize: 16,
    fontWeight: '600',
  }
});
