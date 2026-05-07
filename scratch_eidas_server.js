const http = require('http');
const { bech32 } = require('bech32');

const PORT = 4444;

function encodeUrlToLNURL(url) {
  const words = bech32.toWords(Buffer.from(url, 'utf8'));
  return bech32.encode('lnurl', words, 2000);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/lnurl-eidas') {
    console.log("[eIDAS Server] LNURL Request empfangen!");
    
    // Wir simulieren hier eine Börse oder Bank, die eIDAS Compliance (Travel Rule) verlangt
    res.writeHead(200);
    res.end(JSON.stringify({
      callback: `http://${req.headers.host}/lnurl-eidas/callback`,
      maxSendable: 1000,
      minSendable: 1000,
      metadata: "[[\"text/plain\", \"Test eIDAS Payment\"]]",
      tag: "payRequest",
      
      // Das sind die entscheidenden Felder, die `send.tsx` abfragt:
      compliance: {
        isSubjectToTravelRule: true
      },
      payerData: {
        compliance: {
          mandatory: true
        }
      }
    }));
  } else if (url.pathname === '/lnurl-eidas/callback') {
    console.log("[eIDAS Server] Execution Callback empfangen!");
    
    const payerDataRaw = url.searchParams.get('payerdata');
    if (payerDataRaw) {
      console.log("-> Payer Data empfangen:", payerDataRaw);
      
      try {
        const payerData = JSON.parse(decodeURIComponent(payerDataRaw));
        const crypto = require('crypto');

        // Signature Verifikation
        if (!payerData.compliance || !payerData.compliance.signature) {
           throw new Error("Missing compliance signature");
        }

        // Public Key vom Opago VASP abrufen (in Produktion gecached oder in Registry hinterlegt)
        fetch('http://127.0.0.1:5555/api/keys/public')
          .then(res => res.json())
          .then(keyInfo => {
             const publicKeyHex = keyInfo.publicKey;
             const publicKeyObj = crypto.createPublicKey({
                 key: Buffer.from(publicKeyHex, 'hex'),
                 format: 'der',
                 type: 'spki'
             });

             // Rekonstruktion des exakten Strings, der signiert wurde
             const payloadToVerify = {
                 name: payerData.name,
                 identifier: payerData.identifier,
                 kycStatus: payerData.kycStatus,
                 transactionInfo: payerData.transactionInfo,
                 timestamp: payerData.timestamp
             };

             const dataString = JSON.stringify(payloadToVerify);
             const isValid = crypto.verify(null, Buffer.from(dataString), publicKeyObj, Buffer.from(payerData.compliance.signature, 'hex'));

             if (isValid) {
                 console.log("-> ✅ eIDAS Travel Rule Signatur ist GÜLTIG! Krypto-Beweis erfolgreich.");
                 
                 // Um eine ECHTE Zahlung für die Demo zu ermöglichen, holen wir uns hier live
                 // eine echte 1-Sat Invoice von einem öffentlichen Service (z.B. Alby)
                 const https = require('https');
                 https.get('https://getalby.com/lnurlp/hello/callback?amount=1000', (albyRes) => {
                   let data = '';
                   albyRes.on('data', chunk => { data += chunk; });
                   albyRes.on('end', () => {
                     try {
                       const albyData = JSON.parse(data);
                       if (albyData.pr) {
                          res.writeHead(200);
                          res.end(JSON.stringify({ pr: albyData.pr }));
                          console.log("-> Echte Invoice von Alby geladen und an App gesendet!");
                       } else {
                          throw new Error("Keine Invoice von Alby erhalten: " + data);
                       }
                     } catch (err) {
                       console.error("Fehler beim Parsen der echten Invoice:", err.message);
                       res.writeHead(200);
                       res.end(JSON.stringify({ pr: "lnbc1p....." }));
                     }
                   });
                 }).on('error', (err) => {
                   console.error("Netzwerkfehler beim Laden der echten Invoice:", err.message);
                   res.writeHead(200);
                   res.end(JSON.stringify({ pr: "lnbc1p....." }));
                 });
             } else {
                 console.log("-> ❌ INVALID Signature!");
                 res.writeHead(400);
                 res.end(JSON.stringify({ status: "ERROR", reason: "Invalid eIDAS crypto signature" }));
             }
          })
          .catch(err => {
             console.log("-> ❌ Fehler bei Key-Abfrage:", err.message);
             res.writeHead(500);
             res.end(JSON.stringify({ status: "ERROR", reason: "Could not verify signature with VASP" }));
          });
      } catch (err) {
        console.log("-> Fehlende oder ungültige Payer Data! " + err.message);
        res.writeHead(400);
        res.end(JSON.stringify({
          status: "ERROR",
          reason: "Missing or invalid eIDAS Travel Rule data!" 
        }));
      }
    } else {
      console.log("-> Fehlende Payer Data!");
      res.writeHead(400);
      res.end(JSON.stringify({
        status: "ERROR",
        reason: "Missing eIDAS Travel Rule data!" 
      }));
    }
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let localIp = '127.0.0.1';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && !name.toLowerCase().includes('vethernet') && !name.toLowerCase().includes('vmware')) {
        localIp = net.address;
      }
    }
  }

  const apiUrl = `http://${localIp}:${PORT}/lnurl-eidas`;
  const encodedLnurl = encodeUrlToLNURL(apiUrl);
  
  console.log("=========================================");
  console.log(`eIDAS / Travel Rule Test-Server läuft auf Port ${PORT}`);
  console.log("=========================================");
  
  console.log("1. Kopiere folgenden LNURL-String in das 'Destination' Feld:");
  console.log("\n" + encodedLnurl + "\n");
  
  try {
    const qrcode = require('qrcode-terminal');
    console.log("ODER: Scanne diesen QR-Code mit der Opago Wallet App:");
    qrcode.generate(encodedLnurl, { small: true });
  } catch(e) {
    console.log("(QR-Code konnte nicht generiert werden)");
  }
  
  console.log("Die App wird nun den eIDAS Flow triggern!");
});
