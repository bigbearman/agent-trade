import axios, { type AxiosInstance } from 'axios';
import type {
  ITokenParams,
  IOffersParams,
  IChartParams,
} from './types.js';

export class WhalesMarketAPI {
  private client: AxiosInstance;

  constructor(baseURL: string, authToken?: string) {
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
    });
  }

  // ── Tokens ──────────────────────────────────────────────

  async getTokens(params: ITokenParams = {}) {
    const { data } = await this.client.get('/v2/tokens', {
      params: { take: params.take ?? 20, ...params },
    });
    return data;
  }

  async getTokenDetail(symbol: string) {
    const { data } = await this.client.get(`/v2/tokens/detail/${symbol}`);
    return data;
  }

  async getUpcomingTokens() {
    const { data } = await this.client.get('/v2/tokens/upcoming');
    return data;
  }

  async getTokenChartData(params: IChartParams) {
    const { data } = await this.client.get('/v2/chart/data', { params });
    return data;
  }

  // ── Market Stats ────────────────────────────────────────

  async getMarketStats() {
    const { data } = await this.client.get('/statistics/overview');
    return data;
  }

  async getStatisticVolume() {
    const { data } = await this.client.get('/v2/tokens/statistic-volume');
    return data;
  }

  // ── Offers ──────────────────────────────────────────────

  async getOffers(params: IOffersParams = {}) {
    // Map MCP params to backend DTO field names
    const queryParams: Record<string, unknown> = {
      take: params.take ?? 20,
      page: params.page,
    };
    if (params.offer_type) queryParams.type = params.offer_type;
    if (params.status) queryParams.status = params.status;
    if (params.symbol) queryParams.symbol = params.symbol;
    if (params.category) queryParams.category = params.category;
    if (params.chain_id) queryParams.chain_id = params.chain_id;

    const { data } = await this.client.get('/v2/offers', { params: queryParams });
    return data;
  }

  async getOffersByAddress(address: string, params: { symbol?: string; page?: number; take?: number } = {}) {
    const { data } = await this.client.get(`/v2/offers-by-address/${address}`, {
      params: { symbol: params.symbol, take: params.take ?? 20, page: params.page },
    });
    return data;
  }

  // ── Orders ──────────────────────────────────────────────

  async getOrdersByAddress(address: string, params: { page?: number; take?: number } = {}) {
    const { data } = await this.client.get(`/v2/orders-by-address/${address}`, {
      params: { take: params.take ?? 20, ...params },
    });
    return data;
  }

  // ── Wallet & User ──────────────────────────────────────

  async getWalletInfo(address: string) {
    const { data } = await this.client.get(`/v2/users/wallet-info/${address}`);
    return data;
  }

  async getUserStats(address: string) {
    const { data } = await this.client.get(`/v2/users/statistic/${address}`);
    return data;
  }

  async getUserDiscount(address: string) {
    const { data } = await this.client.get(`/v2/users/check-discount-fee/${address}`);
    return data;
  }

  // ── Recent Trades ──────────────────────────────────────

  async getRecentTrades(params: { page?: number; take?: number } = {}) {
    const { data } = await this.client.get('/v2/recent-trades', {
      params: { take: params.take ?? 20, ...params },
    });
    return data;
  }

  // ── Referral ────────────────────────────────────────────

  async getReferralLeaderboard(params: { page?: number; take?: number } = {}) {
    const { data } = await this.client.get('/referral/leaderboard', {
      params: { take: params.take ?? 20, ...params },
    });
    return data;
  }

  async getReferralLiveStats() {
    const { data } = await this.client.get('/referral/live-stats');
    return data;
  }

  // ── Dashboard ──────────────────────────────────────────

  async getOrdersToDeliver(address: string, params: { page?: number; take?: number } = {}) {
    const { data } = await this.client.get(`/v2/orders-to-deliver/${address}`, {
      params: { take: params.take ?? 20, ...params },
    });
    return data;
  }

  async getOrdersToReceive(address: string, params: { page?: number; take?: number } = {}) {
    const { data } = await this.client.get(`/v2/orders-to-receive/${address}`, {
      params: { take: params.take ?? 20, ...params },
    });
    return data;
  }

  async getUpcomingSettlements(address: string) {
    const { data } = await this.client.get(`/v2/upcoming-settlements/${address}`);
    return data;
  }

  async getCurrentSettlements(address: string) {
    const { data } = await this.client.get(`/v2/current-settlements/${address}`);
    return data;
  }

  async getEndedOrders(address: string, params: { page?: number; take?: number } = {}) {
    const { data } = await this.client.get(`/v2/ended-orders/${address}`, {
      params: { take: params.take ?? 20, ...params },
    });
    return data;
  }

  // ── Phase 2: New Endpoints ────────────────────────────

  async getNetworkChains() {
    const { data } = await this.client.get('/network-chains');
    return data;
  }

  async getOfferDetail(offerId: string) {
    const { data } = await this.client.get(`/v2/offers/${offerId}`);
    return data;
  }

  async createOffer(payload: {
    address: string;
    symbol: string;
    amount: number;
    price: number;
    side: string;
    signature: string;
    timestamp: string;
  }) {
    const { data } = await this.client.post('/transactions/create-offer', payload);
    return data;
  }

  async reactToOffer(offerId: string, payload: {
    address: string;
    amount?: number;
    signature: string;
    timestamp: string;
  }) {
    const { data } = await this.client.post(`/transactions/reaction-offer/${offerId}`, payload);
    return data;
  }

  async cancelOffer(offerId: string, payload: {
    address: string;
    signature: string;
    timestamp: string;
  }) {
    const { data } = await this.client.post(`/transactions/cancel-offer/${offerId}`, payload);
    return data;
  }
}
