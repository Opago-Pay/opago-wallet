# Opago Wallet Hackathon

Welcome to the **Opago Wallet**! This project was built for a hackathon and is a powerful, crypto-native mobile wallet built with React Native and Expo.

## Features

- **Built for Mobile:** Native iOS and Android experiences using Expo and React Native.
- **Crypto-Native:** Integrated tightly with Solana Web3 to handle decentralized interactions.
- **Spark & Atomiq Integrations:** Leveraging `@buildonspark/spark-sdk` and `@atomiqlabs/sdk` for lightning-fast capability and cross-chain mechanics.
- **Privy Authentication:** Seamless onboarding and wallet management via `@privy-io/expo`.
- **Modern UI:** Built using `expo-router` for file-based routing and bottom tabs for navigation.

## Tech Stack

The project relies on a modern toolkit optimized for React Native and Web3:
- **Framework:** [Expo](https://expo.dev/) & [React Native](https://reactnative.dev/)
- **Blockchain:** [Solana Web3](https://solana.com/)
- **SDKs:** [Spark SDK](https://spark.build/), [Atomiq Labs](https://atomiqlabs.com/)
- **Authentication:** [Privy](https://privy.io/)
- **Routing:** Expo Router
- **Language:** TypeScript

## Getting Started

### Prerequisites

You will need the following installed:
- [Node.js](https://nodejs.org/en/) (LTS recommended)
- npm or yarn

### Installation

1. Clone the repository and navigate to the project directory:
   ```bash
   cd opago-wallet
   ```
2. Install the dependencies:
   ```bash
   npm install
   ```

### Running the App

Start the Expo development server:

```bash
npx expo start
```

Press **`i`** to open the app on an iOS simulator, **`a`** to open on an Android emulator, or scan the QR code with the **Expo Go** app on your physical device.

## Project Structure

- **`app/`**: Contains the file-based routing structure using Expo Router.
- **`components/`**: Reusable UI components.
- **`lib/`**: Core utilities, including blockchain setups (e.g., Spark SDK).
- **`assets/`**: Static images, fonts, and other resources.

## License

MIT License

---

## 🏆 Hackathon Showcase: The Future of Compliant Crypto Payments

For this hackathon, we set out to solve the two biggest blockers preventing cryptocurrency from achieving mainstream retail adoption in Europe: **Fragmented Payment Networks** and **Strict Regulatory Compliance (MiCA / Travel Rule)**.

We transformed the Opago Wallet into a next-generation Point of Sale (POS) consumer app that abstracts away all blockchain complexity while cryptographically ensuring regulatory compliance in the background.

---

### 🌍 The Problem
1. **The Checkout Nightmare:** Today, a merchant who wants to accept Bitcoin, Solana, and USDC has to generate three different QR codes, ask the customer which chain they use, and manage multiple POS integrations. The UX is terrible.
2. **The Compliance Wall:** Under the EU's strict Travel Rule, any crypto transfer exceeding €1,000 (or involving unhosted wallets) requires KYC data to be transmitted alongside the transaction. Doing this at a physical checkout counter usually means forcing the user to fill out tedious web forms while a line of angry customers waits behind them.

### 💡 The Opago Solution
We built a unified wallet experience that solves both problems instantly with a single scan.

---

### 🔥 Feature Deep Dive 1: OpenCryptoPay (OCP) Cross-Chain Settlements

**The Magic:** Merchants no longer need to care about what blockchain the customer is using. They generate **one single, unified QR code** via our OpenCryptoPay POS integration. 

When the user scans this code with the Opago Wallet, the app dynamically negotiates the available payment methods with the merchant's server. The user is instantly presented with a beautiful, native UI allowing them to settle the invoice using their preferred asset:
*   **Lightning Network (SATs)** for instant micro-transactions.
*   **Solana Native (SOL)** for high-speed Layer 1 settlement.
*   **USDC on Solana** for stablecoin payments.

The wallet automatically calculates real-time network fees and FX rates, executing the swap and settlement in under 400 milliseconds using the **Atomiq SDK** and **Spark SDK**.

<div style="display: flex; flex-wrap: wrap; gap: 15px; margin-top: 15px; margin-bottom: 25px;">
  <div>
    <p style="text-align: center; font-weight: bold; margin-bottom: 5px;">1. Merchant Terminal</p>
    <img src="./assets/screenshots/media__1778144115346.png" height="350" alt="Hardware POS Terminal" style="border-radius: 10px; border: 1px solid #333;" />
  </div>
  <div>
    <p style="text-align: center; font-weight: bold; margin-bottom: 5px;">2. Wallet Negotiation</p>
    <img src="./assets/screenshots/media__1778144108953.png" height="350" alt="OCP Checkout" style="border-radius: 10px; border: 1px solid #333;" />
  </div>
  <div>
    <p style="text-align: center; font-weight: bold; margin-bottom: 5px;">3. Multi-Asset Selection</p>
    <img src="./assets/screenshots/media__1778144115263.png" height="350" alt="Hackathon Store" style="border-radius: 10px; border: 1px solid #333;" />
  </div>
</div>

---

### 🛡️ Feature Deep Dive 2: eIDAS & Travel Rule Compliance via NFC

**The Magic:** How do you perform a legally binding KYC check in 5 seconds at a coffee shop? You use the ID card the user already has in their pocket.

We deeply integrated the **official German AusweisApp** (eIDAS infrastructure) directly into the wallet's Lightning (LNURL) payment flow. 

**The Technical Flow:**
1. The user scans a QR code from a strictly regulated merchant.
2. The Opago Wallet parses the LNURL payload and detects a hidden `compliance: { isSubjectToTravelRule: true }` flag.
3. Instead of asking for payment, the wallet **intercepts the flow** and launches the AusweisApp via Android Deep Links.
4. The user holds their National ID Card to the back of their phone (NFC) and enters a 6-digit PIN.
5. The official BVA (Bundesverwaltungsamt) server verifies the identity.
6. **The "Magic Moment":** The user swipes back to the Opago Wallet. Our custom `AppState` listener detects the foreground transition, silently fetches the cryptographic identity proof from the backend (signed via Ed25519), and seamlessly attaches it to the final Lightning payment payload.

The merchant receives the funds *and* the legally required Travel Rule data simultaneously. No forms, no waiting, 100% compliant.

<div style="display: flex; flex-wrap: wrap; gap: 15px; margin-top: 15px; margin-bottom: 25px;">
  <div>
    <p style="text-align: center; font-weight: bold; margin-bottom: 5px;">1. NFC ID Scan</p>
    <img src="./assets/screenshots/media__1778144115256.png" height="350" alt="AusweisApp Integration" style="border-radius: 10px; border: 1px solid #333;" />
  </div>
  <div>
    <p style="text-align: center; font-weight: bold; margin-bottom: 5px;">2. Cryptographic Settlement</p>
    <img src="./assets/screenshots/media__1778144115234.png" height="350" alt="Funds Received" style="border-radius: 10px; border: 1px solid #333;" />
  </div>
</div>
