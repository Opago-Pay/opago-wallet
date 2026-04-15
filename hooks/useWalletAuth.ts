import { useState, useCallback, useEffect } from 'react';
import { getSecureItem, setSecureItem, deleteSecureItem } from '../lib/storage';
import { generateMnemonic, mnemonicToSeedSync } from 'bip39';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { initializeSparkWallet } from '../lib/spark';
import { HDKey } from 'micro-ed25519-hdkey';
import { usePrivy } from '@privy-io/expo';
import * as Crypto from 'expo-crypto';

const MNEMONIC_STORE_KEY = 'opago_wallet_mnemonic';

// Global singletons to prevent multiple Concurrent Spark SDK core bootstrap deadlocks across tabs
let globalSparkWallet: any | null = null;
let globalSolanaAddress: string | null = null;
let globalSolanaKeypair: Keypair | null = null;
let globalWalletReady = false;
let isInitializingGlobally = false;
let initializationPromise: Promise<void> | null = null;

export async function wipeWalletGlobally() {
  await deleteSecureItem(MNEMONIC_STORE_KEY);
  globalSparkWallet = null;
  globalSolanaAddress = null;
  globalSolanaKeypair = null;
  globalWalletReady = false;
  initializationPromise = null;
}

export const getGlobalSparkWallet = () => globalSparkWallet;
export const getGlobalWalletReady = () => globalWalletReady;

export function useWalletAuth() {
  const privy = usePrivy();
  const [tick, setTick] = useState(0);

  const syncState = () => {
    setTick(t => t + 1);
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
        const derivationPath = "m/44'/501'/0'/0'";
        const hd = HDKey.fromMasterSeed(seed.toString('hex'));
        const derivedSeed = hd.derive(derivationPath).privateKey;
        const derivedKeypair = Keypair.fromSeed(derivedSeed);
        
        globalSolanaKeypair = derivedKeypair;
        globalSolanaAddress = derivedKeypair.publicKey.toBase58();
        console.log("Derived Solana address:", globalSolanaAddress);

        try {
          if (privy && 'importWallet' in privy) {
             (privy as any).importWallet({ privateKey: bs58.encode(derivedKeypair.secretKey), chainType: 'solana' });
          }
        } catch (privyErr) {
          console.log("Privy import failed or not available:", privyErr);
        }
        
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
    isInitializing: isInitializingGlobally,
    walletReady: globalWalletReady,
    sparkWallet: globalSparkWallet,
    solanaAddress: globalSolanaAddress,
    solanaKeypair: globalSolanaKeypair,
    loadOrGenerateWallet
  };
}
