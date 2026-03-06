// WhalesMarketAdapter — implements TradingAdapter for Whales Market OTC platform

import { PublicKey } from '@solana/web3.js';
import type { TradingAdapter, Market, OrderBookEntry, TradeIntent, TradeResult, AdapterTool } from '../adapter.js';
import type { WalletManager } from '../../core/wallet.js';
import { WhalesMarketAPI } from './api-client.js';
import { getSolanaTrading } from './solana-trading.js';
import { getEvmTrading } from './evm-trading.js';
import { isSolanaChain, isEvmChain } from './evm-constants.js';
import { WEI6 } from './constants.js';

// Internal types for order book parsing
interface WmOrderBookEntry {
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

interface TokenChainInfo {
  chainId: number;
  isSolana: boolean;
  isEvm: boolean;
  tokenId: string;
  exTokenAddress: string;
  decimals: number;
}

function parseOffer(offer: Record<string, unknown>): WmOrderBookEntry {
  const totalAmount = parseFloat(String(offer.total_amount || 0));
  const filledAmount = parseFloat(String(offer.filled_amount || 0));
  const remaining = totalAmount - filledAmount;

  let price = 0;
  if (offer.offer_price_usd != null) {
    price = parseFloat(String(offer.offer_price_usd));
  } else if (offer.price) {
    price = parseFloat(String(offer.price));
  } else if (offer.collateral && totalAmount > 0) {
    price = parseFloat(String(offer.collateral)) / totalAmount;
  }

  let fillStatus = 'Open';
  if (filledAmount > 0 && filledAmount < totalAmount) fillStatus = 'Partial';
  else if (filledAmount >= totalAmount && totalAmount > 0) fillStatus = 'Filled';

  const matchType = offer.full_match === true ? 'Full' : 'Partial';

  return {
    id: String(offer.id || offer.offer_index || '-'),
    price,
    size: totalAmount,
    filled: filledAmount,
    remaining,
    fillStatus,
    matchType,
    value: remaining * price,
    type: String(offer.type || offer.offer_type || ''),
  };
}

async function resolveTokenChainInfo(
  api: WhalesMarketAPI,
  symbol: string,
): Promise<TokenChainInfo> {
  const detail = await api.getTokenDetail(symbol);
  const tokenData = detail?.data || detail;

  const rawChainId = tokenData.chain_id;
  const chainIdValue = Array.isArray(rawChainId) ? rawChainId[0] : rawChainId;
  const chainId = parseInt(String(chainIdValue || '666666'), 10);
  const tokenId = String(tokenData.token_id || tokenData.id || '0');
  const exTokenAddress = String(
    tokenData.ex_token_address || tokenData.exTokenAddress || PublicKey.default.toString(),
  );
  const decimals = parseInt(String(tokenData.decimals || tokenData.ex_token_decimals || '6'), 10);

  return {
    chainId,
    isSolana: isSolanaChain(chainId),
    isEvm: isEvmChain(chainId),
    tokenId,
    exTokenAddress,
    decimals,
  };
}

async function checkPriceSanity(
  api: WhalesMarketAPI,
  symbol: string,
  price: number,
  maxDeviation = 0.1,
): Promise<{ sane: boolean; lastPrice?: number; deviation?: number; reason?: string }> {
  try {
    const detail = await api.getTokenDetail(symbol);
    const lastPrice = parseFloat(detail?.data?.last_price || detail?.last_price || '0');
    if (lastPrice <= 0) return { sane: true, lastPrice: 0 };
    const deviation = Math.abs(price - lastPrice) / lastPrice;
    if (deviation > maxDeviation) {
      return {
        sane: false,
        lastPrice,
        deviation,
        reason: `Price $${price} deviates ${(deviation * 100).toFixed(1)}% from last price $${lastPrice} (max ${maxDeviation * 100}%)`,
      };
    }
    return { sane: true, lastPrice, deviation };
  } catch {
    return {
      sane: false,
      reason: 'Unable to verify market price (API unreachable). Trade blocked for safety. Use dry_run=true to preview.',
    };
  }
}

export class WhalesMarketAdapter implements TradingAdapter {
  readonly name = 'whales-market';
  readonly displayName = 'Whales Market';

  private api: WhalesMarketAPI;
  private wallet: WalletManager;

  constructor(wallet: WalletManager) {
    const apiUrl = process.env.WM_API_URL || 'https://api.whales.market';
    const authToken = process.env.WM_AUTH_TOKEN;
    this.api = new WhalesMarketAPI(apiUrl, authToken);
    this.wallet = wallet;
  }

  isConfigured(): boolean {
    // Always configured — public API doesn't require auth
    return true;
  }

