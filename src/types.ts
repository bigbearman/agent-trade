export enum ETokenCategory {
  PRE_MARKET = 'pre_market',
  OTC_MARKET = 'otc_market',
  POINT_MARKET = 'point_market',
  VESTING_MARKET = 'vesting_market',
  WHITELIST_MARKET = 'whitelist_market',
  RUNES_MARKET = 'rune_market',
  RUNE_OTC = 'rune_otc',
}

export enum ETokenType {
  TOKEN = 'token',
  POINT = 'point',
}

export enum ESortType {
  ASC = 'ASC',
  DESC = 'DESC',
}

export enum EOfferStatus {
  Open = 'open',
  Close = 'close',
  Closed = 'closed',
  Filled = 'filled',
  Ended = 'ended',
  Cancelled = 'canceled',
  Settled = 'settled',
  Exited = 'exited',
  Claimed = 'claimed',
  Resold = 'resold',
}

export enum EActionType {
  BUY = 'buy',
  SELL = 'sell',
  RESELL = 'resell',
}

export interface ITokenParams {
  type?: string;
  search?: string;
  status?: string;
  category?: string;
  chain_id?: number;
  symbol?: string;
  sortField?: string;
  sortType?: string;
  sortTotalVolume?: string;
  page?: number;
  take?: number;
}

export interface IOffersParams {
  token_id?: string;
  offer_type?: string;
  symbol?: string;
  category?: string;
  chain_id?: number;
  status?: string;
  page?: number;
  take?: number;
}

export interface IChartParams {
  token_id: string;
  resolution?: string;
  from?: number;
  to?: number;
}

export interface ApiResponse<T> {
  data: T;
  meta?: {
    page: number;
    take: number;
    itemCount: number;
    pageCount: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
}

// ── Phase 2: Wallet + Trading Types ────────────────────

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

export interface OrderBookEntry {
  id: string;
  price: number;
  size: number;
  filled: number;
  remaining: number;
  fillStatus: string;
  matchType: string;
  value: number;
  type: string;
}

export interface OrderBookResult {
  symbol: string;
  buyOrders: OrderBookEntry[];
  sellOrders: OrderBookEntry[];
  bestBid: number;
  bestAsk: number;
  spread: number;
  spreadPercent: number;
}

export interface TradeIntent {
  symbol: string;
  amount: number;
  price: number;
  side: 'buy' | 'sell';
  totalValue: number;
  dryRun: boolean;
}

export interface TradeResult {
  success: boolean;
  mode: WalletMode;
  intent: TradeIntent;
  executed: boolean;
  result?: unknown;
  preview?: {
    message: string;
    approvalUrl?: string;
  };
  error?: string;
}

export interface SpendRecord {
  date: string;
  total: number;
}
