import { decodeLNURL } from './lnurl';

export interface OcpOption {
  asset: string;
  chain: string;
  amount: number;
  fee: number;
  method: string;
}

export interface OcpResponse {
  merchantName: string;
  fiatAmount: number;
  fiatCurrency: string;
  quoteId: string;
  transferAmounts: OcpOption[];
}

// Mock Implementation of OpenCryptoPay API
export async function resolveOcpUrl(scannedUrl: string): Promise<string | null> {
  // If it's a URL that has a lightning= fallback, extract the LNURL part.
  let lnurlPart = scannedUrl;
  if (scannedUrl.includes('lightning=')) {
    lnurlPart = scannedUrl.split('lightning=')[1].split('&')[0];
  }
  
  if (lnurlPart.toLowerCase().startsWith('lnurl1')) {
    try {
      const decodedApiUrl = decodeLNURL(lnurlPart);
      // For the hackathon, we assume any URL successfully decoded from an LNURL that isn't a direct LND LNURLP 
      // (or if we just want to force the OCP mock) will return our mock data.
      return decodedApiUrl;
    } catch(e) {
      return null;
    }
  }
  return null;
}

export async function fetchOcpOptions(apiUrl: string): Promise<OcpResponse> {
  console.log("Fetching OCP Options from API:", apiUrl);
  
  const res = await fetch(apiUrl);
  if (!res.ok) {
     throw new Error(`Failed to fetch OCP options: ${res.status}`);
  }
  
  const data = await res.json();
  if (data.status === 'ERROR') {
     throw new Error(data.reason || "OCP API returned an error");
  }

  // The Opago POS API / OCP standard should return an array of transferAmounts
  // Example: { fiatAmount: 4.50, transferAmounts: [...] }
  return data as OcpResponse;
}

export async function fetchOcpExecutionPayload(callbackUrl: string, method: string, asset: string): Promise<any> {
  console.log(`Fetching execution payload via ${method} for asset ${asset}`);
  
  const separator = callbackUrl.includes('?') ? '&' : '?';
  const finalUrl = `${callbackUrl}${separator}method=${method}&asset=${asset}`;
  
  const res = await fetch(finalUrl);
  if (!res.ok) {
     throw new Error(`Failed to fetch OCP execution payload: ${res.status}`);
  }
  
  const data = await res.json();
  if (data.status === 'ERROR') {
     throw new Error(data.reason || "OCP execution payload error");
  }

  return data;
}
