import * as Crypto from 'expo-crypto';

export async function initializeSparkWallet(mnemonic: string) {
  console.log("Initializing Real Native Spark SDK with Mnemonic...");
  
  // globalThis.crypto is now globally intercepted BEFORE the app boots via index.js polyfill hijacks.
  
  const { SparkWallet } = require('@buildonspark/spark-sdk');

  const { wallet } = await SparkWallet.initialize({
    mnemonicOrSeed: mnemonic,
    options: {
      network: "MAINNET"
    }
  });

  console.log("Spark Wallet Initialized Natively:", await wallet.getSparkAddress());
  return wallet;
}
