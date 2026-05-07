const { Connection, PublicKey } = require('@solana/web3.js');

const ENDPOINTS = [
  "https://solana-rpc.publicnode.com",
  "https://api.mainnet-beta.solana.com"
];

const testPubkey = new PublicKey("H7WTQDPEjrUhd2rvPmZsXQYqEYXUMrN5uYC3gpdnr9zE"); 
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

async function testAll() {
  for (const url of ENDPOINTS) {
    console.log(`Testing ${url}...`);
    try {
      const conn = new Connection(url);
      const accounts = await conn.getParsedTokenAccountsByOwner(testPubkey, { mint: USDC_MINT });
      console.log(`✅ ${url} SUCCESS! USDC Accounts: ${accounts.value.length}`);
    } catch (err) {
      console.log(`❌ ${url} FAILED: ${err.message}`);
    }
  }
}

testAll();
