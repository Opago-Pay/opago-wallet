import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { SparkWallet } from '@/lib/spark';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { Connection, PublicKey } from '@solana/web3.js';

export default function HomeScreen() {
  const { walletReady, sparkWallet, solanaAddress, loadOrGenerateWallet } = useWalletAuth();
  const rates = useExchangeRates();
  
  const [refreshing, setRefreshing] = useState(false);
  const [btcBalance, setBtcBalance] = useState(0);
  const [solBalance, setSolBalance] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);

  const fetchBalancesAndTxs = async () => {
    if (!sparkWallet && walletReady) {
      await loadOrGenerateWallet();
      return;
    }
    
    let realBalance = 0;
    if (sparkWallet) {
      try {
        const balanceData = await sparkWallet.getBalance();
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
        const connection = new Connection("https://api.mainnet-beta.solana.com");
        const balance = await connection.getBalance(new PublicKey(solanaAddress));
        setSolBalance(balance / 1e9);
      } catch (e) {
        console.error("Failed to fetch SOL balance");
      }
    }

    try {
      if (sparkWallet) {
        const { transfers } = await sparkWallet.getTransfers(15, 0);
        
        // Map the real Spark L2 transfers directly to the UI
        if (transfers && transfers.length > 0) {
           setTransactions(transfers.map((tx: any) => {
             const isIncoming = tx.transferDirection?.toString().toUpperCase() === 'INCOMING';
             const rawAmount = tx.totalValue || (tx.userRequest?.transfer?.totalAmount?.originalValue) || 0;
             return {
               id: tx.id || tx.transferId || Math.random().toString(),
               type: isIncoming ? 'incoming' : 'outgoing',
               asset: 'SAT',
               amount: Math.abs(Number(rawAmount)),
               timestamp: tx.createdTime || tx.createdAt || new Date().toISOString()
             };
           }));
        }
        setBtcBalance(realBalance);
      }
    } catch(e) {
      console.error("Failed to fetch real L2 transfers:", e);
    }
  };

  useEffect(() => {
    if (walletReady) {
      fetchBalancesAndTxs();
    } else {
      loadOrGenerateWallet();
    }
  }, [walletReady]);

  const onRefresh = async () => {
    setRefreshing(true);
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={'#14F195'} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Assets</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardHeader}>Lightning</Text>
        <Text style={styles.assetValue}>{btcBalance.toLocaleString()} SAT</Text>
        <Text style={styles.fiatFallback}>≈ €{btcInEur}</Text>
      </View>

      <View style={[styles.card, { borderColor: '#14F195', borderWidth: 1 }]}>
        <Text style={styles.cardHeader}>Solana</Text>
        <Text style={styles.assetValue}>{solBalance.toLocaleString()} SOL</Text>
        <Text style={[styles.fiatFallback, { color: '#14F195' }]}>≈ €{solInEur}</Text>
        <Text style={styles.addressLabel}>{solanaAddress ? `${solanaAddress.slice(0, 4)}...${solanaAddress.slice(-4)}` : 'Loading...'}</Text>
      </View>

      <View style={styles.txHeader}>
        <Text style={styles.txTitle}>Recent Transactions</Text>
      </View>

      {transactions.length === 0 ? (
        <Text style={styles.noTxText}>No transactions yet.</Text>
      ) : (
        transactions.map((tx) => (
          <View key={tx.id} style={styles.txCard}>
            <View>
              <Text style={styles.txType}>{tx.type === 'incoming' ? 'Received' : 'Sent'} {tx.asset}</Text>
              <Text style={styles.txDate}>{new Date(tx.timestamp).toLocaleString()}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.txAmount, { color: tx.type === 'incoming' ? '#14F195' : '#fff' }]}>
                {tx.type === 'incoming' ? '+' : '-'}{tx.amount} SAT
              </Text>
              <Text style={{ color: '#8f8f9d', fontSize: 12, marginTop: 4 }}>
                ≈ €{((tx.amount / 1e8) * rates.btcToEur).toFixed(2)}
              </Text>
            </View>
          </View>
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
    backgroundColor: '#a259ff',
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
    color: '#14F195',
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
  }
});
