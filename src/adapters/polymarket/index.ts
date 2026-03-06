// PolymarketAdapter — implements TradingAdapter for Polymarket prediction markets

import type { TradingAdapter, Market, OrderBookEntry, TradeIntent, TradeResult, AdapterTool } from '../adapter.js';
import type { WalletManager } from '../../core/wallet.js';
import { GammaClient } from './gamma-client.js';
import { PolymarketClobWrapper } from './clob-client.js';
import { getPolymarketConfig } from './types.js';
import type { GammaMarket } from './types.js';

function parseClobTokenIds(market: GammaMarket): string[] {
  if (Array.isArray(market.clobTokenIds)) return market.clobTokenIds;
  try {
    return JSON.parse(market.clobTokenIds as string) as string[];
  } catch {
    return [];
  }
}

function parseOutcomePrices(market: GammaMarket): { yes: number; no: number } {
  try {
    const prices = JSON.parse(market.outcomePrices) as string[];
    return {
      yes: parseFloat(prices[0] || '0'),
      no: parseFloat(prices[1] || '0'),
    };
  } catch {
    return { yes: 0, no: 0 };
  }
}

function gammaMarketToMarket(m: GammaMarket): Market {
  const prices = parseOutcomePrices(m);
  return {
    id: m.slug || m.conditionId,
    name: m.question,
    symbol: m.slug,
    venue: 'polymarket',
    category: 'prediction',
    status: m.closed ? 'closed' : m.active ? 'active' : 'inactive',
    volume: parseFloat(String(m.volume || 0)),
    liquidity: parseFloat(String(m.liquidity || 0)),
    price_yes: prices.yes,
    price_no: prices.no,
    price: prices.yes,
    end_date: m.endDate,
    description: m.description ? m.description.slice(0, 200) : undefined,
  };
}

export class PolymarketAdapter implements TradingAdapter {
  readonly name = 'polymarket';
  readonly displayName = 'Polymarket';

  private gamma: GammaClient;
  private clob: PolymarketClobWrapper | null = null;
  private wallet: WalletManager;

