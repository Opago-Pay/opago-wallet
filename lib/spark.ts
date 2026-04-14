export class SparkWallet {
  private mnemonic: string;
  private balanceSat: number = 0;

  constructor(mnemonic: string) {
    this.mnemonic = mnemonic;
    this.balanceSat = 100000; // Mock balance of 100,000 sats
  }

  static async initialize({ mnemonicOrSeed }: { mnemonicOrSeed: string, accountNumber?: number, options?: any }) {
    console.log("Mock Spark: Initialized with seed", mnemonicOrSeed.substring(0, 10) + "...");
    return new SparkWallet(mnemonicOrSeed);
  }

  async getBalance() {
    return this.balanceSat;
  }

  async createLightningInvoice(amountSat: number) {
    // Return a mock bolt11
    return `lnbc${amountSat}mockinvoice${Date.now()}`;
  }

  async payLightningInvoice(bolt11: string) {
    console.log("Mock Spark: Paying invoice", bolt11);
    // Rough estimation of parsing invoice amount
    const amountMatch = bolt11.match(/lnbc(\d+)/);
    let amount = 1000;
    if (amountMatch && amountMatch[1]) {
      amount = parseInt(amountMatch[1]);
    }
    this.balanceSat -= amount; 
    return { status: "success", preimage: "mock_preimage_" + Date.now() };
  }
}
