import { useState, useEffect } from 'react';

const CACHE_EXPIRY = 60 * 1000; // 60 seconds
let cachedRates = { btcToEur: 60000, solToEur: 140 }; // Fallback estimations
let cacheTimestamp = 0;

export function useExchangeRates() {
  const [rates, setRates] = useState(cachedRates);

  useEffect(() => {
    let active = true;

    const fetchRates = async () => {
      if (Date.now() - cacheTimestamp < CACHE_EXPIRY) {
        if (active) setRates(cachedRates);
        return;
      }

      try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,solana&vs_currencies=eur');
        const data = await res.json();
        
        const newRates = { 
          btcToEur: data.bitcoin?.eur || cachedRates.btcToEur, 
          solToEur: data.solana?.eur || cachedRates.solToEur 
        };
        
        cachedRates = newRates;
        cacheTimestamp = Date.now();
        
        if (active) setRates(newRates);
      } catch (e) {
        console.warn("CoinGecko fetch failed, using memory cache", e);
      }
    };

    fetchRates();
    const interval = setInterval(fetchRates, CACHE_EXPIRY);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return rates;
}
