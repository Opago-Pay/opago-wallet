export interface LNURLPResponse {
  callback: string;
  maxSendable: number;
  minSendable: number;
  metadata: string;
  tag: string;
}

export function decodeLNURL(lnurl: string): string {
  const { bech32 } = require('bech32');
  const decoded = bech32.decode(lnurl, 2000);
  const bytes = bech32.fromWords(decoded.words);
  return String.fromCharCode(...bytes);
}

export async function resolveLightningAddress(address: string): Promise<LNURLPResponse> {
  const parts = address.split('@');
  if (parts.length !== 2) throw new Error("Invalid Lightning Address format");
  const [user, domain] = parts;
  
  const url = `https://${domain}/.well-known/lnurlp/${user}`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    if (data.status === 'ERROR') throw new Error(data.reason || "LNURL Error");
    return data as LNURLPResponse;
  } catch (error: any) {
    throw new Error("Failed to resolve Lightning Address: " + error.message);
  }
}

export async function fetchInvoiceFromLNURLP(callbackUrl: string, amountSat: number): Promise<string> {
  // LNURL uses millisatoshis
  const millisats = amountSat * 1000;
  // If the callback URL already has arguments, append with &
  const separator = callbackUrl.includes('?') ? '&' : '?';
  const finalUrl = `${callbackUrl}${separator}amount=${millisats}`;
  
  try {
    const res = await fetch(finalUrl);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    if (data.status === 'ERROR') throw new Error(data.reason || "LNURL Error");
    if (!data.pr) throw new Error("No payment request (invoice) returned from LNURL endpoint");
    return data.pr; // The bolt11 invoice
  } catch (error: any) {
    throw new Error("Failed to request invoice from LNURL callback: " + error.message);
  }
}