  async searchMarkets(params: Record<string, unknown>): Promise<Market[]> {
    const result = await this.api.getTokens({
      search: params.search as string | undefined,
      category: params.category as string | undefined,
      status: params.status as string | undefined,
      chain_id: params.chain_id as number | undefined,
      sortField: params.sortField as string | undefined,
      sortType: params.sortType as string | undefined,
      page: params.page as number | undefined,
      take: params.take as number | undefined,
    });

    const items = result?.data?.list || result?.data || [];
    if (!Array.isArray(items)) return [];

    return items.map((t: Record<string, unknown>) => ({
      id: String(t.symbol || t.id || ''),
      name: String(t.name || t.symbol || ''),
      symbol: String(t.symbol || ''),
      venue: 'whales-market',
      category: String(t.category || 'pre_market'),
      chain: t.chain_id ? String(t.chain_id) : undefined,
      status: String(t.status || 'active'),
      volume: t.volume != null ? parseFloat(String(t.volume)) : undefined,
      price: t.last_price != null ? parseFloat(String(t.last_price)) : undefined,
    }));
  }

  async getMarketDetail(id: string): Promise<Record<string, unknown>> {
    return await this.api.getTokenDetail(id);
  }

  async getOrderBook(marketId: string, depth?: number): Promise<{ bids: OrderBookEntry[]; asks: OrderBookEntry[] }> {
    const response = await this.api.getOffers({
      symbol: marketId,
      status: 'open',
      page: 1,
      take: 200,
    });

    let offers: Record<string, unknown>[] = [];
    const res = response as Record<string, unknown>;
    if (res.data && typeof res.data === 'object' && 'list' in (res.data as Record<string, unknown>)) {
      offers = (res.data as Record<string, unknown>).list as Record<string, unknown>[];
    } else if (Array.isArray(res.data)) {
      offers = res.data as Record<string, unknown>[];
    } else if (Array.isArray(res.list)) {
      offers = res.list as Record<string, unknown>[];
    }

    const symbolUpper = marketId.toUpperCase();
    const filtered = offers.filter((o) => {
      const tokenSymbol = String(o.token_symbol || o.symbol || '').toUpperCase();
      return tokenSymbol === symbolUpper;
    });

    const maxDepth = depth ?? 10;
    const parsed = filtered.map(parseOffer);

    const bids = parsed
      .filter((o) => o.type === 'buy')
      .sort((a, b) => b.price - a.price)
      .slice(0, maxDepth)
      .map((o) => ({ id: o.id, price: o.price, size: o.size, filled: o.filled, remaining: o.remaining, side: 'buy' as const }));

    const asks = parsed
      .filter((o) => o.type === 'sell')
      .sort((a, b) => a.price - b.price)
      .slice(0, maxDepth)
      .map((o) => ({ id: o.id, price: o.price, size: o.size, filled: o.filled, remaining: o.remaining, side: 'sell' as const }));

    return { bids, asks };
  }

  async getRecentTrades(_marketId: string, limit?: number): Promise<Record<string, unknown>[]> {
    const result = await this.api.getRecentTrades({ take: limit ?? 20 });
    const items = result?.data?.list || result?.data || [];
    return Array.isArray(items) ? items : [];
  }

