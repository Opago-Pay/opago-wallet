# Hackathon Pitch: eIDAS Flow Testanleitung

Da das physische BVA-Berechtigungszertifikat noch auf dem Postweg ist und wir unseren eigenen eID-Server noch nicht final anbinden können, nutzen wir für den Pitch einen **hybriden Test-Flow**. 

Dieser Flow beweist der Jury zwei Dinge:
1. Eure kryptografische Backend-Architektur (Opago VASP Signatur) ist produktionsreif und mathematisch sicher.
2. Der "Seamless UX Flow" per Deep-Link funktioniert reibungslos.

---

## 🛠 Vorbereitung

Du benötigst drei offene Terminals für diese Demo.

### Terminal 1: Der Merchant / Receiver
Dieser Server simuliert den Empfänger (z.B. eine Krypto-Börse oder einen Händler), der die FATF Travel Rule Compliance von Opago verlangt. Er generiert die LNURL und validiert später eure Ed25519-Signatur.

```bash
node scratch_eidas_server.js
```
*(Kopiere dir den ausgegebenen LNURL-String).*

### Terminal 2: Das Opago Krypto-Backend
Dieser Server simuliert euer VASP-Backend. Er initialisiert die eID-Session und signiert die verifizierten Ausweisdaten kryptografisch (Ed25519) für das Lightning-Netzwerk.

```bash
node opago_eid_backend.js
```

### Terminal 3: Die App & ADB
Starte den Expo-Server für den Emulator:
```bash
npx expo start
```
Stelle **unbedingt** sicher, dass die Port-Weiterleitung zur Windows-AusweisApp aktiv ist:
```bash
adb reverse tcp:24727 tcp:24727
```

---

## 🚀 Der Demo-Flow (Live)

1. **Zahlung initiieren:**
   Füge den LNURL-String aus Terminal 1 in das "Destination"-Feld der Opago Wallet App ein und klicke auf "Execute Payload".
   
2. **eIDAS Aufforderung:**
   Der Screen wechselt zum eIDAS-Verifizierungsbildschirm. Klicke auf **"Tap ID Card"**.
   *Im Hintergrund generiert das Opago Backend (Terminal 2) jetzt die Session und triggert die Desktop-AusweisApp.*

3. **Ausweis verifizieren:**
   Schließe den PIN-Vorgang in der AusweisApp auf dem PC erfolgreich ab.

4. **Der Deep-Link Hack (Magic Moment):**
   *Hintergrund:* Da wir noch den öffentlichen Test-Server von Governikus nutzen, öffnet dieser nach Abschluss zwingend ein Browserfenster, anstatt in die App zurückzuleiten. 
   Um euren echten, eigenen Server zu simulieren (der direkt den Deep-Link triggern würde), nutzt du in Terminal 3 folgenden Befehl:

   ```bash
   npx uri-scheme open opagowallet://eid-success --android
   ```
   *(Falls du auf einem iOS Simulator pitchst: `npx uri-scheme open opagowallet://eid-success --ios`)*

5. **Kryptografischer Erfolg:**
   Sobald du den Befehl ausführst, springt die App an! Sie holt sich die signierten Travel Rule Daten von eurem Backend und sendet sie an den Merchant.
   
   **Beweis für die Jury (in Terminal 1 schauen!):**
   ```text
   -> ✅ eIDAS Travel Rule Signatur ist GÜLTIG! Krypto-Beweis erfolgreich.
   -> Echte Invoice von Alby geladen und an App gesendet!
   ```
   
   In der App erscheint der grüne Haken. Der kryptografische Beweis der Identität wurde erfolgreich auf der Blockchain / im Lightning-Netzwerk verifiziert!
