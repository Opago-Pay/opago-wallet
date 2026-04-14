export const AtomiqAPI = {
  // Get a quote for swapping SOL to SAT
  getQuote: async (amountSOL: number) => {
    // Mock network delay
    await new Promise(resolve => setTimeout(resolve, 800));
    const feeSOL = amountSOL * 0.01; // 1% mock fee
    const amountSAT = Math.floor(amountSOL * 1_000_000); // Mock rate: 1 SOL = 1M Sats
    
    return { 
      id: `quote_${Date.now()}`, 
      amountSAT, 
      feeSOL, 
      expiry: Date.now() + 30000 
    };
  },

  // Initialize the swap, returning the Solana transaction hex that the user must sign
  initSwap: async (quoteId: string, sparkInvoice: string) => {
    await new Promise(resolve => setTimeout(resolve, 600));
    return { 
      swapId: `swap_${Date.now()}`, 
      solanaTxHex: "mock_solana_tx_hex_string_to_sign", 
      invoice: sparkInvoice 
    };
  },

  // Poll for the status of the swap
  getSwapStatus: async (swapId: string) => {
    await new Promise(resolve => setTimeout(resolve, 400));
    // Provide a random chance to complete to simulate waiting
    const isReady = Math.random() > 0.3;
    return { 
      status: isReady ? "completed" : "pending" 
    };
  }
};
