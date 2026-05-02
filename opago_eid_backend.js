const http = require('http');
const crypto = require('crypto');

const PORT = 5555;

// ==========================================
// 1. KRYPTOGRAFIE (Opago Keys)
// ==========================================
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const publicKeyHex = publicKey.export({ type: 'spki', format: 'der' }).toString('hex');

// In-Memory Datenbank für aktive eID Sessions
const eidSessions = new Map();

// Helper to parse JSON body
function parseJson(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try { resolve(JSON.parse(body || '{}')); } 
            catch (e) { resolve({}); }
        });
    });
}

// ==========================================
// 2. ENDPOINTS FÜR APP & MERCHANT
// ==========================================
const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/api/keys/public') {
        res.writeHead(200);
        return res.end(JSON.stringify({ algorithm: 'ed25519', publicKey: publicKeyHex }));
    }

    if (req.method === 'POST' && url.pathname === '/api/eid/session') {
        const body = await parseJson(req);
        const { solanaPubkey, transactionInfo } = body;
        
        const sessionId = crypto.randomUUID();
        // Point the app to OUR new proxy endpoint to get the modified tcToken
        // WICHTIG: Da wir kein echtes eID-PKI Zertifikat für unseren lokalen Server haben,
        // geben wir der AusweisApp hier direkt die URL vom offiziellen Governikus Test-Server.
        // Das bedeutet: Die App verbindet sich sicher mit dem BVA, verifiziert den Ausweis
        // und leitet dann in den Browser weiter. Den Rücksprung in unsere App simulieren
        // wir beim Pitch manuell per Terminal-Befehl (siehe TESTING_EIDAS.md).
        const mockTcTokenUrl = 'https://test.governikus-eid.de/AusweisAuskunft/WebServiceRequesterServlet';

        eidSessions.set(sessionId, {
            solanaPubkey,
            transactionInfo,
            status: 'PENDING',
            createdAt: Date.now()
        });

        // Simulieren, dass die Verifizierung nach dem Deep-Link erfolgreich war
        setTimeout(() => {
            if (eidSessions.has(sessionId)) {
                const session = eidSessions.get(sessionId);
                session.status = 'SUCCESS';
                session.verifiedData = {
                    firstName: "Erika",
                    lastName: "Mustermann",
                    documentType: "AR",
                    kycStatus: "verified"
                };
            }
        }, 15000);

        res.writeHead(200);
        return res.end(JSON.stringify({ sessionId, tcTokenURL: mockTcTokenUrl }));
    }

    // ==========================================
    // DER HACKATHON MAGIC-TRICK: TCTOKEN PROXY
    // ==========================================
    const matchToken = url.pathname.match(/^\/api\/eid\/tctoken\/(.+)$/);
    if (req.method === 'GET' && matchToken) {
        const sessionId = matchToken[1];
        if (!eidSessions.has(sessionId)) {
            res.writeHead(404);
            return res.end("Not found");
        }

        // Wir holen uns das GÜLTIGE XML vom offiziellen Governikus Test-Server
        const httpsReq = require('https');
        httpsReq.get('https://test.governikus-eid.de/AusweisAuskunft/WebServiceRequesterServlet', (govRes) => {
            let xmlData = '';
            govRes.on('data', chunk => xmlData += chunk);
            govRes.on('end', () => {
                // HIER PASSIERT DIE MAGIE: Wir überschreiben die Redirect-URL mit unserem Deep Link!
                const modifiedXml = xmlData.replace(
                    /<RefreshAddress>.*<\/RefreshAddress>/i, 
                    `<RefreshAddress>opagowallet://eid-success</RefreshAddress>`
                );

                res.setHeader('Content-Type', 'application/xml');
                res.writeHead(200);
                res.end(modifiedXml);
            });
        }).on('error', (err) => {
            res.writeHead(500);
            res.end("Proxy Error");
        });
        return;
    }

    const matchStatus = url.pathname.match(/^\/api\/eid\/session\/(.+)\/status$/);
    if (req.method === 'GET' && matchStatus) {
        const sessionId = matchStatus[1];
        const session = eidSessions.get(sessionId);

        if (!session) {
            res.writeHead(404);
            return res.end(JSON.stringify({ error: 'Session not found' }));
        }

        if (session.status === 'PENDING') {
            res.writeHead(200);
            return res.end(JSON.stringify({ status: 'PENDING' }));
        }

        if (session.status === 'SUCCESS' && !session.payerData) {
            const payloadToSign = {
                name: `${session.verifiedData.firstName} ${session.verifiedData.lastName}`,
                identifier: session.solanaPubkey,
                kycStatus: session.verifiedData.kycStatus,
                transactionInfo: session.transactionInfo,
                timestamp: Date.now()
            };

            const dataString = JSON.stringify(payloadToSign);
            const signature = crypto.sign(null, Buffer.from(dataString), privateKey).toString('hex');

            session.payerData = {
                ...payloadToSign,
                compliance: {
                    mandatory: true,
                    provider: "Opago VASP",
                    algorithm: "ed25519",
                    signature: signature
                }
            };
        }

        res.writeHead(200);
        return res.end(JSON.stringify({ status: session.status, payerData: session.payerData }));
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Opago Backend] Service Provider läuft auf Port ${PORT}`);
    console.log(`[Opago Backend] Public Key: ${publicKeyHex.substring(0, 32)}...`);
});
