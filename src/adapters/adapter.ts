// Base adapter interface for all trading venues

export interface Market {
  id: string;
  name: string;
  symbol: string;
  venue: string;
  category: string;
  chain?: string;
  status: string;
  // Optional enriched fields
  volume?: number;
  liquidity?: number;
  price?: number;         // Current price or YES probability
  price_yes?: number;     // YES outcome price (prediction markets)
  price_no?: number;      // NO outcome price (prediction markets)
  end_date?: string;      // Market expiry/resolution date
  description?: string;   // Short description
}

export interface OrderBookEntry {
  id: string;
  price: number;
  size: number;
  filled: number;
  remaining: number;
  side: 'buy' | 'sell';
}

export interface TradeIntent {
  market_id: string;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  mode: 'agent' | 'user';
}

export interface TradeResult {
  success: boolean;
  tx_hash?: string;
  venue: string;
  market: string;
  side: string;
  amount: number;
  price: number;
  total_cost: number;
  mode: string;
  error?: string;
}

export interface AdapterTool {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

export interface TradingAdapter {
  /** Unique adapter name */
  name: string;

  /** Human-readable display name */
  displayName: string;

  /** Whether this adapter is properly configured */
  isConfigured(): boolean;

  /** Search/list available markets */
  searchMarkets(params: Record<string, unknown>): Promise<Market[]>;

  /** Get market details */
  getMarketDetail(id: string): Promise<Record<string, unknown>>;

  /** Get order book for a market */
  getOrderBook(marketId: string, depth?: number): Promise<{ bids: OrderBookEntry[]; asks: OrderBookEntry[] }>;

  /** Get recent trades */
  getRecentTrades(marketId: string, limit?: number): Promise<Record<string, unknown>[]>;

  /** Create a trade intent (preview in user mode, execute in agent mode) */
  trade(intent: TradeIntent): Promise<TradeResult>;

  /** Cancel an open order/offer */
  cancel(orderId: string, params?: Record<string, unknown>): Promise<{ success: boolean; tx_hash?: string }>;

  /** Get user's positions/portfolio */
  getPositions(address: string): Promise<Record<string, unknown>[]>;

  /** Get user's open orders */
  getOpenOrders(address: string): Promise<Record<string, unknown>[]>;

  /** Adapter-specific tools (optional) */
  getCustomTools?(): AdapterTool[];
}
