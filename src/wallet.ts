import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Wallet, JsonRpcProvider } from 'ethers';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getNetworkConfig } from './constants.js';
import type { WalletType, WalletMode, WalletConfig, WalletStatus, SpendRecord } from './types.js';

const VALID_WALLET_TYPES = ['solana', 'evm'] as const;

// ── Spend Tracker (persistent to disk) ───────────────────

class SpendTracker {
  private record: SpendRecord = { date: '', total: 0 };
  private readonly filePath: string;
  private lock = false;

  constructor() {
    const dataDir = process.env.WM_DATA_DIR || join(process.env.HOME || '/tmp', '.whales-market-mcp');
    try { mkdirSync(dataDir, { recursive: true }); } catch { /* ignore */ }
    this.filePath = join(dataDir, 'spend-tracker.json');
    this.load();
  }

  private load(): void {
    try {
      const data = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed.date && typeof parsed.total === 'number') {
        this.record = parsed;
      }
    } catch {
      // File doesn't exist or corrupted — start fresh
    }
  }

  private save(): void {
    try {
      writeFileSync(this.filePath, JSON.stringify(this.record), 'utf-8');
    } catch {
      // Best effort — log but don't crash
      console.error('[SpendTracker] Failed to persist spend data');
    }
  }

  private todayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  getSpent(): number {
    if (this.record.date !== this.todayKey()) {
      this.record = { date: this.todayKey(), total: 0 };
      this.save();
    }
    return this.record.total;
  }

  /**
   * Atomic check-and-add: returns true if amount was within limits and recorded.
   * Prevents race condition where parallel calls all pass limit check.
   */
  tryAdd(amount: number, dailyLimit: number): { success: boolean; newTotal: number } {
    if (this.lock) {
      return { success: false, newTotal: this.record.total };
    }
    this.lock = true;
    try {
      if (this.record.date !== this.todayKey()) {
        this.record = { date: this.todayKey(), total: 0 };
      }
      if (this.record.total + amount > dailyLimit) {
        return { success: false, newTotal: this.record.total };
      }
      this.record.total += amount;
      this.save();
      return { success: true, newTotal: this.record.total };
    } finally {
      this.lock = false;
    }
  }

  add(amount: number): void {
    if (this.record.date !== this.todayKey()) {
      this.record = { date: this.todayKey(), total: 0 };
    }
    this.record.total += amount;
    this.save();
  }
}

// ── Wallet Manager ───────────────────────────────────────

export class WalletManager {
  private readonly privateKey: string | undefined;
  private readonly walletType: WalletType;
  private readonly walletAddress: string | undefined;
  private readonly mode: WalletMode;
  private readonly spendLimitPerTx: number;
  private readonly dailyLimit: number;
  readonly spendTracker = new SpendTracker();

  constructor() {
    this.privateKey = process.env.WM_AGENT_PRIVATE_KEY;

    // Validate wallet type
    const rawType = (process.env.WM_WALLET_TYPE || 'solana').toLowerCase();
    if (!VALID_WALLET_TYPES.includes(rawType as typeof VALID_WALLET_TYPES[number])) {
      console.error(`[WalletManager] Invalid WM_WALLET_TYPE="${rawType}", falling back to "solana". Valid: ${VALID_WALLET_TYPES.join(', ')}`);
    }
    this.walletType = (VALID_WALLET_TYPES.includes(rawType as typeof VALID_WALLET_TYPES[number]) ? rawType : 'solana') as WalletType;

    this.walletAddress = process.env.WM_WALLET_ADDRESS;
    this.mode = this.privateKey ? 'agent' : 'user';

    // Validate spend limits — NaN falls back to defaults
    const parsedPerTx = parseFloat(process.env.WM_SPEND_LIMIT_PER_TX || '50');
    const parsedDaily = parseFloat(process.env.WM_DAILY_LIMIT || '200');
    this.spendLimitPerTx = Number.isFinite(parsedPerTx) && parsedPerTx > 0 ? parsedPerTx : 50;
    this.dailyLimit = Number.isFinite(parsedDaily) && parsedDaily > 0 ? parsedDaily : 200;
    if (!Number.isFinite(parsedPerTx) || parsedPerTx <= 0) {
      console.error(`[WalletManager] Invalid WM_SPEND_LIMIT_PER_TX, using default $50`);
    }
    if (!Number.isFinite(parsedDaily) || parsedDaily <= 0) {
      console.error(`[WalletManager] Invalid WM_DAILY_LIMIT, using default $200`);
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
    throw new Error('No wallet configured. Set WM_AGENT_PRIVATE_KEY (agent mode) or WM_WALLET_ADDRESS (user mode).');
  }

  hasWallet(): boolean {
    return !!(this.privateKey || this.walletAddress);
  }

  /**
   * Get private key for signing. Only available in agent mode.
   * Used internally by solana-trading.ts — avoids duplicate env reads.
   */
  getPrivateKey(): string {
    if (!this.privateKey) {
      throw new Error('No private key available (user mode). Set WM_AGENT_PRIVATE_KEY for agent mode.');
    }
    return this.privateKey;
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
      const { rpcUrl } = getNetworkConfig();
      const connection = new Connection(rpcUrl);
      const pubkey = new PublicKey(addr);
      const lamports = await connection.getBalance(pubkey);
      return { balance: lamports / LAMPORTS_PER_SOL, unit: 'SOL', address: addr };
    } else {
      const rpcUrl = process.env.WM_EVM_RPC || process.env.EVM_RPC_URL || 'https://eth.llamarpc.com';
      const provider = new JsonRpcProvider(rpcUrl);
      const wei = await provider.getBalance(addr);
      const ethBalance = Number(wei) / 1e18;
      return { balance: ethBalance, unit: 'ETH', address: addr };
    }
  }

  // ── Spend Limit Checks ────────────────────────────────

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

  /**
   * Atomic check-and-record: checks limits AND records spend in one operation.
   * Prevents race condition where parallel calls bypass daily limit.
   */
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
