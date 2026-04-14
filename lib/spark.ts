import { SparkWallet } from '@buildonspark/spark-sdk';

export async function initializeSparkWallet(mnemonic: string) {
  console.log("Initializing Real Native Spark SDK with Mnemonic...");
  const { wallet } = await SparkWallet.initialize({
    mnemonicOrSeed: mnemonic,
    options: {
      network: "MAINNET"
    }
  });

  console.log("Spark Wallet Initialized Natively:", await wallet.getSparkAddress());
  return wallet;
}
