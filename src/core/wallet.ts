// WalletManager — shared across all adapters

import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Wallet, JsonRpcProvider } from 'ethers';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import type { WalletType, WalletMode, WalletConfig, WalletStatus } from './types.js';
import { SpendTracker } from './safety.js';

const VALID_WALLET_TYPES = ['solana', 'evm'] as const;

export class WalletManager {
  private readonly privateKey: string | undefined;
  private readonly walletType: WalletType;
  private readonly walletAddress: string | undefined;
  private readonly mode: WalletMode;
  private readonly spendLimitPerTx: number;
  private readonly dailyLimit: number;
  readonly spendTracker = new SpendTracker();

  constructor() {
    this.privateKey = process.env.AT_AGENT_PRIVATE_KEY || process.env.WM_AGENT_PRIVATE_KEY;

    // Validate wallet type
    const rawType = (process.env.AT_WALLET_TYPE || process.env.WM_WALLET_TYPE || 'solana').toLowerCase();
    if (!VALID_WALLET_TYPES.includes(rawType as typeof VALID_WALLET_TYPES[number])) {
      console.error(`[WalletManager] Invalid wallet type="${rawType}", falling back to "solana". Valid: ${VALID_WALLET_TYPES.join(', ')}`);
    }
    this.walletType = (VALID_WALLET_TYPES.includes(rawType as typeof VALID_WALLET_TYPES[number]) ? rawType : 'solana') as WalletType;

    this.walletAddress = process.env.AT_WALLET_ADDRESS || process.env.WM_WALLET_ADDRESS;
    this.mode = this.privateKey ? 'agent' : 'user';

    // Validate spend limits — NaN falls back to defaults
    const parsedPerTx = parseFloat(process.env.AT_SPEND_LIMIT_PER_TX || process.env.WM_SPEND_LIMIT_PER_TX || '50');
    const parsedDaily = parseFloat(process.env.AT_DAILY_LIMIT || process.env.WM_DAILY_LIMIT || '200');
    this.spendLimitPerTx = Number.isFinite(parsedPerTx) && parsedPerTx > 0 ? parsedPerTx : 50;
    this.dailyLimit = Number.isFinite(parsedDaily) && parsedDaily > 0 ? parsedDaily : 200;
    if (!Number.isFinite(parsedPerTx) || parsedPerTx <= 0) {
      console.error(`[WalletManager] Invalid spend limit per tx, using default $50`);
    }
    if (!Number.isFinite(parsedDaily) || parsedDaily <= 0) {
      console.error(`[WalletManager] Invalid daily limit, using default $200`);
    }
  }

  get isAgentMode(): boolean {
    return this.mode === 'agent';
  }

  getConfig(): WalletConfig {
    return {
      address: this.getAddress(),
      type: this.walletType,
      mode: this.mode,
      spendLimitPerTx: this.spendLimitPerTx,
      dailyLimit: this.dailyLimit,
    };
  }

  getStatus(): WalletStatus {
    const spent = this.spendTracker.getSpent();
    return {
      ...this.getConfig(),
      dailySpent: spent,
      dailyRemaining: Math.max(0, this.dailyLimit - spent),
    };
  }

  getAddress(): string {
    if (this.privateKey) {
      return this.deriveAddress(this.privateKey);
    }
    if (this.walletAddress) {
      return this.walletAddress;
    }
    throw new Error('No wallet configured. Set AT_AGENT_PRIVATE_KEY (agent mode) or AT_WALLET_ADDRESS (user mode).');
  }

  hasWallet(): boolean {
    return !!(this.privateKey || this.walletAddress);
  }

  getPrivateKey(): string {
    if (!this.privateKey) {
      throw new Error('No private key available (user mode). Set AT_AGENT_PRIVATE_KEY for agent mode.');
    }
    return this.privateKey;
  }

  getWalletType(): WalletType {
    return this.walletType;
  }

  private deriveAddress(key: string): string {
    if (this.walletType === 'solana') {
      const keypair = Keypair.fromSecretKey(bs58.decode(key));
      return keypair.publicKey.toBase58();
    } else {
      const wallet = new Wallet(key);
      return wallet.address;
    }
  }

  async signMessage(message: string): Promise<string> {
    if (!this.privateKey) {
      throw new Error('Cannot sign: no private key (user mode)');
    }

    if (this.walletType === 'solana') {
      const keypair = Keypair.fromSecretKey(bs58.decode(this.privateKey));
      const messageBytes = Buffer.from(message);
      const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
      return bs58.encode(signature);
    } else {
      const wallet = new Wallet(this.privateKey);
      return await wallet.signMessage(message);
    }
  }

  async getBalance(address?: string): Promise<{ balance: number; unit: string; address: string }> {
    const addr = address || this.getAddress();

    if (this.walletType === 'solana') {
      const rpcUrl = process.env.AT_SOLANA_RPC || process.env.WM_SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
      const connection = new Connection(rpcUrl);
      const pubkey = new PublicKey(addr);
      const lamports = await connection.getBalance(pubkey);
      return { balance: lamports / LAMPORTS_PER_SOL, unit: 'SOL', address: addr };
    } else {
      const rpcUrl = process.env.AT_EVM_RPC || process.env.WM_EVM_RPC || process.env.EVM_RPC_URL || 'https://eth.llamarpc.com';
      const provider = new JsonRpcProvider(rpcUrl);
      const wei = await provider.getBalance(addr);
      const ethBalance = Number(wei) / 1e18;
      return { balance: ethBalance, unit: 'ETH', address: addr };
    }
  }

  // Spend limit checks
  checkSpendLimits(valueUsd: number): { allowed: boolean; reason?: string } {
    if (valueUsd > this.spendLimitPerTx) {
      return {
        allowed: false,
        reason: `Trade value $${valueUsd.toFixed(2)} exceeds per-tx limit of $${this.spendLimitPerTx}`,
      };
    }

    const dailySpent = this.spendTracker.getSpent();
    if (dailySpent + valueUsd > this.dailyLimit) {
      return {
        allowed: false,
        reason: `Trade would bring daily spend to $${(dailySpent + valueUsd).toFixed(2)}, exceeding daily limit of $${this.dailyLimit}`,
      };
    }

    return { allowed: true };
  }

  checkAndRecordSpend(valueUsd: number): { allowed: boolean; reason?: string } {
    if (valueUsd > this.spendLimitPerTx) {
      return {
        allowed: false,
        reason: `Trade value $${valueUsd.toFixed(2)} exceeds per-tx limit of $${this.spendLimitPerTx}`,
      };
    }

    const result = this.spendTracker.tryAdd(valueUsd, this.dailyLimit);
    if (!result.success) {
      return {
        allowed: false,
        reason: `Trade would exceed daily limit of $${this.dailyLimit} (current: $${result.newTotal.toFixed(2)})`,
      };
    }

    return { allowed: true };
  }

  recordSpend(valueUsd: number): void {
    this.spendTracker.add(valueUsd);
  }
}
