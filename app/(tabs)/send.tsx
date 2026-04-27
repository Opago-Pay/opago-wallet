import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, Platform, LayoutAnimation } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { getAtomiqQuote, executeAtomiqQuote } from '@/lib/atomiq';
import { addTransaction } from '@/lib/database';
import { resolveLightningAddress, fetchInvoiceFromLNURLP, decodeLNURL, resolveLNURL, generateEidasPayerData } from '@/lib/lnurl';
import { resolveOcpUrl, fetchOcpOptions, fetchOcpExecutionPayload } from '@/lib/ocp';
import { useRouter, useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Connection, PublicKey } from '@solana/web3.js';

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
  
  const [balances, setBalances] = useState({ spark: 0, sol: 0, usdc: 0 });
  
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('Execute Payload');
  
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(false);

  const [successPreimage, setSuccessPreimage] = useState<string | null>(null);

  // Quote State
  const [ocpData, setOcpData] = useState<any>(null);
  const [selectedOcpOption, setSelectedOcpOption] = useState<any>(null);
  const [quoteData, setQuoteData] = useState<any>(null);
  const [quoteTimer, setQuoteTimer] = useState(30);
  const [pendingEidasInfo, setPendingEidasInfo] = useState<{lnurlpInfo: any, amountToPay: number} | null>(null);
  const [isNfcScanning, setIsNfcScanning] = useState(false);

  useEffect(() => {
    if (!walletReady) {
      loadOrGenerateWallet();
    } else {
      const fetchBals = async () => {
        try {
          if (sparkWallet) {
            const balData = await sparkWallet.getBalance();
            const settled = Number(balData.balance) || 0;
            const incoming = Number(balData.satsBalance?.incoming) || 0;
            setBalances(b => ({ ...b, spark: settled + incoming }));
          }
          if (solanaKeypair) {
             const connection = new globalThis.solanaWeb3.Connection("https://solana-rpc.publicnode.com");
             const pubkey = solanaKeypair.publicKey;
             const solBal = await connection.getBalance(pubkey);
             setBalances(b => ({ ...b, sol: solBal / 1e9 }));
             
             const USDC_MINT = new globalThis.solanaWeb3.PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
             const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, { mint: USDC_MINT });
             if (tokenAccounts.value.length > 0) {
                const usdcAmount = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0;
                setBalances(b => ({ ...b, usdc: usdcAmount }));
             }
          }
        } catch(e) {}
      };
      // Polyfill solanaWeb3 global if needed, although we can just import Connection
      fetchBals();
    }
  }, [walletReady, sparkWallet, solanaKeypair]);

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

  const executePaymentWithBolt11 = async (finalBolt11: string, parsedAmount: number) => {
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
        
        const requestAsset = source === 'usdc' ? 'USDC' : 'SOL';
        const { swap, solanaSigner } = await getAtomiqQuote(solanaKeypair, finalBolt11, parsedAmount, requestAsset);
        
        setQuoteData({ swap, solanaSigner, finalBolt11, parsedAmount, sourceAsset: requestAsset });
        setQuoteTimer(30);
      }
  };

  const executeEidasPayment = async () => {
    if (!pendingEidasInfo) return;
    setLoading(true);
    setStatusText("Signing eIDAS Data...");
    try {
      const { lnurlpInfo, amountToPay } = pendingEidasInfo;
      const payerData = await generateEidasPayerData(solanaKeypair);
      
      setStatusText("Fetching Invoice...");
      const finalBolt11 = await fetchInvoiceFromLNURLP(lnurlpInfo.callback, amountToPay, payerData);
      
      await executePaymentWithBolt11(finalBolt11, amountToPay);
    } catch (e: any) {
      let friendlyMsg = e.message || "eIDAS Execution failed.";
      Alert.alert("eIDAS Failed", friendlyMsg);
      setLoading(false);
      setStatusText('Execute Payload');
      setPendingEidasInfo(null);
    }
  };

  const handleCalculateOrSend = async () => {
    if (!destination.trim()) {
      Alert.alert("Error", "Enter a BOLT-11 invoice or Lightning Address.");
      return;
    }
    
    let rawInput = destination.trim();
    let cleanInput = rawInput.toLowerCase();
    
    setStatusText('Resolving Protocol...');
    setLoading(true);

    try {
      const apiUrl = await resolveOcpUrl(rawInput);
      if (apiUrl) {
         try {
            const ocpOpts = await fetchOcpOptions(apiUrl);
            setOcpData({ ...ocpOpts, callbackUrl: apiUrl });
            setLoading(false);
            setStatusText('Execute Payload');
            return;
         } catch(e) {
            console.log("Not a valid OCP endpoint, falling back to standard LNURL.");
         }
      }
    } catch(e) {}

    // Global URI and BIP21 Extractor
    if (cleanInput.includes('lightning=')) {
       cleanInput = cleanInput.split('lightning=')[1].split('&')[0];
    }
    cleanInput = cleanInput.replace(/^lightning:/i, '').replace(/^\/\//, '');

    const parsedAmount = computeSatoshis();
    const isInvoice = cleanInput.startsWith('lnbc');
    const isLNURL = cleanInput.startsWith('lnurl1') || cleanInput.includes('@');
    
    if (parsedAmount <= 0 && !isInvoice && !isLNURL) {
      Alert.alert("Error", "Enter a valid amount.");
      return;
    }
    
    setLoading(true);
    setStatusText('Resolving Address...');

    try {
      let finalBolt11 = cleanInput;

      // Handle Lightning Addresses and LNURL Payloads
      if (cleanInput.includes('@')) {
         const lnurlpInfo = await resolveLightningAddress(cleanInput);
         let amountToPay = parsedAmount;
         if (amountToPay <= 0) {
            if (lnurlpInfo.minSendable && lnurlpInfo.minSendable === lnurlpInfo.maxSendable) {
               amountToPay = Math.floor(lnurlpInfo.minSendable / 1000);
            } else {
               throw new Error("Please enter a valid amount for this payment.");
            }
         }
         if (lnurlpInfo.compliance?.isSubjectToTravelRule && lnurlpInfo.payerData?.compliance?.mandatory) {
            setPendingEidasInfo({ lnurlpInfo, amountToPay });
            setLoading(false);
            setStatusText('Execute Payload');
            return;
         }
         finalBolt11 = await fetchInvoiceFromLNURLP(lnurlpInfo.callback, amountToPay);
      } else if (cleanInput.startsWith('lnurl1')) {
         setStatusText('Negotiating LNURL...');
         const lnurlpInfo = await resolveLNURL(cleanInput);
         let amountToPay = parsedAmount;
         if (amountToPay <= 0) {
            if (lnurlpInfo.minSendable && lnurlpInfo.minSendable === lnurlpInfo.maxSendable) {
               amountToPay = Math.floor(lnurlpInfo.minSendable / 1000);
            } else {
               throw new Error("Please enter a valid amount for this payment.");
            }
         }
         if (lnurlpInfo.compliance?.isSubjectToTravelRule && lnurlpInfo.payerData?.compliance?.mandatory) {
            setPendingEidasInfo({ lnurlpInfo, amountToPay });
            setLoading(false);
            setStatusText('Execute Payload');
            return;
         }
         finalBolt11 = await fetchInvoiceFromLNURLP(lnurlpInfo.callback, amountToPay);
      }
      
      await executePaymentWithBolt11(finalBolt11, parsedAmount);
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
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
              
              await addTransaction('outgoing', quoteData.parsedAmount, tokenSymbol);
              setQuoteData(null);
              setSuccessPreimage("Cross-chain swap initiated successfully.");
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (e: any) {
              let friendlyMsg = e.message || "Failed during dual-hop transfer.";
              if (friendlyMsg.includes("Total target amount exceeds available balance")) {
                 friendlyMsg = "Insufficient Lightning liquidity to finalize the bridge swap. Please fund your L2 Node.";
              } else if (friendlyMsg.includes("ALREADY_EXISTS") || friendlyMsg.includes("preimage request already exists")) {
                 friendlyMsg = "This invoice has already been paid or is currently pending. Lightning invoices are strictly single-use. Please generate a new invoice.";
              }
              Alert.alert("Bridge Fault", friendlyMsg);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
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
    setOcpData(null);
    setSelectedOcpOption(null);
    setPendingEidasInfo(null);
  };

  useFocusEffect(
    useCallback(() => {
      // Return a cleanup function that runs when the screen loses focus (user switches tabs)
      return () => {
        resetState();
      };
    }, [])
  );

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

  if (pendingEidasInfo) {
    return (
       <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
         <Ionicons name="id-card-outline" size={80} color={isNfcScanning ? "#6b5cc3" : "#ffb000"} style={{ marginBottom: 24 }} />
         <Text style={[styles.quoteTitle, { textAlign: 'center' }]}>eIDAS Verification</Text>
         <Text style={[styles.quoteSubtitle, { textAlign: 'center', marginBottom: 40 }]}>The merchant requires Travel Rule compliance data. Please scan your eIDAS ID card.</Text>
         
         {isNfcScanning ? (
            <View style={{ alignItems: 'center', marginTop: 20 }}>
               <ActivityIndicator size="large" color="#6b5cc3" />
               <Text style={{ color: '#fff', marginTop: 16, fontSize: 16, fontWeight: 'bold' }}>Reading NFC Chip...</Text>
            </View>
         ) : (
            <TouchableOpacity style={[styles.button, { backgroundColor: '#6b5cc3', width: '100%' }]} onPress={() => {
               setIsNfcScanning(true);
               Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
               setTimeout(() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  setIsNfcScanning(false);
                  executeEidasPayment();
               }, 2000);
            }} disabled={loading}>
               <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="wifi-outline" size={24} color="#fff" style={{ marginRight: 8, transform: [{rotate: '90deg'}] }} />
                  <Text style={styles.buttonText}>Tap ID Card</Text>
               </View>
            </TouchableOpacity>
         )}

         {!isNfcScanning && (
            <TouchableOpacity style={{ alignItems: 'center', marginTop: 24 }} onPress={() => setPendingEidasInfo(null)}>
               <Text style={{ color: '#ff4444', fontWeight: 'bold' }}>Cancel Payment</Text>
            </TouchableOpacity>
         )}
       </View>
    );
  }

  if (quoteData) {
     const tokenSymbol = quoteData.sourceAsset || 'SOL';
     const rawCost = quoteData.swap.getInput()?.amount || 0;
     const decimals = tokenSymbol === 'USDC' ? 1e6 : 1e9;
     const costFormatted = (rawCost / decimals).toFixed(6);
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

  if (ocpData) {
    const handleOcpExecute = async () => {
       if (!selectedOcpOption) return;
       setLoading(true);
       try {
          const payload = await fetchOcpExecutionPayload(ocpData.callbackUrl, selectedOcpOption.method, selectedOcpOption.asset);
          if (payload.pr && sparkWallet) {
             const res = await sparkWallet.payLightningInvoice({ invoice: payload.pr, maxFeeSats: 100 });
             await addTransaction('outgoing', selectedOcpOption.amount, 'SAT');
             setSuccessPreimage(res.preimage || "OCP Lightning Success");
          } else if (payload.destination && payload.amount && solanaKeypair) {
             // For the hackathon, simulate the Solana execution if the payload returns SOL parameters
             const connection = new globalThis.solanaWeb3.Connection("https://solana-rpc.publicnode.com");
             const tx = new globalThis.solanaWeb3.Transaction().add(
                globalThis.solanaWeb3.SystemProgram.transfer({
                   fromPubkey: solanaKeypair.publicKey,
                   toPubkey: new globalThis.solanaWeb3.PublicKey(payload.destination),
                   lamports: Math.floor(payload.amount * 1e9)
                })
             );
             tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
             tx.feePayer = solanaKeypair.publicKey;
             tx.sign(solanaKeypair);
             const sig = await connection.sendRawTransaction(tx.serialize());
             await addTransaction('outgoing', payload.amount, payload.asset || 'SOL');
             setSuccessPreimage(sig);
          }
       } catch(e: any) {
          Alert.alert("OCP Execution Failed", e.message || "Could not finalize OpenCryptoPay transaction.");
       } finally {
          setLoading(false);
       }
    };

    return (
       <View style={[styles.container, { justifyContent: 'center' }]}>
         <Text style={styles.quoteTitle}>{ocpData.merchantName || "Merchant Payment"}</Text>
         <Text style={styles.quoteSubtitle}>Total: {ocpData.fiatAmount} {ocpData.fiatCurrency}</Text>
         
         <View style={{ marginBottom: 32 }}>
            <Text style={styles.sourceLabel}>Select Payment Method</Text>
            {ocpData.transferAmounts?.map((opt: any, idx: number) => (
               <TouchableOpacity 
                  key={idx} 
                  style={[styles.ocpOptionCard, selectedOcpOption === opt && styles.ocpOptionSelected]}
                  onPress={() => { Haptics.selectionAsync(); setSelectedOcpOption(opt); }}
               >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                     <Image source={{ uri: opt.asset === 'SOL' ? 'https://cryptologos.cc/logos/solana-sol-logo.png' : (opt.asset === 'USDC' ? 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png' : 'https://cryptologos.cc/logos/bitcoin-btc-logo.png') }} style={{ width: 32, height: 32, marginRight: 12 }} />
                     <View>
                        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>{opt.chain} {opt.asset}</Text>
                        <Text style={{ color: '#8f8f9d', fontSize: 14 }}>Network Fee: {opt.fee} {opt.asset}</Text>
                     </View>
                  </View>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>{opt.amount} {opt.asset}</Text>
               </TouchableOpacity>
            ))}
         </View>

         <TouchableOpacity style={[styles.button, !selectedOcpOption && { opacity: 0.5 }]} onPress={handleOcpExecute} disabled={loading || !selectedOcpOption}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Pay Now</Text>}
         </TouchableOpacity>
         <TouchableOpacity style={{ alignItems: 'center', marginTop: 24 }} onPress={() => setOcpData(null)}>
            <Text style={{ color: '#ff4444', fontWeight: 'bold' }}>Cancel Payment</Text>
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
              <View style={{ flexDirection: 'row' }}>
                 {(destination.length > 0 || inputValue.length > 0) && (
                    <TouchableOpacity onPress={resetState} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 68, 68, 0.1)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255, 68, 68, 0.4)', marginRight: 8 }}>
                        <Ionicons name="trash-outline" size={16} color="#ff4444" style={{ marginRight: 6 }} />
                        <Text style={{ color: '#ff4444', fontWeight: '800', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Clear</Text>
                    </TouchableOpacity>
                 )}
                 <TouchableOpacity onPress={openQrScanner} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 176, 0, 0.1)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255, 176, 0, 0.4)' }}>
                     <Ionicons name="scan-outline" size={16} color="#ffb000" style={{ marginRight: 6 }} />
                     <Text style={{ color: '#ffb000', fontWeight: '800', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Scan</Text>
                 </TouchableOpacity>
              </View>
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
               <TouchableOpacity onPress={() => { Haptics.selectionAsync(); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setCurrency('EUR'); }} style={[styles.currencyPill, currency === 'EUR' && styles.currencyActive]}>
                 <Text style={[styles.currencyPillText, currency === 'EUR' && styles.currencyActiveText]}>EUR</Text>
               </TouchableOpacity>
               <TouchableOpacity onPress={() => { Haptics.selectionAsync(); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setCurrency('SAT'); }} style={[styles.currencyPill, currency === 'SAT' && styles.currencyActive]}>
                 <Text style={[styles.currencyPillText, currency === 'SAT' && styles.currencyActiveText]}>SAT</Text>
               </TouchableOpacity>
             </View>
           </View>

           <Text style={styles.sourceLabel}>Funding Source</Text>
           <View style={styles.toggleContainer}>
             <TouchableOpacity style={[styles.toggleBtn, source === 'spark' && styles.activeSparkBtn]} onPress={() => { Haptics.selectionAsync(); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setSource('spark'); }}>
               <Text style={[styles.toggleText, source === 'spark' && styles.activeText]}>Lightning</Text>
               <Text style={[styles.balanceText, source === 'spark' && styles.activeBalanceText]}>{balances.spark.toLocaleString()} SAT</Text>
             </TouchableOpacity>
             <TouchableOpacity style={[styles.toggleBtn, source === 'solana' && styles.activeSolanaBtn]} onPress={() => { Haptics.selectionAsync(); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setSource('solana'); }}>
               <Text style={[styles.toggleText, source === 'solana' && styles.activeText]}>Solana</Text>
               <Text style={[styles.balanceText, source === 'solana' && styles.activeBalanceText]}>{balances.sol.toLocaleString(undefined, {maximumFractionDigits: 2})} SOL</Text>
             </TouchableOpacity>
             <TouchableOpacity style={[styles.toggleBtn, source === 'usdc' && styles.activeUsdcBtn]} onPress={() => { Haptics.selectionAsync(); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setSource('usdc'); }}>
               <Text style={[styles.toggleText, source === 'usdc' && styles.activeText]}>USDC</Text>
               <Text style={[styles.balanceText, source === 'usdc' && styles.activeBalanceText]}>${balances.usdc.toLocaleString(undefined, {maximumFractionDigits: 2})}</Text>
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
  balanceText: { color: '#666', fontSize: 10, marginTop: 4, fontWeight: '600' },
  activeBalanceText: { color: 'rgba(0,0,0,0.6)' },
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
  quoteButton: { backgroundColor: '#ffb000', paddingVertical: 16, borderRadius: 12, alignItems: 'center', width: '100%' },
  ocpOptionCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  ocpOptionSelected: { borderColor: '#6b5cc3', backgroundColor: 'rgba(107, 92, 195, 0.1)' }
});
