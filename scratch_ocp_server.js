const http = require('http');
const { bech32 } = require('bech32');

const PORT = 3333;

// Helfer-Funktion um eine URL in eine LNURL (Bech32) zu konvertieren
function encodeUrlToLNURL(url) {
  const words = bech32.toWords(Buffer.from(url, 'utf8'));
  return bech32.encode('lnurl', words, 2000);
}

// Minimaler OCP Server
const server = http.createServer((req, res) => {
  // CORS Header erlauben, falls das Handy im gleichen Netzwerk zugreift
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/ocp') {
    const method = url.searchParams.get('method');
    
    if (method) {
      // 2. Stufe: Execution Payload zurückgeben
      const asset = url.searchParams.get('asset');
      console.log(`[OCP Server] Execution angefragt für Methode: ${method}, Asset: ${asset}`);
      
      res.writeHead(200);
      if (method === 'lightning') {
        res.end(JSON.stringify({
          type: 'lightning',
          pr: "lnbc1p.....(dies_ist_eine_mock_invoice)" // In echt kommt hier eine echte BOLT11
        }));
      } else if (method === 'solana') {
        res.end(JSON.stringify({
          type: 'solana',
          destination: "7TMf8e7Upxp6X8wR361Gf6qQ7hH4HwG9P1iW5C3b9jGv",
          amount: 0.003,
          asset: "SOL"
        }));
      } else {
        res.end(JSON.stringify({ status: "ERROR", reason: "Unknown method" }));
      }
    } else {
      // 1. Stufe: Options zurückgeben
      console.log("[OCP Server] Options wurden angefragt!");
      res.writeHead(200);
      res.end(JSON.stringify({
        merchantName: "Hackathon Test Store",
        fiatAmount: 0.35,
        fiatCurrency: "EUR",
        quoteId: "quote_" + Date.now(),
        transferAmounts: [
          {
            method: "lightning",
            asset: "SAT",
            chain: "Lightning",
            amount: 550,
            fee: 0
          },
          {
            method: "solana",
            asset: "SOL",
            chain: "Solana",
            amount: 0.003,
            fee: 0.000005
          }
        ]
      }));
    }
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log("=========================================");
  console.log(`OCP Test-Server läuft auf Port ${PORT}`);
  
  // Finde die lokale IP (für das Handy im selben WLAN)
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let localIp = '127.0.0.1';
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        localIp = net.address;
      }
    }
  }

  const apiUrl = `http://${localIp}:${PORT}/ocp`;
  const encodedLnurl = encodeUrlToLNURL(apiUrl);
  
  console.log("=========================================");
  console.log("1. Kopiere folgenden LNURL-String und füge ihn in der Opago Wallet in das 'Destination' Feld ein:");
  console.log("\n" + encodedLnurl + "\n");
  console.log("Oder als kompletter OCP URI-Fallback (z.B. für QR Codes):");
  console.log(`lightning=${encodedLnurl}`);
  console.log("=========================================");
  console.log(`API URL (Intern): ${apiUrl}`);
});
