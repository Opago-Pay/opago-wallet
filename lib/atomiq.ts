import { Buffer } from 'buffer';
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

const solanaRpc = "https://api.mainnet-beta.solana.com"; 

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
                SOLANA: { rpcUrl: solanaRpc }
            },
            intermediaryUrl: [
                "https://node3.gethopa.com:8443",
                "https://84-32-32-132.nodes.atomiq.exchange",
                "https://161-97-73-23.nodes.atomiq.exchange:4000"
            ],
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
    const swapper = await getAtomiqSwapper();
    const anchorWallet = createAnchorWallet(keypair);
    const solanaSigner = new atomiqSolana.SolanaSigner(anchorWallet);

    const btcAmountStr = (amountSat / 1e8).toFixed(8);

    console.log("Requesting Atomiq Quote in amounts:", btcAmountStr);
    
    const fromToken = assetType === 'USDC' ? Tokens.SOLANA.USDC : Tokens.SOLANA.SOL;
    
    try {
        const limits = swapper.getSwapLimits(fromToken, Tokens.BITCOIN.BTCLN);
        console.log("Atomiq Swap Limits for", assetType, "to BTCLN:", 
            "Min Input:", limits?.input?.min?.toString(),
            "Min Output:", limits?.output?.min?.toString()
        );
    } catch (e) {
        console.log("Could not fetch swap limits:", e);
    }

    // If destination is a bolt11 invoice, the amount parameter MUST be undefined in the SDK call
    const isInvoice = destination.toLowerCase().startsWith('lnbc');
    const swapAmount = isInvoice ? undefined : btcAmountStr;

    // Generates a local quote bounded by the LP liquidity, representing EXACT_OUT parameters
    const swap = await swapper.swap(
        fromToken, 
        Tokens.BITCOIN.BTCLN,
        swapAmount,
        atomiqSdk.SwapAmountType.EXACT_OUT,
        solanaSigner.getAddress(),
        destination 
    );

    console.log("Atomiq Quote input required:", swap.getInput()?.toString());
    
    return { swap, solanaSigner };
}

export async function executeAtomiqQuote(swap: any, solanaSigner: any) {
    return await swap.execute(solanaSigner, {
        onSourceTransactionSent: (txId: any) => console.log("Atomiq Source Tx:", txId),
        onSwapSettled: (btcTxId: any) => console.log("Atomiq Swap Settled:", btcTxId)
    });
}
