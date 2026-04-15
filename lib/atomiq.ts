import { Buffer } from 'buffer';
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

const solanaRpc = "https://api.mainnet-beta.solana.com";

// Store static references dynamically to prevent Hoisting
let atomiqSdk: any = null;
let atomiqSolana: any = null;
let solanaWeb3: any = null;
let Factory: any = null;
export let Tokens: any = null;

function ensureSDKLoaded() {
    if (!atomiqSdk) {
        atomiqSdk = require("@atomiqlabs/sdk");
        atomiqSolana = require("@atomiqlabs/chain-solana");
        solanaWeb3 = require("@solana/web3.js");
        
        Factory = new atomiqSdk.SwapperFactory([atomiqSolana.SolanaInitializer]);
        Tokens = Factory.Tokens;
    }
}

let swapper: any = null;

export async function getAtomiqSwapper() {
    ensureSDKLoaded();
    if (!swapper) {
        swapper = Factory.newSwapper({
            chains: {
                SOLANA: { rpcUrl: solanaRpc }
            },
            bitcoinNetwork: atomiqSdk.BitcoinNetwork.MAINNET
        });
        await swapper.init();
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

export async function getAtomiqQuote(keypair: any, destination: string, amountSat: number) {
    ensureSDKLoaded();
    const swapper = await getAtomiqSwapper();
    const anchorWallet = createAnchorWallet(keypair);
    const solanaSigner = new atomiqSolana.SolanaSigner(anchorWallet);

    const btcAmountStr = (amountSat / 1e8).toFixed(8);

    console.log("Requesting Atomiq Quote in amounts:", btcAmountStr);
    
    // Generates a local quote bounded by the LP liquidity, representing EXACT_OUT parameters
    const swap = await swapper.swap(
        Tokens.SOLANA.SOL, 
        Tokens.BITCOIN.BTC,
        btcAmountStr,
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