  async trade(intent: TradeIntent): Promise<TradeResult> {
    const { market_id: symbol, side, amount, price, mode } = intent;
    const totalValue = amount * price;

    const baseResult = {
      venue: 'whales-market',
      market: symbol,
      side,
      amount,
      price,
      total_cost: totalValue,
      mode,
    };

    if (mode === 'agent' && this.wallet.isAgentMode) {
      // Check spend limits
      const limitCheck = this.wallet.checkSpendLimits(totalValue);
      if (!limitCheck.allowed) {
        return { ...baseResult, success: false, error: limitCheck.reason };
      }

      // Price sanity
      const sanity = await checkPriceSanity(this.api, symbol, price);
      if (!sanity.sane) {
        return { ...baseResult, success: false, error: sanity.reason };
      }

      // Resolve chain info
      let chainInfo: TokenChainInfo;
      try {
        chainInfo = await resolveTokenChainInfo(this.api, symbol);
      } catch (error) {
        return { ...baseResult, success: false, error: `Failed to resolve token: ${error instanceof Error ? error.message : String(error)}` };
      }

      // EVM path
      if (chainInfo.isEvm) {
        try {
          const evmTrading = getEvmTrading(chainInfo.chainId);
          const result = await evmTrading.createOffer(chainInfo.tokenId, amount, price, side, chainInfo.exTokenAddress, false, false);
          if (result.success) this.wallet.recordSpend(totalValue);
          return { ...baseResult, success: result.success, tx_hash: result.txHash, error: result.error };
        } catch (error) {
          return { ...baseResult, success: false, error: error instanceof Error ? error.message : String(error) };
        }
      }

      // Solana path
      const tokenId = parseInt(chainInfo.tokenId, 10);
      const amountOnChain = Math.round(amount * WEI6);
      const priceOnChain = Math.round(price * Math.pow(10, chainInfo.decimals));
      const exTokenPubkey = new PublicKey(chainInfo.exTokenAddress);

      try {
        const solTrading = getSolanaTrading();
        const result = await solTrading.createOffer(tokenId, side, exTokenPubkey, amountOnChain, priceOnChain, false, false);
        if (result.success) this.wallet.recordSpend(totalValue);
        return { ...baseResult, success: result.success, tx_hash: result.txHash, error: result.error };
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

  async cancel(orderId: string, params?: Record<string, unknown>): Promise<{ success: boolean; tx_hash?: string }> {
    if (!this.wallet.isAgentMode) {
      return { success: false };
    }

    const offerIndex = parseInt(orderId, 10);
    if (isNaN(offerIndex)) {
      return { success: false };
    }

    const chainId = params?.chain_id as number | undefined;

    if (chainId && isEvmChain(chainId)) {
      const evmTrading = getEvmTrading(chainId);
      const result = await evmTrading.closeOffer(offerIndex, false);
      return { success: result.success, tx_hash: result.txHash };
    }

    const solTrading = getSolanaTrading();
    const result = await solTrading.closeOffer(offerIndex, false);
    return { success: result.success, tx_hash: result.txHash };
  }

  async getPositions(address: string): Promise<Record<string, unknown>[]> {
    const result = await this.api.getOrdersByAddress(address);
    const items = result?.data?.list || result?.data || [];
    return Array.isArray(items) ? items : [];
  }

  async getOpenOrders(address: string): Promise<Record<string, unknown>[]> {
    // Use offers-by-address to get open offers
    const result = await this.api.getOffersByAddress(address, {});
    const items = result?.data?.list || result?.data || [];
    return Array.isArray(items) ? items : [];
  }

  // Expose the raw API and helpers for custom tools
  getApi(): WhalesMarketAPI { return this.api; }
  getWallet(): WalletManager { return this.wallet; }

  getCustomTools(): AdapterTool[] {
    return [
      {
        name: 'wm_get_token_chart',
        description: 'Get historical price chart data for a Whales Market token',
        schema: {
          token_id: { type: 'string', description: 'Token ID' },
          resolution: { type: 'string', description: 'Chart resolution (1, 5, 15, 60, D)' },
          from: { type: 'number', description: 'Start timestamp (unix seconds)' },
          to: { type: 'number', description: 'End timestamp (unix seconds)' },
        },
        handler: async (params) => {
          return await this.api.getTokenChartData({
            token_id: params.token_id as string,
            resolution: params.resolution as string | undefined,
            from: params.from as number | undefined,
            to: params.to as number | undefined,
          });
        },
      },
      {
        name: 'wm_get_market_stats',
        description: 'Get Whales Market overall statistics and volume data',
        schema: {},
        handler: async () => {
          const [overview, volume] = await Promise.all([
            this.api.getMarketStats(),
            this.api.getStatisticVolume(),
          ]);
          return { overview, volume };
        },
      },
      {
        name: 'wm_get_wallet_info',
        description: 'Get Whales Market wallet info, tier, discount for an address',
        schema: { address: { type: 'string', description: 'Wallet address' } },
        handler: async (params) => {
          const address = params.address as string;
          const [walletInfo, stats, discount] = await Promise.all([
            this.api.getWalletInfo(address),
            this.api.getUserStats(address),
            this.api.getUserDiscount(address),
          ]);
          return { walletInfo, stats, discount };
        },
      },
      {
        name: 'wm_get_upcoming_tokens',
        description: 'Get upcoming tokens on Whales Market',
        schema: {},
        handler: async () => {
          return await this.api.getUpcomingTokens();
        },
      },
      {
        name: 'wm_get_leaderboard',
        description: 'Get Whales Market referral leaderboard and live stats',
        schema: {
          page: { type: 'number', description: 'Page number' },
          take: { type: 'number', description: 'Items per page' },
        },
        handler: async (params) => {
          const [leaderboard, liveStats] = await Promise.all([
            this.api.getReferralLeaderboard({ page: params.page as number, take: params.take as number }),
            this.api.getReferralLiveStats(),
          ]);
          return { leaderboard, liveStats };
        },
      },
      {
        name: 'wm_get_networks',
        description: 'List supported blockchain networks on Whales Market',
        schema: {},
        handler: async () => {
          return await this.api.getNetworkChains();
        },
      },
      {
        name: 'wm_react_to_offer',
        description: 'Accept/fill an existing offer on Whales Market (agent mode only)',
        schema: {
          offer_id: { type: 'string', description: 'Offer ID to react to' },
          amount: { type: 'number', description: 'Amount for partial fill (omit for full fill)' },
          dry_run: { type: 'boolean', description: 'Preview without executing' },
          chain_id: { type: 'number', description: 'Chain ID for EVM offers' },
          symbol: { type: 'string', description: 'Token symbol for chain auto-detect' },
        },
        handler: async (params) => {
          return await this.reactToOffer(params);
        },
      },
      {
        name: 'wm_cancel_order',
        description: 'Cancel an unfilled order on Whales Market (settleCancelled on-chain)',
        schema: {
          order_id: { type: 'string', description: 'Order ID to cancel' },
          dry_run: { type: 'boolean', description: 'Preview without executing' },
          chain_id: { type: 'number', description: 'Chain ID for EVM orders' },
          symbol: { type: 'string', description: 'Token symbol for chain auto-detect' },
        },
        handler: async (params) => {
          return await this.cancelOrder(params);
        },
      },
      {
        name: 'wm_check_offer_status',
        description: 'Check the status of an offer on Whales Market',
        schema: { offer_id: { type: 'string', description: 'Offer ID to check' } },
        handler: async (params) => {
          return await this.api.getOfferDetail(params.offer_id as string);
        },
      },
    ];
  }

  // Internal methods for custom tools

  private async reactToOffer(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const offerId = params.offer_id as string;
    const amount = params.amount as number | undefined;
    const dryRun = (params.dry_run as boolean) ?? false;
    let chainId = params.chain_id as number | undefined;
    const symbol = params.symbol as string | undefined;

    if (!chainId && symbol) {
      try {
        const chainInfo = await resolveTokenChainInfo(this.api, symbol);
        chainId = chainInfo.chainId;
      } catch { /* fall through */ }
    }

    if (!this.wallet.isAgentMode) {
      return { success: true, mode: 'user', preview: { message: `Preview: React to offer ${offerId}. Execute on whales.market to complete.` } };
    }

    const offerIndex = parseInt(offerId, 10);
    if (isNaN(offerIndex)) {
      return { success: false, error: `Invalid offer ID: ${offerId}` };
    }

    if (chainId && isEvmChain(chainId)) {
      const evmTrading = getEvmTrading(chainId);
      const onChainOffer = await evmTrading.getOffer(offerIndex);
      const totalAmount = BigInt(onChainOffer.amount);
      const filledAmount = BigInt(onChainOffer.filledAmount);
      const remaining = totalAmount - filledAmount;
      const fillAmountWei6 = amount ? BigInt(Math.round(amount * WEI6)) : remaining;
      const fillAmountHuman = Number(fillAmountWei6) / WEI6;
      const offerValue = BigInt(onChainOffer.value);
      const fillValue = (offerValue * fillAmountWei6) / totalAmount;
      const result = await evmTrading.fillOffer(offerIndex, fillAmountHuman, onChainOffer.exToken, fillValue, dryRun);
      return { success: result.success, txHash: result.txHash, error: result.error };
    }

    const solTrading = getSolanaTrading();
    const onChainOffer = await solTrading.getOnChainOffer(offerIndex);
    const totalAmount = parseInt(onChainOffer.totalAmount, 10);
    const filledAmount = parseInt(onChainOffer.filledAmount, 10);
    const remaining = totalAmount - filledAmount;
    const fillAmount = amount ? Math.round(amount * WEI6) : remaining;
    const result = await solTrading.fillOffer(offerIndex, fillAmount, dryRun);
    return { success: result.success, txHash: result.txHash, error: result.error };
  }

  private async cancelOrder(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const orderId = params.order_id as string;
    const dryRun = (params.dry_run as boolean) ?? false;
    let chainId = params.chain_id as number | undefined;
    const symbol = params.symbol as string | undefined;

    if (!chainId && symbol) {
      try {
        const chainInfo = await resolveTokenChainInfo(this.api, symbol);
        chainId = chainInfo.chainId;
      } catch { /* fall through */ }
    }

    if (!this.wallet.isAgentMode) {
      return { success: true, mode: 'user', preview: { message: `Preview: Cancel order ${orderId}. Execute on whales.market to complete.` } };
    }

    const orderIndex = parseInt(orderId, 10);
    if (isNaN(orderIndex)) {
      return { success: false, error: `Invalid order ID: ${orderId}` };
    }

    if (chainId && isEvmChain(chainId)) {
      const evmTrading = getEvmTrading(chainId);
      const result = await evmTrading.cancelOrder(orderIndex, dryRun);
      return { success: result.success, txHash: result.txHash, error: result.error };
    }

    const solTrading = getSolanaTrading();
    const result = await solTrading.cancelOrder(orderIndex, dryRun);
    return { success: result.success, txHash: result.txHash, error: result.error };
  }
}
