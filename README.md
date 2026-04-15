# Opago Wallet

Welcome to the **Opago Wallet**! This is a powerful, crypto-native mobile wallet built with React Native and Expo. It integrates with Solana and the Spark SDK to offer seamless decentralized financial capabilities.

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
