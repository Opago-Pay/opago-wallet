import * as SQLite from 'expo-sqlite';

let dbInitialized = false;

export async function initDatabase() {
  if (dbInitialized) return;
  try {
    const db = await SQLite.openDatabaseAsync('wallet.db');
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        asset TEXT NOT NULL,
        status TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    dbInitialized = true;
  } catch (error) {
    console.error("SQLite init error", error);
  }
}

export async function addTransaction(type: 'incoming' | 'outgoing', amount: number, asset: 'SAT' | 'SOL' | 'EUR') {
  try {
    const db = await SQLite.openDatabaseAsync('wallet.db');
    await db.runAsync('INSERT INTO transactions (type, amount, asset, status) VALUES (?, ?, ?, ?)', type, amount, asset, 'completed');
  } catch (e) {
    console.error("Failed to add tx", e);
  }
}

export interface Transaction {
  id: number;
  type: 'incoming' | 'outgoing';
  amount: number;
  asset: string;
  status: string;
  timestamp: string;
}

export async function getTransactions(): Promise<Transaction[]> {
  try {
    const db = await SQLite.openDatabaseAsync('wallet.db');
    return await db.getAllAsync<Transaction>('SELECT * FROM transactions ORDER BY timestamp DESC LIMIT 20');
  } catch (e) {
    console.error("Failed to get txs", e);
    return [];
  }
}