  constructor(wallet: WalletManager) {
    this.gamma = new GammaClient();
    this.wallet = wallet;

    const config = getPolymarketConfig();
    if (config.privateKey) {
      try {
        this.clob = new PolymarketClobWrapper(config);
      } catch (error) {
        console.error(`[PolymarketAdapter] Failed to init CLOB client: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  isConfigured(): boolean {
    // Always configured — Gamma API is public (read-only)
    return true;
  }

  private hasTradingClient(): boolean {
    return this.clob !== null;
  }

  async searchMarkets(params: Record<string, unknown>): Promise<Market[]> {
    const search = params.search as string | undefined;
    const tag = params.category as string | undefined;
    const page = (params.page as number | undefined) ?? 1;
    const take = (params.take as number | undefined) ?? 20;
    const offset = (page - 1) * take;

    // If search term provided, fetch markets and filter by keyword (Gamma API has no text search)
    if (search) {
      const searchLower = search.toLowerCase();
      // Fetch a larger batch and filter client-side
      // Fetch multiple pages for broader search coverage
      const batch1 = await this.gamma.getMarkets({ limit: 100, offset: 0 });
      const batch2 = await this.gamma.getMarkets({ limit: 100, offset: 100 });
      const gammaMarkets = [...batch1, ...batch2];
      const filtered = gammaMarkets
        .filter((m) => {
          const q = (m.question || '').toLowerCase();
          const s = (m.slug || '').toLowerCase();
          return q.includes(searchLower) || s.includes(searchLower);
        })
        .slice(offset, offset + take)
        .map(gammaMarketToMarket);
      return filtered;
    }

    const gammaMarkets = await this.gamma.getMarkets({
      limit: take,
      offset,
      ...(tag ? { tag_id: tag } : {}),
    });
    return gammaMarkets.map(gammaMarketToMarket);
  }

  async getMarketDetail(id: string): Promise<Record<string, unknown>> {
    // Try by slug first
    const market = await this.gamma.getMarketBySlug(id);
    if (market) {
      const prices = parseOutcomePrices(market);
      return {
        ...market,
        parsedPrices: prices,
        venue: 'polymarket',
        tokenIds: {
          yes: parseClobTokenIds(market)?.[0],
          no: parseClobTokenIds(market)?.[1],
        },
      };
    }
    return { error: `Market not found: ${id}`, venue: 'polymarket' };
  }

  async getOrderBook(marketId: string, depth?: number): Promise<{ bids: OrderBookEntry[]; asks: OrderBookEntry[] }> {
    // Resolve token ID from slug
    const market = await this.gamma.getMarketBySlug(marketId);
    if (!market || !parseClobTokenIds(market)?.length) {
      return { bids: [], asks: [] };
    }

    // Use CLOB public endpoint (no auth needed) for real order book
    const yesTokenId = parseClobTokenIds(market)[0];
    let book: { bids: Array<{ price: string; size: string }>; asks: Array<{ price: string; size: string }> };
    try {
      book = await this.gamma.getClobOrderBook(yesTokenId);
    } catch {
      // Fallback to implied prices from Gamma
      const prices = parseOutcomePrices(market);
      return {
        bids: [{
          id: 'implied-yes',
          price: prices.yes,
          size: parseFloat(String(market.liquidity || 0)),
          filled: 0,
          remaining: parseFloat(String(market.liquidity || 0)),
          side: 'buy' as const,
        }],
        asks: [],
      };
    }
    const maxDepth = depth ?? 10;

    const bids: OrderBookEntry[] = (book.bids || [])
      .slice(0, maxDepth)
      .map((b, i) => ({
        id: `bid-${i}`,
        price: parseFloat(b.price),
        size: parseFloat(b.size),
        filled: 0,
        remaining: parseFloat(b.size),
        side: 'buy' as const,
      }));

    const asks: OrderBookEntry[] = (book.asks || [])
      .slice(0, maxDepth)
      .map((a, i) => ({
        id: `ask-${i}`,
        price: parseFloat(a.price),
        size: parseFloat(a.size),
        filled: 0,
        remaining: parseFloat(a.size),
        side: 'sell' as const,
      }));

    return { bids, asks };
  }

  async getRecentTrades(marketId: string, limit?: number): Promise<Record<string, unknown>[]> {
    if (!this.clob) {
      return [{ message: 'Trading client not configured. Set PM_PRIVATE_KEY for trade data.' }];
    }

    // Resolve token ID
    let assetId: string | undefined;
    if (marketId) {
      const market = await this.gamma.getMarketBySlug(marketId);
      if (market && parseClobTokenIds(market)?.length) {
        assetId = parseClobTokenIds(market)[0];
      }
    }

    const trades = await this.clob.getTrades(assetId);
    const sliced = (limit ? trades.slice(0, limit) : trades) as unknown[];
    return sliced as Record<string, unknown>[];
  }

  async trade(intent: TradeIntent): Promise<TradeResult> {
    const { market_id, side, amount, price, mode } = intent;
    const totalValue = amount * price;

    const baseResult = {
      venue: 'polymarket',
      market: market_id,
      side,
      amount,
      price,
      total_cost: totalValue,
      mode,
    };

    if (!this.clob) {
      return {
        ...baseResult,
        success: false,
        error: 'Trading not available. Set PM_PRIVATE_KEY, PM_API_KEY, PM_API_SECRET, PM_API_PASSPHRASE.',
      };
    }

    if (mode === 'agent' && this.wallet.isAgentMode) {
      // Spend limit check
      const limitCheck = this.wallet.checkSpendLimits(totalValue);
      if (!limitCheck.allowed) {
        return { ...baseResult, success: false, error: limitCheck.reason };
      }

      // Resolve market to token ID
      const market = await this.gamma.getMarketBySlug(market_id);
      if (!market || !parseClobTokenIds(market)?.length) {
        return { ...baseResult, success: false, error: `Market not found: ${market_id}` };
      }

      // For buy side, use YES token; for sell, also YES token (selling YES position)
      const tokenId = parseClobTokenIds(market)[0];

      try {
        const result = await this.clob.createAndPostOrder({
          tokenId,
          price,
          size: amount,
          side,
        });
        this.wallet.recordSpend(totalValue);
        return { ...baseResult, success: true, tx_hash: undefined, error: undefined };
      } catch (error) {
        return { ...baseResult, success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }

    // User mode: preview
    return {
      ...baseResult,
      success: true,
      error: undefined,
    };
  }

  async cancel(orderId: string, _params?: Record<string, unknown>): Promise<{ success: boolean; tx_hash?: string }> {
    if (!this.clob) {
      return { success: false };
    }

    try {
      await this.clob.cancelOrder(orderId);
      return { success: true };
    } catch (error) {
      return { success: false };
    }
  }

  async getPositions(_address: string): Promise<Record<string, unknown>[]> {
    // Polymarket positions can be queried via CLOB client trades
    if (!this.clob) {
      return [{ message: 'Trading client not configured. Set PM_PRIVATE_KEY for position data.' }];
    }

    try {
      const trades = await this.clob.getTrades();
      return trades as unknown as Record<string, unknown>[];
    } catch {
      return [];
    }
  }

  async getOpenOrders(_address: string): Promise<Record<string, unknown>[]> {
    if (!this.clob) {
      return [{ message: 'Trading client not configured. Set PM_PRIVATE_KEY for order data.' }];
    }

    try {
      const orders = await this.clob.getOpenOrders();
      return orders as unknown as Record<string, unknown>[];
    } catch {
      return [];
    }
  }

  getCustomTools(): AdapterTool[] {
    return [
      {
        name: 'pm_list_tags',
        description: 'List available Polymarket tags/categories for filtering markets',
        schema: {},
        handler: async () => {
          return await this.gamma.getTags();
        },
      },
      {
        name: 'pm_get_event',
        description: 'Get a full Polymarket event with all its markets by slug',
        schema: {
          slug: { type: 'string', description: 'Event slug (e.g., "presidential-election-winner-2024")' },
        },
        handler: async (params) => {
          const slug = params.slug as string;
          if (!slug) {
            return { error: 'slug parameter is required' };
          }
          const event = await this.gamma.getEventBySlug(slug);
          if (!event) {
            return { error: `Event not found: ${slug}` };
          }
          // Enrich markets with parsed prices
          const enrichedMarkets = (event.markets || []).map((m) => ({
            ...m,
            parsedPrices: parseOutcomePrices(m),
            tokenIds: {
              yes: parseClobTokenIds(m)?.[0],
              no: parseClobTokenIds(m)?.[1],
            },
          }));
          return { ...event, markets: enrichedMarkets };
        },
      },
      {
        name: 'pm_derive_api_key',
        description: 'Derive Polymarket API credentials from your private key (one-time setup). Requires PM_PRIVATE_KEY.',
        schema: {},
        handler: async () => {
          if (!this.clob) {
            return { error: 'PM_PRIVATE_KEY not set. Cannot derive API key without a private key.' };
          }
          try {
            const creds = await this.clob.deriveApiKey();
            return {
              success: true,
              message: 'API credentials derived. Set these as environment variables:',
              env: {
                PM_API_KEY: creds.key,
                PM_API_SECRET: creds.secret,
                PM_API_PASSPHRASE: creds.passphrase,
              },
            };
          } catch (error) {
            return { error: `Failed to derive API key: ${error instanceof Error ? error.message : String(error)}` };
          }
        },
      },
      {
        name: 'pm_price_history',
        description: 'Get price history for a Polymarket market. Returns time series data for trend analysis.',
        schema: {
          slug: { type: 'string', description: 'Market slug (e.g., "russia-ukraine-ceasefire-before-gta-vi-554")' },
          interval: { type: 'string', description: 'Time range: 1d, 1w, 1m, 3m, max (default: 1w)' },
          fidelity: { type: 'number', description: 'Data point interval in minutes: 1, 5, 15, 60, 360, 1440 (default: 60)' },
        },
        handler: async (params) => {
          const slug = params.slug as string;
          if (!slug) return { error: 'slug parameter is required' };

          const market = await this.gamma.getMarketBySlug(slug);
          if (!market || !parseClobTokenIds(market)?.length) {
            return { error: `Market not found: ${slug}` };
          }

          const tokenId = parseClobTokenIds(market)[0];
          const interval = (params.interval as string) || '1w';
          const fidelity = (params.fidelity as number) || 60;

          const history = await this.gamma.getClobPriceHistory(tokenId, interval, fidelity);

          // Get current midpoint and last trade
          const [midpoint, lastTrade] = await Promise.all([
            this.gamma.getClobMidpoint(tokenId).catch(() => '0'),
            this.gamma.getClobLastTrade(tokenId).catch(() => ({ price: '0', side: '' })),
          ]);

          // Calculate basic stats
          const prices = history.map((h) => h.p);
          const high = prices.length > 0 ? Math.max(...prices) : 0;
          const low = prices.length > 0 ? Math.min(...prices) : 0;
          const first = prices[0] || 0;
          const last = prices[prices.length - 1] || 0;
          const change = first > 0 ? ((last - first) / first) * 100 : 0;

          return {
            market: market.question,
            slug: market.slug,
            interval,
            fidelity_minutes: fidelity,
            current: {
              midpoint: parseFloat(midpoint),
              last_trade: parseFloat(lastTrade.price),
              last_side: lastTrade.side,
            },
            stats: {
              high,
              low,
              change_pct: Math.round(change * 100) / 100,
              data_points: history.length,
            },
            history: history.map((h) => ({
              time: new Date(h.t * 1000).toISOString(),
              price: h.p,
            })),
          };
        },
      },
    ];
  }
}
