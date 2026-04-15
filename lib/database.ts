import { getSecureItem, setSecureItem } from './storage';

export interface Transaction {
  id: number;
  type: 'incoming' | 'outgoing';
  amount: number;
  asset: string;
  status: string;
  timestamp: string;
}

const TX_KEY = 'opago_transactions_history';

export async function initDatabase() {
  // Replaced SQLite with JSON Storage to eliminate Engine Crashes
}

export async function wipeTransactions() {
  try {
    await setSecureItem(TX_KEY, JSON.stringify([]));
  } catch (e) {
    console.error("Failed to wipe", e);
  }
}

export async function addTransaction(type: 'incoming' | 'outgoing', amount: number, asset: 'SAT' | 'SOL' | 'EUR') {
  try {
    const data = await getSecureItem(TX_KEY);
    const txs: Transaction[] = data ? JSON.parse(data) : [];
    
    const newTx: Transaction = {
      id: Date.now(),
      type,
      amount,
      asset,
      status: 'completed',
      timestamp: new Date().toISOString()
    };
    
    // Add to top and truncate
    txs.unshift(newTx);
    if (txs.length > 50) txs.pop();
    
    await setSecureItem(TX_KEY, JSON.stringify(txs));
  } catch (e) {
    console.error("Failed to add tx", e);
  }
}

export async function getTransactions(): Promise<Transaction[]> {
  try {
    const data = await getSecureItem(TX_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to get txs", e);
    return [];
  }
}
