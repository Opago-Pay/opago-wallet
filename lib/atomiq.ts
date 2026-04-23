import { Buffer } from 'buffer';
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

const solanaRpc = "https://solana-mainnet.rpc.extnode.com";

(global as any).atomiqLogLevel = 3;

// Store static references dynamically to prevent Hoisting
let atomiqSdk: any = null;
let atomiqBase: any = null;
let atomiqSolana: any = null;
let solanaWeb3: any = null;
let Factory: any = null;
export let Tokens: any = null;

function ensureSDKLoaded() {
    if (!atomiqSdk) {
        atomiqSdk = require("@atomiqlabs/sdk");
        atomiqBase = require("@atomiqlabs/base");
        atomiqSolana = require("@atomiqlabs/chain-solana");
        solanaWeb3 = require("@solana/web3.js");
        
        Factory = new atomiqSdk.SwapperFactory([atomiqSolana.SolanaInitializer]);
        Tokens = Factory.Tokens;
    }
}

let swapper: any = null;
let isSwapperInitialized = false;

export async function getAtomiqSwapper() {
    ensureSDKLoaded();
    if (!swapper || !isSwapperInitialized) {
        swapper = Factory.newSwapper({
            chains: {
                SOLANA: { rpcUrl: "https://api.mainnet-beta.solana.com" }
            },
            bitcoinNetwork: atomiqSdk.BitcoinNetwork.MAINNET,
            chainStorageCtor: () => new atomiqBase.VoidStorageManager()
        });
        try {
            await swapper.init();
            isSwapperInitialized = true;
        } catch (e) {
            swapper = null;
            isSwapperInitialized = false;
            throw e;
        }
    }
    return swapper;
}

export function createAnchorWallet(keypair: any) {
    ensureSDKLoaded();
    return {
        publicKey: keypair.publicKey,
        signTransaction: async <T extends any>(tx: T) => {
            if ('version' in tx) {
                tx.sign([keypair]);
            } else {
                tx.partialSign(keypair);
            }
            return tx;
        },
        signAllTransactions: async <T extends any>(txs: T[]) => {
            return Promise.all(txs.map(async (tx: any) => {
                if ('version' in tx) {
                    tx.sign([keypair]);
                } else {
                    tx.partialSign(keypair);
                }
                return tx;
            }));
        }
    };
}

export async function getAtomiqQuote(keypair: any, destination: string, amountSat: number, assetType: 'SOL' | 'USDC' = 'SOL') {
    ensureSDKLoaded();
    
    console.log("\n==============================================");
    console.log("[Atomiq Debug] Starting new Swapper Instance");
    console.log("[Atomiq Debug] RPC URL: https://api.mainnet-beta.solana.com");
    console.log("[Atomiq Debug] Bitcoin Network: MAINNET");
    console.log("[Atomiq Debug] Intermediaries: Autodetect (No hardcoded URLs)");
    
    const swapper = await getAtomiqSwapper();
    const anchorWallet = createAnchorWallet(keypair);
    const solanaSigner = new atomiqSolana.SolanaSigner(anchorWallet);

    const btcAmountStr = (amountSat / 1e8).toFixed(8);

    console.log("[Atomiq Debug] --- Quote Parameters ---");
    console.log("[Atomiq Debug] User Solana Pubkey:", keypair.publicKey.toBase58());
    console.log("[Atomiq Debug] Destination Invoice:", destination);
    console.log("[Atomiq Debug] Amount (Sats):", amountSat);
    console.log("[Atomiq Debug] Amount (BTC):", btcAmountStr);
    console.log("[Atomiq Debug] Asset Type:", assetType);
    
    const fromToken = assetType === 'USDC' ? Tokens.SOLANA.USDC : Tokens.SOLANA.SOL;
    console.log("[Atomiq Debug] Using fromToken address:", fromToken?.toString());
    
    try {
        const limits = swapper.getSwapLimits(fromToken, Tokens.BITCOIN.BTCLN);
        console.log("[Atomiq Debug] Swap Limits:", 
            "Min Input:", limits?.input?.min?.toString(),
            "Min Output:", limits?.output?.min?.toString()
        );
    } catch (e) {
        console.log("[Atomiq Debug] Could not fetch swap limits:", e);
    }

    // If destination is a bolt11 invoice, the amount parameter MUST be undefined in the SDK call
    const isInvoice = destination.toLowerCase().startsWith('lnbc');
    const swapAmount = isInvoice ? undefined : btcAmountStr;
    console.log("[Atomiq Debug] isInvoice:", isInvoice, "| swapAmount sent to SDK:", swapAmount);

    console.log("[Atomiq Debug] Calling swapper.swap()...");
    try {
        // Generates a local quote bounded by the LP liquidity, representing EXACT_OUT parameters
        const swap = await swapper.swap(
            fromToken, 
            Tokens.BITCOIN.BTCLN,
            swapAmount,
            atomiqSdk.SwapAmountType.EXACT_OUT,
            solanaSigner.getAddress(),
            destination 
        );

        console.log("[Atomiq Debug] swapper.swap() SUCCEEDED!");
        console.log("[Atomiq Debug] Atomiq Quote input required:", swap.getInput()?.toString());
        console.log("==============================================\n");
        
        return { swap, solanaSigner };
    } catch (error: any) {
        console.error("\n[Atomiq Debug] swapper.swap() FAILED FATALLY!");
        console.error("[Atomiq Debug] Error Name:", error?.name);
        console.error("[Atomiq Debug] Error Message:", error?.message);
        console.error("[Atomiq Debug] Stack Trace:", error?.stack);
        console.error("==============================================\n");
        throw error;
    }
}

export async function executeAtomiqQuote(swap: any, solanaSigner: any) {
    return await swap.execute(solanaSigner, {
        onSourceTransactionSent: (txId: any) => console.log("Atomiq Source Tx:", txId),
        onSwapSettled: (btcTxId: any) => console.log("Atomiq Swap Settled:", btcTxId)
    });
}
