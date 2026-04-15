import { useState, useCallback, useEffect } from 'react';
import { getSecureItem, setSecureItem } from '../lib/storage';
import { generateMnemonic, mnemonicToSeedSync } from 'bip39';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { initializeSparkWallet } from '../lib/spark';
import * as Crypto from 'expo-crypto';

const MNEMONIC_STORE_KEY = 'opago_wallet_mnemonic';

// Global singletons to prevent multiple Concurrent Spark SDK core bootstrap deadlocks across tabs
let globalSparkWallet: any | null = null;
let globalSolanaAddress: string | null = null;
let globalSolanaKeypair: Keypair | null = null;
let globalWalletReady = false;
let isInitializingGlobally = false;
let initializationPromise: Promise<void> | null = null;

export function useWalletAuth() {
  const [isInitializing, setIsInitializing] = useState(isInitializingGlobally);
  const [walletReady, setWalletReady] = useState(globalWalletReady);
  const [sparkWallet, setSparkWallet] = useState<any | null>(globalSparkWallet);
  const [solanaAddress, setSolanaAddress] = useState<string | null>(globalSolanaAddress);
  const [solanaKeypair, setSolanaKeypair] = useState<Keypair | null>(globalSolanaKeypair);

  const syncState = () => {
    setIsInitializing(isInitializingGlobally);
    setWalletReady(globalWalletReady);
    setSparkWallet(globalSparkWallet);
    setSolanaAddress(globalSolanaAddress);
    setSolanaKeypair(globalSolanaKeypair);
  };

  const loadOrGenerateWallet = useCallback(async () => {
    if (globalWalletReady) {
       syncState();
       return;
    }
    
    if (initializationPromise) {
       await initializationPromise;
       syncState();
       return;
    }

    initializationPromise = (async () => {
      try {
        isInitializingGlobally = true;
        syncState();
        
        let mnemonic = await getSecureItem(MNEMONIC_STORE_KEY);
        
        if (!mnemonic) {
          console.log("Generating new mnemonic...");
          mnemonic = generateMnemonic(128, (size) => Buffer.from(Crypto.getRandomBytes(size)));
          await setSecureItem(MNEMONIC_STORE_KEY, mnemonic);
        } else {
          console.log("Loaded mnemonic from secure store.");
        }
        
        const seed = mnemonicToSeedSync(mnemonic);
        const derivedKeypair = Keypair.fromSeed(seed.slice(0, 32));
        
        globalSolanaKeypair = derivedKeypair;
        globalSolanaAddress = derivedKeypair.publicKey.toBase58();
        console.log("Derived Solana address:", globalSolanaAddress);
        
        const spark = await initializeSparkWallet(mnemonic);
        globalSparkWallet = spark as any;
        
        globalWalletReady = true;
      } catch (e) {
        console.error("Wallet init error", e);
      } finally {
        isInitializingGlobally = false;
        syncState();
        initializationPromise = null;
      }
    })();
    
    await initializationPromise;
  }, []);

  return {
    isInitializing,
    walletReady,
    sparkWallet,
    solanaAddress,
    solanaKeypair,
    loadOrGenerateWallet
  };
}
