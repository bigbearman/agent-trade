// GammaClient — read-only REST client for Polymarket's Gamma API (no auth required)

import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type { GammaEvent, GammaMarket, GammaTag } from './types.js';

const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

export class GammaClient {
  private http: AxiosInstance;
  private clobHttp!: AxiosInstance;

  constructor(baseUrl?: string) {
    this.http = axios.create({
      baseURL: baseUrl || GAMMA_API_BASE,
      timeout: 30000,
    });
  }

  async getEvents(params?: {
    active?: boolean;
    closed?: boolean;
    limit?: number;
    offset?: number;
    slug?: string;
    tag?: string;
  }): Promise<GammaEvent[]> {
    const { data } = await this.http.get<GammaEvent[]>('/events', {
      params: {
        active: params?.active ?? true,
        closed: params?.closed ?? false,
        limit: params?.limit ?? 50,
        offset: params?.offset ?? 0,
        ...(params?.slug ? { slug: params.slug } : {}),
        ...(params?.tag ? { tag: params.tag } : {}),
      },
    });
    return data;
  }

  async getEventBySlug(slug: string): Promise<GammaEvent | null> {
    const events = await this.getEvents({ slug, limit: 1 });
    return events.length > 0 ? events[0] : null;
  }

  async getMarkets(params?: {
    active?: boolean;
    closed?: boolean;
    limit?: number;
    offset?: number;
    slug?: string;
    tag_id?: string;
  }): Promise<GammaMarket[]> {
    const { data } = await this.http.get<GammaMarket[]>('/markets', {
      params: {
        active: params?.active ?? true,
        closed: params?.closed ?? false,
        limit: params?.limit ?? 50,
        offset: params?.offset ?? 0,
        ...(params?.slug ? { slug: params.slug } : {}),
        ...(params?.tag_id ? { tag_id: params.tag_id } : {}),
      },
    });
    return data;
  }

  async getMarketBySlug(slug: string): Promise<GammaMarket | null> {
    const markets = await this.getMarkets({ slug, limit: 1 });
    return markets.length > 0 ? markets[0] : null;
  }

  async getTags(): Promise<GammaTag[]> {
    const { data } = await this.http.get<GammaTag[]>('/tags');
    return data;
  }

  // ── CLOB Public Endpoints (no auth) ───────────────────

  private getClobHttp(): AxiosInstance {
    if (!this.clobHttp) {
      this.clobHttp = axios.create({
        baseURL: 'https://clob.polymarket.com',
        timeout: 30000,
      });
    }
    return this.clobHttp;
  }

  /**
   * Get real order book from CLOB (public, no auth needed)
   */
  async getClobOrderBook(tokenId: string): Promise<{ bids: Array<{ price: string; size: string }>; asks: Array<{ price: string; size: string }> }> {
    const { data } = await this.getClobHttp().get('/book', {
      params: { token_id: tokenId },
    });
    return data;
  }

  /**
   * Get midpoint price from CLOB (public)
   */
  async getClobMidpoint(tokenId: string): Promise<string> {
    const { data } = await this.getClobHttp().get('/midpoint', {
      params: { token_id: tokenId },
    });
    return data?.mid || '0';
  }

  /**
   * Get last trade price from CLOB (public)
   */
  async getClobLastTrade(tokenId: string): Promise<{ price: string; side: string }> {
    const { data } = await this.getClobHttp().get('/last-trade-price', {
      params: { token_id: tokenId },
    });
    return data;
  }

  /**
   * Get price history from CLOB (public)
   * @param tokenId - market token ID
   * @param interval - time range: 1d, 1w, 1m, 3m, max
   * @param fidelity - data point interval in minutes (e.g., 60 = hourly)
   */
  async getClobPriceHistory(tokenId: string, interval = '1w', fidelity = 60): Promise<Array<{ t: number; p: number }>> {
    const { data } = await this.getClobHttp().get('/prices-history', {
      params: { market: tokenId, interval, fidelity },
    });
    return data?.history || [];
  }
}
