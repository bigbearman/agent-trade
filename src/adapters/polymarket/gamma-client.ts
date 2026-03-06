// GammaClient — read-only REST client for Polymarket's Gamma API (no auth required)

import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type { GammaEvent, GammaMarket, GammaTag } from './types.js';

const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

export class GammaClient {
  private http: AxiosInstance;

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
}
