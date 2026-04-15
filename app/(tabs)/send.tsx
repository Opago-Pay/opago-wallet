import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { Image } from 'expo-image';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { getAtomiqQuote, executeAtomiqQuote } from '@/lib/atomiq';
import { addTransaction } from '@/lib/database';
import { resolveLightningAddress, fetchInvoiceFromLNURLP, decodeLNURL } from '@/lib/lnurl';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

const RATES = {
  EUR: 1350,   // 1 EUR = 1,350 SATS 
  SOL: 231500, // 1 SOL = 231,500 SATS
  SAT: 1
};

export default function SendScreen() {
  const router = useRouter();
  const { sparkWallet, solanaKeypair, walletReady, loadOrGenerateWallet } = useWalletAuth();
  
  const [destination, setDestination] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [currency, setCurrency] = useState<'SAT' | 'EUR' | 'SOL'>('SAT');
  const [source, setSource] = useState<'spark' | 'solana' | 'usdc'>('spark');
  
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('Execute Payload');
  
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(false);

  const [successPreimage, setSuccessPreimage] = useState<string | null>(null);

  // Quote State
  const [quoteData, setQuoteData] = useState<any>(null);
  const [quoteTimer, setQuoteTimer] = useState(30);

  useEffect(() => {
    if (!walletReady) {
      loadOrGenerateWallet();
    }
  }, [walletReady]);

  // Quote Timer Effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (quoteData && quoteTimer > 0) {
      interval = setInterval(() => setQuoteTimer(t => t - 1), 1000);
    } else if (quoteTimer === 0 && quoteData) {
      setQuoteData(null);
      Alert.alert("Expired", "Swap quote expired. Please re-calculate.");
    }
    return () => clearInterval(interval);
  }, [quoteData, quoteTimer]);

  const openQrScanner = async () => {
    if (Platform.OS === 'web') {
      Alert.alert("Camera Error", "Compile to Android Native for camera access.");
      return;
    }
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) return;
    }
    setIsScanning(true);
  };

  const computeSatoshis = (): number => {
    const cleanNum = parseFloat(inputValue);
    if (isNaN(cleanNum)) return 0;
    if (currency === 'EUR') return Math.floor(cleanNum * RATES.EUR);
    if (currency === 'SOL') return Math.floor(cleanNum * RATES.SOL);
    return Math.floor(cleanNum);
  };

  const handleCalculateOrSend = async () => {
    if (!destination.trim()) {
      Alert.alert("Error", "Enter a BOLT-11 invoice or Lightning Address.");
      return;
    }
    const parsedAmount = computeSatoshis();
    if (parsedAmount <= 0) {
      Alert.alert("Error", "Enter a valid amount.");
      return;
    }
    
    setLoading(true);
    setStatusText('Resolving Address...');

    try {
      let cleanInput = destination.trim().toLowerCase();
      
      // Global URI and BIP21 Extractor
      if (cleanInput.includes('lightning=')) {
         cleanInput = cleanInput.split('lightning=')[1].split('&')[0];
      }
      cleanInput = cleanInput.replace(/^lightning:/i, '').replace(/^\/\//, '');

      let finalBolt11 = cleanInput;

      // Handle Lightning Addresses and LNURL Payloads
      if (cleanInput.includes('@')) {
         const lnurlpInfo = await resolveLightningAddress(cleanInput);
         finalBolt11 = await fetchInvoiceFromLNURLP(lnurlpInfo.callback, parsedAmount);
      } else if (cleanInput.startsWith('lnurl1')) {
         setStatusText('Negotiating LNURL...');
         const callbackUrl = decodeLNURL(cleanInput);
         finalBolt11 = await fetchInvoiceFromLNURLP(callbackUrl, parsedAmount);
      }
      
      // Hunt for exact valid L2 prefix to truncate any remaining URI dirt from the finalized payload
      const prefixMatch = finalBolt11.match(/(lnbc|lntb|lnsb|lnbcrt)/);
      if (prefixMatch && !finalBolt11.startsWith(prefixMatch[1])) {
         finalBolt11 = finalBolt11.substring(finalBolt11.indexOf(prefixMatch[1]));
      }

      if (!prefixMatch) {
         throw new Error(`The scanned code is not a valid Lightning invoice. Found: ( ${finalBolt11.substring(0, 15)}... )`);
      }

      if (source === 'spark') {
        setStatusText("Paying Invoice...");
        if (!sparkWallet) throw new Error("Spark wallet not initialized");
        const realBal = Number((await sparkWallet.getBalance()).balance) || 1000;
        const dynamicFee = Math.max(10, Math.floor(realBal - parsedAmount));
        const res = await sparkWallet.payLightningInvoice({ invoice: finalBolt11, maxFeeSats: dynamicFee });
        await addTransaction('outgoing', parsedAmount, 'SAT');
        setSuccessPreimage(res.preimage || "Network success");
      } else {
        setStatusText("Fetching Atomiq Quote...");
        if (!sparkWallet || !solanaKeypair) throw new Error("Bridge components missing");
        
        const intermediaryInvoiceRes = await sparkWallet.createLightningInvoice({ 
             amountSats: parsedAmount, 
             memo: "Internal Bridge" 
        });
        const internalBolt11 = intermediaryInvoiceRes.invoice.encodedInvoice || intermediaryInvoiceRes.invoice;
        
        const requestAsset = source === 'usdc' ? 'USDC' : 'SOL';
        const { swap, solanaSigner } = await getAtomiqQuote(solanaKeypair, internalBolt11, parsedAmount, requestAsset);
        
        setQuoteData({ swap, solanaSigner, finalBolt11, parsedAmount, sourceAsset: requestAsset });
        setQuoteTimer(30);
      }
    } catch (e: any) {
      let friendlyMsg = e.message || "Execution failed.";
      if (friendlyMsg.includes("Total target amount exceeds available balance")) {
         friendlyMsg = "Insufficient Lightning balance. Please deposit Sats into your Spark wallet first.";
      } else if (friendlyMsg.includes("ALREADY_EXISTS") || friendlyMsg.includes("preimage request already exists")) {
         friendlyMsg = "This invoice has already been paid or is currently pending. Lightning invoices are strictly single-use to prevent double-spending. Please generate a new invoice in your receiving app.";
      }
      Alert.alert("Transaction Failed", friendlyMsg);
    } finally {
      if (source === 'spark' || !quoteData) {
         setLoading(false);
         setStatusText('Execute Payload');
      }
    }
  };

  const confirmAtomiqSwap = async () => {
    if (!quoteData) return;
    const tokenSymbol = quoteData.sourceAsset || 'SOL';
    const rawCost = quoteData.swap.getInput()?.amount || 0;
    const decimals = tokenSymbol === 'USDC' ? 1e6 : 1e9;
    const costFormatted = (rawCost / decimals).toFixed(6);

    Alert.alert(
      "Privy Signature Required",
      `Network: Solana\nContract: Atomiq HTLC Bridge\nCost: ${costFormatted} ${tokenSymbol}\n\nDo you want to sign and broadcast this transaction using your embedded wallet?`,
      [
        { text: "Reject", style: "cancel" },
        { 
          text: "Sign & Execute",
          onPress: async () => {
            setLoading(true);
            try {
              setStatusText("Broadcasting Solana Tx...");
              await executeAtomiqQuote(quoteData.swap, quoteData.solanaSigner);
              
              setStatusText("Finalizing LN Hop...");
              if (!sparkWallet) throw new Error("Spark destroyed");
              const realBal = Number((await sparkWallet.getBalance()).balance) || 1000;
              const dynamicFee = Math.max(10, Math.floor(realBal - quoteData.parsedAmount));
              const res = await sparkWallet.payLightningInvoice({ invoice: quoteData.finalBolt11, maxFeeSats: dynamicFee });
              
              await addTransaction('outgoing', quoteData.parsedAmount, tokenSymbol);
              setQuoteData(null);
              setSuccessPreimage(res.preimage || "Network success");
            } catch (e: any) {
              let friendlyMsg = e.message || "Failed during dual-hop transfer.";
              if (friendlyMsg.includes("Total target amount exceeds available balance")) {
                 friendlyMsg = "Insufficient Lightning liquidity to finalize the bridge swap. Please fund your L2 Node.";
              } else if (friendlyMsg.includes("ALREADY_EXISTS") || friendlyMsg.includes("preimage request already exists")) {
                 friendlyMsg = "This invoice has already been paid or is currently pending. Lightning invoices are strictly single-use. Please generate a new invoice.";
              }
              Alert.alert("Bridge Fault", friendlyMsg);
            } finally {
              setLoading(false);
              setStatusText('Execute Payload');
            }
          }
        }
      ]
    );
  };

  if (isScanning) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
         <CameraView 
            style={StyleSheet.absoluteFillObject}
            onBarcodeScanned={({ data }) => {
              if (isScanning) {
                setDestination(data.replace(/^lightning:/i, '').replace(/^lightnings:/i, '').toLowerCase());
                setIsScanning(false);
              }
            }}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
         />
         <TouchableOpacity 
             style={{ position: 'absolute', top: 50, right: 20, backgroundColor: 'rgba(0,0,0,0.5)', padding: 12, borderRadius: 20 }}
             onPress={() => setIsScanning(false)}>
            <Text style={{ color: '#fff', fontSize: 16 }}>Cancel</Text>
         </TouchableOpacity>
      </View>
    );
  }

  const resetState = () => {
    setSuccessPreimage(null);
    setDestination('');
    setInputValue('');
  };

  if (successPreimage) {
     return (
       <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
         <View style={styles.successCircle}><Text style={styles.checkmark}>✓</Text></View>
         <Text style={styles.successTitle}>Payment Sent!</Text>
         <Text style={styles.successSubtitle}>Cryptographic Proof (Preimage)</Text>
         <View style={styles.preimageBox}>
            <Text style={styles.preimageText}>{successPreimage}</Text>
         </View>
         <TouchableOpacity style={styles.button} onPress={() => { resetState(); router.push('/'); }}>
            <Text style={styles.buttonText}>Return to Dashboard</Text>
         </TouchableOpacity>
         <TouchableOpacity style={{ marginTop: 24 }} onPress={resetState}>
            <Text style={{ color: '#6b5cc3', fontWeight: 'bold' }}>Send Another Payment</Text>
         </TouchableOpacity>
       </View>
     );
  }

  if (quoteData) {
     const solCost = (quoteData.swap.getInput()?.amount || 0) / 1e9;
     return (
       <View style={[styles.container, { justifyContent: 'center' }]}>
         <Text style={styles.quoteTitle}>Review Atomiq Quote</Text>
         <Text style={styles.quoteSubtitle}>Cross-chain swap expires in {quoteTimer}s</Text>
         
         <View style={styles.quoteBox}>
            <View style={styles.quoteRow}><Text style={styles.quoteLabel}>Sending:</Text><Text style={styles.quoteVal}>{quoteData.parsedAmount.toLocaleString()} SATS</Text></View>
            <View style={styles.quoteRow}><Text style={styles.quoteLabel}>Cost:</Text><Text style={styles.quoteVal}>{costFormatted ? costFormatted : "..."} {tokenSymbol}</Text></View>
         </View>

         <TouchableOpacity style={styles.quoteButton} onPress={confirmAtomiqSwap} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Confirm Bridge execution</Text>}
         </TouchableOpacity>
         <TouchableOpacity style={{ alignItems: 'center', marginTop: 24 }} onPress={() => setQuoteData(null)}>
            <Text style={{ color: '#ff4444', fontWeight: 'bold' }}>Cancel Quote</Text>
         </TouchableOpacity>
       </View>
     );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Send & Bridge</Text>
        <Image source={require('@/assets/images/logo_new.svg')} style={{ width: 36, height: 36 }} contentFit="contain" />
      </View>
      
      {!walletReady ? (
         <Text style={styles.subtitle}>Wallet initializing...</Text>
      ) : (
         <View style={styles.card}>
           
           <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.sourceLabel}>Destination</Text>
              <TouchableOpacity onPress={openQrScanner} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 176, 0, 0.1)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255, 176, 0, 0.4)' }}>
                  <Ionicons name="scan-outline" size={16} color="#ffb000" style={{ marginRight: 6 }} />
                  <Text style={{ color: '#ffb000', fontWeight: '800', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Scan</Text>
              </TouchableOpacity>
           </View>
           <TextInput 
             style={styles.input} placeholder="BOLT-11 or LN Address" placeholderTextColor="#666"
             value={destination} onChangeText={setDestination} autoCapitalize="none" multiline
           />

           <Text style={[styles.sourceLabel, {marginTop: 12}]}>Amount</Text>
           <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 24}}>
             <TextInput 
               style={[styles.inputAmount, {flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0}]}
               placeholder="0.00" placeholderTextColor="#666" value={inputValue} keyboardType="numeric" onChangeText={setInputValue}
             />
             <View style={styles.currencyToggleMatrix}>
               <TouchableOpacity onPress={() => setCurrency('EUR')} style={[styles.currencyPill, currency === 'EUR' && styles.currencyActive]}>
                 <Text style={[styles.currencyPillText, currency === 'EUR' && styles.currencyActiveText]}>EUR</Text>
               </TouchableOpacity>
               <TouchableOpacity onPress={() => setCurrency('SAT')} style={[styles.currencyPill, currency === 'SAT' && styles.currencyActive]}>
                 <Text style={[styles.currencyPillText, currency === 'SAT' && styles.currencyActiveText]}>SAT</Text>
               </TouchableOpacity>
             </View>
           </View>

           <Text style={styles.sourceLabel}>Funding Source</Text>
           <View style={styles.toggleContainer}>
             <TouchableOpacity style={[styles.toggleBtn, source === 'spark' && styles.activeSparkBtn]} onPress={() => setSource('spark')}>
               <Text style={[styles.toggleText, source === 'spark' && styles.activeText]}>Lightning</Text>
             </TouchableOpacity>
             <TouchableOpacity style={[styles.toggleBtn, source === 'solana' && styles.activeSolanaBtn]} onPress={() => setSource('solana')}>
               <Text style={[styles.toggleText, source === 'solana' && styles.activeText]}>Solana</Text>
             </TouchableOpacity>
             <TouchableOpacity style={[styles.toggleBtn, source === 'usdc' && styles.activeUsdcBtn]} onPress={() => setSource('usdc')}>
               <Text style={[styles.toggleText, source === 'usdc' && styles.activeText]}>USDC</Text>
             </TouchableOpacity>
           </View>

           <TouchableOpacity style={styles.button} onPress={handleCalculateOrSend} disabled={loading}>
             {loading ? (
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                 <ActivityIndicator color="#000" style={{marginRight: 8}} />
                 <Text style={styles.buttonText}>{statusText}</Text>
                </View>
             ) : (
                <Text style={styles.buttonText}>{source !== 'spark' ? 'Review Swap Quote' : 'Pay Invoice Instantly'}</Text>
             )}
           </TouchableOpacity>
         </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0c', paddingHorizontal: 16 },
  header: { marginTop: 60, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 32, fontWeight: '800', color: '#fff' },
  closeBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  subtitle: { color: '#8f8f9d' },
  card: { backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 20, padding: 24, width: '100%'},
  input: { backgroundColor: '#1a1a1f', color: '#fff', fontSize: 16, padding: 16, borderRadius: 12, marginBottom: 12, minHeight: 80, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  inputAmount: { backgroundColor: '#1a1a1f', color: '#fff', fontSize: 16, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  currencyToggleMatrix: { flexDirection: 'row', backgroundColor: '#1a1a1f', borderTopRightRadius: 12, borderBottomRightRadius: 12, height: 55, borderWidth: 1, borderLeftWidth: 0, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', paddingHorizontal: 4 },
  currencyPill: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6 },
  currencyActive: { backgroundColor: '#333' },
  currencyPillText: { color: '#8f8f9d', fontWeight: '700', fontSize: 12 },
  currencyActiveText: { color: '#fff' },
  sourceLabel: { color: '#8f8f9d', fontSize: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  toggleContainer: { flexDirection: 'row', marginBottom: 32, backgroundColor: '#1a1a1f', borderRadius: 12, padding: 4 },
  toggleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
  activeSparkBtn: { backgroundColor: '#F7931A' },
  activeSolanaBtn: { backgroundColor: '#14F195' },
  activeUsdcBtn: { backgroundColor: '#2775CA' },
  toggleText: { color: '#8f8f9d', fontWeight: '700' },
  activeText: { color: '#000' },
  button: { backgroundColor: '#6b5cc3', paddingVertical: 16, borderRadius: 12, alignItems: 'center', width: '100%' },
  buttonText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  successCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#ffb000', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  checkmark: { color: '#000', fontSize: 32, fontWeight: 'bold' },
  successTitle: { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 8 },
  successSubtitle: { color: '#8f8f9d', marginBottom: 20 },
  preimageBox: { backgroundColor: '#1a1a1f', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', width: '100%', marginBottom: 40 },
  preimageText: { color: '#6b5cc3', fontFamily: 'monospace', textAlign: 'center', fontSize: 12 },
  quoteTitle: { color: '#fff', fontSize: 32, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  quoteSubtitle: { color: '#8f8f9d', textAlign: 'center', marginBottom: 32 },
  quoteBox: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 24, marginBottom: 40, borderWidth: 1, borderColor: '#ffb000' },
  quoteRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 8 },
  quoteLabel: { color: '#8f8f9d', fontSize: 18 },
  quoteVal: { color: '#fff', fontSize: 18, fontWeight: '700' },
  quoteButton: { backgroundColor: '#ffb000', paddingVertical: 16, borderRadius: 12, alignItems: 'center', width: '100%' }
});
