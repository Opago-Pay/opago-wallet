import * as SQLite from 'expo-sqlite';

export interface Transaction {
  id: number;
  type: 'incoming' | 'outgoing';
  amount: number;
  asset: string;
  status: string;
  timestamp: string;
}

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<void> | null = null;

export async function initDatabase() {
  if (db) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      db = await SQLite.openDatabaseAsync('opago.db');
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          amount REAL NOT NULL,
          asset TEXT NOT NULL,
          status TEXT NOT NULL,
          timestamp TEXT NOT NULL
        );
      `);
      console.log("Database initialized");
    } catch (e) {
      console.error("Failed to init database", e);
    }
  })();
  
  return initPromise;
}

export async function wipeTransactions() {
  if (!db) return;
  try {
    await db.execAsync('DELETE FROM transactions');
  } catch (e) {
    console.error("Failed to wipe", e);
  }
}

export async function addTransaction(type: 'incoming' | 'outgoing', amount: number, asset: 'SAT' | 'SOL' | 'EUR' | 'USDC' | string) {
  if (!db) await initDatabase();
  try {
    await db!.runAsync(
      'INSERT INTO transactions (type, amount, asset, status, timestamp) VALUES (?, ?, ?, ?, ?)',
      [type, amount, asset, 'completed', new Date().toISOString()]
    );
  } catch (e) {
    console.error("Failed to add tx", e);
  }
}

export async function getTransactions(): Promise<Transaction[]> {
  if (!db) await initDatabase();
  try {
    const allRows = await db!.getAllAsync<Transaction>('SELECT * FROM transactions ORDER BY id DESC LIMIT 50');
    return allRows;
  } catch (e) {
    console.error("Failed to get txs", e);
    return [];
  }
}
