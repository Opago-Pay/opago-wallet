import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, LayoutAnimation, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useWalletAuth, getGlobalSparkWallet, getGlobalWalletReady } from '@/hooks/useWalletAuth';
import { SparkWallet } from '@/lib/spark';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { Connection, PublicKey } from '@solana/web3.js';
import { getTransactions } from '@/lib/database';

export default function HomeScreen() {
  const { walletReady, sparkWallet, solanaAddress, loadOrGenerateWallet } = useWalletAuth();
  const rates = useExchangeRates();
  
  const [refreshing, setRefreshing] = useState(false);
  const [btcBalance, setBtcBalance] = useState(0);
  const [solBalance, setSolBalance] = useState(0);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);

  const fetchBalancesAndTxs = async () => {
    const liveSparkWallet = getGlobalSparkWallet();
    const liveWalletReady = getGlobalWalletReady();

    if (!liveSparkWallet && liveWalletReady) {
      return;
    }
    
    let realBalance = 0;
    if (liveSparkWallet) {
      try {
        const balanceData = await liveSparkWallet.getBalance();
        console.log("💎 [SPARK DIAGNOSTICS] RAW BALANCE YIELD:", JSON.stringify(balanceData, (k, v) => typeof v === 'bigint' ? v.toString() : v));
        
        const settled = Number(balanceData.balance) || 0;
        const incoming = Number(balanceData.satsBalance?.incoming) || 0;
        realBalance = settled + incoming;
        
        console.log("💎 [SPARK DIAGNOSTICS] COMPUTED SATS:", realBalance);
      } catch(e) {
        console.error("💎 [SPARK DIAGNOSTICS] Failed to fetch physical balance:", e);
      }
    }
    
    if (solanaAddress) {
      try {
        const connection = new Connection("https://solana-rpc.publicnode.com");
        const pubkey = new PublicKey(solanaAddress);
        const balance = await connection.getBalance(pubkey);
        setSolBalance(balance / 1e9);

        const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, { mint: USDC_MINT });
        
        if (tokenAccounts.value.length > 0) {
           const usdcAmount = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0;
           setUsdcBalance(usdcAmount);
        } else {
           setUsdcBalance(0);
        }
      } catch (e) {
        console.error("Failed to fetch SOL/USDC balance:", e);
      }
    }

    try {
      if (liveSparkWallet) {
        const { transfers } = await liveSparkWallet.getTransfers(15, 0);
        let sparkHistory: any[] = [];
        
        if (transfers && transfers.length > 0) {
           sparkHistory = transfers.map((tx: any) => {
             const isIncoming = tx.transferDirection?.toString().toUpperCase() === 'INCOMING';
             const rawAmount = tx.totalValue || (tx.userRequest?.transfer?.totalAmount?.originalValue) || 0;
             return {
               id: tx.id || tx.transferId || Math.random().toString(),
               type: isIncoming ? 'incoming' : 'outgoing',
               asset: 'SAT',
               amount: Math.abs(Number(rawAmount)),
               timestamp: tx.createdTime || tx.createdAt || new Date().toISOString()
             };
           });
        }

        let solHistory: any[] = [];
        if (solanaAddress) {
           try {
             const connection = new Connection("https://solana-rpc.publicnode.com");
             const pubkey = new PublicKey(solanaAddress);
             const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 5 });
             if (sigs.length > 0) {
                 const parsedTxs = [];
                 for (const s of sigs) {
                    try {
                      const tx = await connection.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
                      if (tx) parsedTxs.push(tx);
                    } catch(e) {
                      // Silently skip if one hash fails to parse
                    }
                 }
                 solHistory = parsedTxs.map(tx => {
                    if (!tx || !tx.meta) return null;
                    const timestamp = tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : new Date().toISOString();

                    let tokenDiff = 0;
                    if (tx.meta.postTokenBalances) {
                        for (const post of tx.meta.postTokenBalances) {
                            if (post.owner === solanaAddress || post.owner === pubkey.toBase58()) {
                                const pre = tx.meta.preTokenBalances?.find((t: any) => t.accountIndex === post.accountIndex);
                                const diff = (post.uiTokenAmount?.uiAmount || 0) - (pre?.uiTokenAmount?.uiAmount || 0);
                                if (Math.abs(diff) > 0.0001) {
                                   tokenDiff = diff;
                                   break;
                                }
                            }
                        }
                    }
                    
                    if (Math.abs(tokenDiff) > 0.0001) {
                         return {
                             id: tx.transaction.signatures[0] + "_token",
                             type: tokenDiff > 0 ? 'incoming' : 'outgoing',
                             asset: 'USDC',
                             amount: Math.abs(tokenDiff),
                             timestamp
                         };
                    }

                    const accountIndex = tx.transaction.message.accountKeys.findIndex((k: any) => k.pubkey.toBase58() === solanaAddress);
                    if (accountIndex === -1) return null;
                    const diffLamports = tx.meta.postBalances[accountIndex] - tx.meta.preBalances[accountIndex];
                    if (Math.abs(diffLamports) < 5000) return null;
                    
                    return {
                        id: tx.transaction.signatures[0],
                        type: diffLamports > 0 ? 'incoming' : 'outgoing',
                        asset: 'SOL',
                        amount: Math.abs(diffLamports / 1e9),
                        timestamp
                    };
                 }).filter(Boolean) as any[];
             }
           } catch(e) {
               console.log("Solana history error:", e);
           }
        }

        let localHistory: any[] = [];
        try {
          localHistory = await getTransactions();
        } catch(e) {
          console.log("Local history error:", e);
        }

        // Deduplicate: If a local tx has same amount, asset, and type as a remote tx within 2 minutes, ignore the local one
        const mergedRemote = [...sparkHistory, ...solHistory];
        const filteredLocal = localHistory.filter(localTx => {
           return !mergedRemote.some(remoteTx => {
              const timeDiff = Math.abs(new Date(localTx.timestamp).getTime() - new Date(remoteTx.timestamp).getTime());
              return timeDiff < 120000 && 
                     remoteTx.amount === localTx.amount && 
                     remoteTx.asset === localTx.asset && 
                     remoteTx.type === localTx.type;
           });
        });

        const mergedHistory = [...filteredLocal, ...mergedRemote].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setTransactions(mergedHistory);

        setBtcBalance(realBalance);
      }
    } catch(e) {
      console.error("Failed to fetch real L2 transfers:", e);
    }
  };

  const prevSolBalance = React.useRef(solBalance);
  
  useEffect(() => {
    if (prevSolBalance.current !== 0 && solBalance > prevSolBalance.current) {
      const diff = solBalance - prevSolBalance.current;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Deposit Received! 🎉",
        `You just received ${diff.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL.`
      );
    }
    prevSolBalance.current = solBalance;
  }, [solBalance]);

  useFocusEffect(
    useCallback(() => {
      if (walletReady) {
        fetchBalancesAndTxs();
        
        // Also fetch again after 2.5 seconds to catch delayed L2 HTLC settlements
        const timeout = setTimeout(() => {
           fetchBalancesAndTxs();
        }, 2500);

        // Poll every 10 seconds to auto-detect incoming on-chain deposits without pull-to-refresh
        const interval = setInterval(() => {
           fetchBalancesAndTxs();
        }, 10000);
        
        return () => {
          clearTimeout(timeout);
          clearInterval(interval);
        };
      }
    }, [walletReady, solanaAddress])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Add an artificial delay so you can actually see the sleek animation before it resolves!
    await Promise.all([
      fetchBalancesAndTxs(),
      new Promise(resolve => setTimeout(resolve, 800))
    ]);
    setRefreshing(false);
  };

  const btcInEur = ((btcBalance / 1e8) * rates.btcToEur).toFixed(2);
  const solInEur = (solBalance * rates.solToEur).toFixed(2);
  const router = useRouter();

  return (
    <ScrollView 
      style={styles.container} 
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={'#ffb000'} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Assets</Text>
        <Image source={require('@/assets/images/logo_new.svg')} style={{ width: 36, height: 36 }} contentFit="contain" />
      </View>

      <Animated.View entering={FadeInUp.delay(100).springify().damping(14)} style={[styles.card, { borderColor: '#ffb000', borderWidth: 1 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
           <Image source={{ uri: 'https://cryptologos.cc/logos/bitcoin-btc-logo.png' }} style={{ width: 24, height: 24, marginRight: 8 }} />
           <Text style={[styles.cardHeader, { marginBottom: 0 }]}>Lightning</Text>
        </View>
        <Text style={styles.assetValue}>{btcBalance.toLocaleString()} SAT</Text>
        <Text style={[styles.fiatFallback, { color: '#ffb000' }]}>≈ €{btcInEur}</Text>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(200).springify().damping(14)} style={[styles.card, { borderColor: '#14F195', borderWidth: 1 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
           <Image source={{ uri: 'https://cryptologos.cc/logos/solana-sol-logo.png' }} style={{ width: 24, height: 24, marginRight: 8 }} />
           <Text style={[styles.cardHeader, { marginBottom: 0 }]}>Solana</Text>
        </View>
        <Text style={styles.assetValue}>{solBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL</Text>
        <Text style={[styles.fiatFallback, { color: '#14F195' }]}>≈ €{solInEur}</Text>
        
        <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: 'rgba(20, 241, 149, 0.2)', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
             <Image source={{ uri: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png' }} style={{ width: 20, height: 20, marginRight: 8 }} />
             <Text style={{ color: '#8f8f9d', fontWeight: '600' }}>USDC</Text>
          </View>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>${usdcBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
        </View>

        <Text style={[styles.addressLabel, { color: '#14F195' }]}>{solanaAddress ? `${solanaAddress.slice(0, 4)}...${solanaAddress.slice(-4)}` : 'Loading...'}</Text>
      </Animated.View>

      <View style={styles.txHeader}>
        <Text style={styles.txTitle}>Recent Transactions</Text>
      </View>

      {transactions.length === 0 ? (
        <Animated.View entering={FadeInUp.delay(300).springify().damping(14)} style={{ alignItems: 'center', marginTop: 40, marginBottom: 20 }}>
            <Ionicons name="receipt-outline" size={48} color="rgba(255,255,255,0.1)" />
            <Text style={{ color: '#8f8f9d', marginTop: 12, fontSize: 16, fontWeight: '600' }}>No transactions yet</Text>
            <Text style={{ color: '#666', marginTop: 4, fontSize: 13, textAlign: 'center', paddingHorizontal: 40 }}>Deposit funds via Lightning or Solana base-layer to see activity here.</Text>
        </Animated.View>
      ) : (
        transactions.map((tx, index) => (
          <Animated.View key={tx.id} entering={FadeInUp.delay(300 + index * 50).springify().damping(14)} style={styles.txCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Image 
                source={{ uri: tx.asset === 'SOL' ? 'https://cryptologos.cc/logos/solana-sol-logo.png' : (tx.asset === 'USDC' ? 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png' : 'https://cryptologos.cc/logos/bitcoin-btc-logo.png') }} 
                style={{ width: 32, height: 32, marginRight: 12 }} 
              />
              <View>
                <Text style={styles.txType}>{tx.type === 'incoming' ? 'Received' : 'Sent'} {tx.asset}</Text>
                <Text style={styles.txDate}>{new Date(tx.timestamp).toLocaleString()}</Text>
                <View style={[styles.statusBadge, { backgroundColor: tx.type === 'incoming' ? 'rgba(20,241,149,0.1)' : 'rgba(255,255,255,0.05)' }]}>
                   <Text style={[styles.statusText, { color: tx.type === 'incoming' ? '#14F195' : '#8f8f9d' }]}>Completed</Text>
                </View>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.txAmount, { color: '#fff' }]}>
                  {tx.type === 'incoming' ? '+' : '-'}{tx.amount} {tx.asset}
                </Text>
                <Ionicons name={tx.type === 'incoming' ? 'arrow-down' : 'arrow-up'} size={16} color={tx.type === 'incoming' ? '#14F195' : '#ff4444'} style={{ marginLeft: 6 }} />
              </View>
              <Text style={{ color: '#8f8f9d', fontSize: 12, marginTop: 4 }}>
                ≈ €{ tx.asset === 'SOL' ? (tx.amount * rates.solToEur).toFixed(2) : (tx.asset === 'USDC' ? (tx.amount * 0.92).toFixed(2) : ((tx.amount / 1e8) * rates.btcToEur).toFixed(2)) }
              </Text>
            </View>
          </Animated.View>
        ))
      )}

    </ScrollView>
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
  sendButton: {
    backgroundColor: '#6b5cc3',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
  },
  cardHeader: {
    fontSize: 16,
    color: '#a0a0ab',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  assetValue: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
  },
  fiatFallback: {
    marginTop: 4,
    fontSize: 16,
    color: '#8f8f9d',
    fontWeight: '600'
  },
  addressLabel: {
    marginTop: 12,
    color: '#ffb000',
    fontSize: 14,
    fontFamily: 'monospace'
  },
  txHeader: {
    marginTop: 16,
    marginBottom: 12,
  },
  txTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  noTxText: {
    color: '#a0a0ab',
    textAlign: 'center',
    marginVertical: 20,
  },
  txCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    marginBottom: 8,
  },
  txType: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  txDate: {
    color: '#8f8f9d',
    fontSize: 12,
    marginTop: 4,
  },
  txAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  statusBadge: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  }
});
