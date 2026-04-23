import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, Switch, Alert, LayoutAnimation } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import QRCode from 'react-native-qrcode-svg';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { addTransaction } from '@/lib/database';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Connection, PublicKey } from '@solana/web3.js';

export default function ReceiveScreen() {
  const router = useRouter();
  const { sparkWallet, walletReady, loadOrGenerateWallet, solanaAddress } = useWalletAuth();
  const rates = useExchangeRates();
  
  const [network, setNetwork] = useState<'lightning' | 'solana'>('lightning');
  
  const [invoice, setInvoice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [amountStr, setAmountStr] = useState('10');
  const [isEur, setIsEur] = useState(false);
  
  const [isPaid, setIsPaid] = useState(false);
  const [initialBalance, setInitialBalance] = useState<number>(0);
  const [invoiceTimestamp, setInvoiceTimestamp] = useState<number>(0);

  useEffect(() => {
    if (!walletReady) {
      loadOrGenerateWallet();
    }
  }, [walletReady]);

  useEffect(() => {
    Notifications.requestPermissionsAsync();
  }, []);

  // Poll Spark SDK for Real Lightning Payment Execution!
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (invoice && !isPaid && sparkWallet) {
      interval = setInterval(async () => {
        try {
          const { transfers } = await sparkWallet.getTransfers(15, 0);
          const balData = await sparkWallet.getBalance();
          const settled = Number(balData.balance) || 0;
          const incoming = Number(balData.satsBalance?.incoming) || 0;
          const currentBal = settled + incoming;
          
          // Network cache evasion: Look for a transfer inside the array that is strictly newer
          // than when this component entered the polling state. 
          // (Simulating a fresh push architecture)
          const latestTx = transfers?.[0];
          const txTime = latestTx ? new Date(latestTx.createdTime || latestTx.createdAt).getTime() : 0;
          const isFresh = txTime > invoiceTimestamp;
          
          if (isFresh && latestTx?.transferDirection === 'INCOMING' && latestTx?.status !== 'FAILED') {
            const rawAmount = latestTx.totalValue || (latestTx.userRequest?.transfer?.totalAmount?.originalValue) || 1;
            addTransaction('incoming', rawAmount, 'SAT');
            
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setIsPaid(true);
            
            Notifications.scheduleNotificationAsync({
              content: { title: "Payment Received! ⚡", body: `You just received ${rawAmount} SAT` },
              trigger: null,
            });
          }
        } catch (e) {
          // ignore polling temp errors
        }
      }, 2000); // 2 second lightning fast polling
    }
    return () => clearInterval(interval);
  }, [invoice, isPaid, initialBalance, sparkWallet]);

  // Solana Base Layer Polling
  const initialSolanaSignature = useRef<string | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (network === 'solana' && solanaAddress && !isPaid) {
      
      const pollSolana = async () => {
        try {
          const connection = new Connection("https://solana-rpc.publicnode.com");
          const pubkey = new PublicKey(solanaAddress);
          const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 1 });
          
          if (sigs.length > 0) {
            const topSig = sigs[0].signature;
            if (!initialSolanaSignature.current) {
              initialSolanaSignature.current = topSig;
            } else if (topSig !== initialSolanaSignature.current) {
              // New signature arrived while on receive screen
              Notifications.scheduleNotificationAsync({
                 content: { title: "Deposit Confirmed", body: `Solana Network Transfer Received!`, sound: true },
                 trigger: null,
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setIsPaid(true);
            }
          }
        } catch (e) {
          // Ignore RPC rate limiting
        }
      };

      pollSolana();
      interval = setInterval(pollSolana, 4000);
    }
    return () => clearInterval(interval);
  }, [network, solanaAddress, isPaid]);

  const handleGenerateInvoice = async () => {
    if (!sparkWallet) return;
    setLoading(true);
    try {
      const inputVal = parseFloat(amountStr) || 0;
      let satAmount = inputVal;
      
      if (isEur) {
        satAmount = Math.floor((inputVal / rates.btcToEur) * 1e8);
      }
      
      // Snapshot balance to detect changes
      const balData = await sparkWallet.getBalance();
      setInitialBalance(Number(balData.balance) + Number(balData.satsBalance?.incoming || 0));
      setInvoiceTimestamp(Date.now() - 2000); // Allow 2 sec buffer for clock drift

      const res = await sparkWallet.createLightningInvoice({ amountSats: satAmount, memo: "Deposit into Opago Wallet" });
      const rawInvoice = res.invoice.encodedInvoice || res.invoice;

      const finalInvoice = rawInvoice.toLowerCase().startsWith('lightning:') ? rawInvoice : `lightning:${rawInvoice}`;
      setInvoice(finalInvoice);
      setIsPaid(false);

    } catch(e) {
      console.error(e);
      Alert.alert("Error", "Could not connect to Spark Nodes");
    } finally {
      setLoading(false);
    }
  };

  const parsedAmount = parseFloat(amountStr) || 0;

  const resetState = () => {
    setInvoice(null);
    setIsPaid(false);
  };

  const copyToClipboard = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert("Copied!", `${label} copied to clipboard.`);
  };

  const equivalentText = isEur 
    ? `≈ ${Math.floor((parseFloat(amountStr||'0') / rates.btcToEur) * 1e8)} SAT`
    : `≈ €${((parseFloat(amountStr||'0') / 1e8) * rates.btcToEur).toFixed(2)}`;

  if (isPaid) {
     return (
       <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
         <View style={styles.successCircle}><Text style={styles.checkmark}>✓</Text></View>
         <Text style={styles.successTitle}>Funds Received!</Text>
         <Text style={styles.successSubtitle}>Payment securely settled on the {network === 'lightning' ? 'Lightning' : 'Solana'} Network.</Text>
         <TouchableOpacity style={styles.button} onPress={() => {
            initialSolanaSignature.current = null;
            router.push('/');
         }}>
            <Text style={styles.buttonText}>Return to Home</Text>
         </TouchableOpacity>
         <TouchableOpacity style={{ marginTop: 24 }} onPress={() => { initialSolanaSignature.current = null; resetState(); }}>
            <Text style={{ color: '#6b5cc3', fontWeight: 'bold' }}>Generate Another</Text>
         </TouchableOpacity>
       </View>
     );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Receive Deposit</Text>
        <Image source={require('@/assets/images/logo_new.svg')} style={{ width: 36, height: 36 }} contentFit="contain" />
      </View>
      
      {!walletReady ? (
         <Text style={styles.subtitle}>Connecting to Network...</Text>
      ) : (
         <View style={styles.card}>
           
           <Text style={styles.sourceLabel}>Network</Text>
           <View style={styles.networkToggleContainer}>
             <TouchableOpacity style={[styles.toggleBtn, network === 'lightning' && styles.activeSparkBtn]} onPress={() => { Haptics.selectionAsync(); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setNetwork('lightning'); }}>
               <Text style={[styles.toggleText, network === 'lightning' && styles.activeText]}>Lightning</Text>
             </TouchableOpacity>
             <TouchableOpacity style={[styles.toggleBtn, network === 'solana' && styles.activeAtomiqBtn]} onPress={() => { Haptics.selectionAsync(); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setNetwork('solana'); }}>
               <Text style={[styles.toggleText, network === 'solana' && styles.activeText]}>Solana</Text>
             </TouchableOpacity>
           </View>

           {network === 'solana' ? (
             <View style={styles.invoiceContainer}>
                <Text style={styles.cardDesc}>Send SOL or SPL Tokens to your base layer address.</Text>
                <TouchableOpacity 
                   style={styles.qrWrapper}
                   onPress={() => copyToClipboard(solanaAddress || '', 'Solana Address')}
                >
                  <QRCode
                    value={solanaAddress || 'loading'}
                    size={280}
                    color="#000000"
                    backgroundColor="#ffffff"
                    ecl="M"
                  />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => copyToClipboard(solanaAddress || '', 'Solana Address')} style={styles.copyBox}>
                   <Text style={[styles.invoiceText, { marginBottom: 0, marginRight: 12 }]}>{solanaAddress}</Text>
                   <Ionicons name="copy-outline" size={20} color="#14F195" />
                </TouchableOpacity>
             </View>
           ) : (
            !invoice ? (
              <View style={styles.inputContainer}>
                 <Text style={styles.cardDesc}>Enter an amount to create a Lightning Invoice.</Text>
                 <View style={styles.toggleRow}>
                   <Text style={[styles.toggleLabel, !isEur && styles.activeLabel]}>SAT</Text>
                   <Switch 
                     value={isEur} onValueChange={setIsEur} 
                     trackColor={{ false: '#333', true: '#ffb000' }} thumbColor="#fff"
                   />
                   <Text style={[styles.toggleLabel, isEur && styles.activeLabel]}>EUR</Text>
                 </View>
 
                 <TextInput 
                   style={styles.input} keyboardType="numeric" value={amountStr}
                   onChangeText={setAmountStr} placeholder="0" placeholderTextColor="#666"
                 />
                 <Text style={styles.equivalent}>{equivalentText}</Text>
 
                 <TouchableOpacity style={styles.button} onPress={handleGenerateInvoice} disabled={loading}>
                   {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Generate QR Code</Text>}
                 </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.invoiceContainer}>
                 <Text style={styles.cardDesc}>Awaiting lightning settlement...</Text>
                 <TouchableOpacity 
                    style={styles.qrWrapper}
                    onPress={() => copyToClipboard(invoice, 'Lightning Invoice')}
                 >
                   <QRCode
                     value={invoice}
                     size={280}
                     color="#000000"
                     backgroundColor="#ffffff"
                     ecl="M"
                   />
                 </TouchableOpacity>
                 
                 <TouchableOpacity onPress={() => copyToClipboard(invoice, 'Lightning Invoice')} style={[styles.copyBox, { marginBottom: 16 }]}>
                    <Text style={[styles.invoiceText, { flex: 1, marginRight: 12 }]} numberOfLines={1} ellipsizeMode="tail">{invoice.slice(0, 30)}...</Text>
                    <Ionicons name="copy-outline" size={20} color="#ffb000" />
                 </TouchableOpacity>

                 <ActivityIndicator color="#6b5cc3" style={{ marginBottom: 16 }} />
                 <TouchableOpacity style={styles.newButton} onPress={resetState}>
                   <Text style={styles.newButtonText}>Cancel & Generate New</Text>
                 </TouchableOpacity>
              </View>
            )
           )}
         </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0c', paddingHorizontal: 16 },
  header: { marginTop: 60, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 32, fontWeight: '800', color: '#fff' },
  subtitle: { color: '#8f8f9d' },
  card: { backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 20, padding: 24, alignItems: 'center' },
  cardDesc: { color: '#a0a0ab', marginBottom: 24, textAlign: 'center' },
  inputContainer: { width: '100%', alignItems: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  toggleLabel: { color: '#8f8f9d', marginHorizontal: 8, fontWeight: '600' },
  activeLabel: { color: '#fff' },
  input: { backgroundColor: '#1a1a1f', color: '#fff', fontSize: 36, fontWeight: '700', textAlign: 'center', width: '80%', paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  equivalent: { color: '#a0a0ab', marginTop: 8, marginBottom: 24, fontSize: 16 },
  button: { backgroundColor: '#ffb000', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, width: '100%', alignItems: 'center' },
  buttonText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  invoiceContainer: { width: '100%', alignItems: 'center' },
  qrWrapper: { padding: 16, backgroundColor: '#ffffff', borderRadius: 16, marginBottom: 16, borderWidth: 4, borderColor: '#ffffff' },
  invoiceText: { color: '#8f8f9d', fontFamily: 'monospace', textAlign: 'center' },
  copyBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, marginTop: 8 },
  newButton: { padding: 10 },
  newButtonText: { color: '#ff4444', fontWeight: 'bold' },
  successCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#ffb000', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  checkmark: { color: '#000', fontSize: 32, fontWeight: 'bold' },
  successTitle: { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 8 },
  successSubtitle: { color: '#8f8f9d', marginBottom: 40 },
  sourceLabel: { color: '#8f8f9d', fontSize: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, alignSelf: 'flex-start' },
  networkToggleContainer: { flexDirection: 'row', marginBottom: 24, backgroundColor: '#1a1a1f', borderRadius: 12, padding: 4, width: '100%' },
  toggleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
  activeSparkBtn: { backgroundColor: '#F7931A' },
  activeAtomiqBtn: { backgroundColor: '#14F195' },
  toggleText: { color: '#8f8f9d', fontWeight: '700' },
  activeText: { color: '#000' },
});
