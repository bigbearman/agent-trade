// Universal types shared across all adapters

export type WalletType = 'solana' | 'evm';
export type WalletMode = 'agent' | 'user';

export interface WalletConfig {
  address: string;
  type: WalletType;
  mode: WalletMode;
  spendLimitPerTx: number;
  dailyLimit: number;
}

export interface WalletStatus extends WalletConfig {
  dailySpent: number;
  dailyRemaining: number;
}

export interface SpendRecord {
  date: string;
  total: number;
}
