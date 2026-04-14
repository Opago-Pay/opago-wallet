import { BitcoinNetwork, SwapperFactory, TypedSwapper, TypedTokens, SwapAmountType } from "@atomiqlabs/sdk";
import { SolanaInitializer, SolanaSigner } from "@atomiqlabs/chain-solana";
import { Keypair, Transaction, VersionedTransaction } from '@solana/web3.js';

const chains = [SolanaInitializer] as const;
type SupportedChains = typeof chains;

const Factory = new SwapperFactory<SupportedChains>(chains);
export const Tokens: TypedTokens<SupportedChains> = Factory.Tokens;

const solanaRpc = "https://api.mainnet-beta.solana.com";

let swapper: TypedSwapper<SupportedChains> | null = null;

export async function getAtomiqSwapper() {
    if (!swapper) {
        swapper = Factory.newSwapper({
            chains: {
                SOLANA: { rpcUrl: solanaRpc }
            },
            bitcoinNetwork: BitcoinNetwork.MAINNET
        });
        await swapper.init();
    }
    return swapper;
}

export function createAnchorWallet(keypair: Keypair) {
    return {
        publicKey: keypair.publicKey,
        signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => {
            if ('version' in tx) {
                tx.sign([keypair]);
            } else {
                tx.partialSign(keypair);
            }
            return tx;
        },
        signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => {
            return Promise.all(txs.map(async (tx) => {
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

export async function executeAtomiqSwap(keypair: Keypair, destination: string, amountSat: number) {
    const swapper = await getAtomiqSwapper();
    const anchorWallet = createAnchorWallet(keypair);
    const solanaSigner = new SolanaSigner(anchorWallet);

    const btcAmountStr = (amountSat / 1e8).toFixed(8);

    console.log("Requesting Atomiq Quote in amounts:", btcAmountStr);
    
    // Auto-detect if destination is lightning invoice or onchain address
    // Atomiq API typically auto-routes BOLT11 invoices if we pass them as the destination
    
    const swap = await swapper.swap(
        Tokens.SOLANA.SOL, 
        Tokens.BITCOIN.BTC, // using default BTC token; Atomiq infers route by destination string format 
        btcAmountStr,
        SwapAmountType.EXACT_OUT,
        solanaSigner.getAddress(),
        destination 
    );

    console.log("Atomiq Quote Output:", swap.getOutput().toString());

    return await swap.execute(solanaSigner, {
        onSourceTransactionSent: (txId) => console.log("Atomiq Source Tx:", txId),
        onSwapSettled: (btcTxId) => console.log("Atomiq Swap Settled:", btcTxId)
    });
}
