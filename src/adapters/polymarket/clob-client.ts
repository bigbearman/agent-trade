// PolymarketClobWrapper — trading client wrapping @polymarket/clob-client
// Handles API key derivation, order placement, cancellation, order book

import { Wallet } from 'ethers';
import { ClobClient, Side } from '@polymarket/clob-client';
import type { ApiKeyCreds, OrderBookSummary, OpenOrder, Trade } from '@polymarket/clob-client';
import type { PolymarketConfig } from './types.js';

const CLOB_HOST = 'https://clob.polymarket.com';
const POLYGON_CHAIN_ID = 137;

// ClobClient expects an ethers v5-style signer with _signTypedData and getAddress.
// Our project uses ethers v6, so we create a minimal adapter.
interface EthersV5Signer {
  _signTypedData(
    domain: Record<string, unknown>,
    types: Record<string, Array<{ name: string; type: string }>>,
    value: Record<string, unknown>,
  ): Promise<string>;
  getAddress(): Promise<string>;
}

function createV5Signer(privateKey: string): EthersV5Signer {
  const wallet = new Wallet(privateKey);
  return {
    async _signTypedData(domain, types, value) {
      return await wallet.signTypedData(domain, types, value);
    },
    async getAddress() {
      return wallet.address;
    },
  };
}

export class PolymarketClobWrapper {
  private client: ClobClient;
  private config: PolymarketConfig;

  constructor(config: PolymarketConfig) {
    this.config = config;

    if (!config.privateKey) {
      throw new Error('PM_PRIVATE_KEY is required for trading operations');
    }

    const signer = createV5Signer(config.privateKey);
    const creds: ApiKeyCreds | undefined = config.apiCreds
      ? { key: config.apiCreds.apiKey, secret: config.apiCreds.secret, passphrase: config.apiCreds.passphrase }
      : undefined;

    this.client = new ClobClient(
      CLOB_HOST,
      POLYGON_CHAIN_ID,
      signer,
      creds,
      config.signatureType,
      config.funderAddress,
    );
  }

  async deriveApiKey(): Promise<ApiKeyCreds> {
    return await this.client.createOrDeriveApiKey();
  }

  async getOrderBook(tokenId: string): Promise<OrderBookSummary> {
    return await this.client.getOrderBook(tokenId);
  }

  async getOpenOrders(): Promise<OpenOrder[]> {
    const response = await this.client.getOpenOrders();
    return Array.isArray(response) ? response : [];
  }

  async getTrades(assetId?: string): Promise<Trade[]> {
    const params = assetId ? { asset_id: assetId } : undefined;
    return await this.client.getTrades(params);
  }

  async createAndPostOrder(params: {
    tokenId: string;
    price: number;
    size: number;
    side: 'buy' | 'sell';
    tickSize?: string;
    negRisk?: boolean;
  }): Promise<unknown> {
    const side = params.side === 'buy' ? Side.BUY : Side.SELL;
    const userOrder = {
      tokenID: params.tokenId,
      price: params.price,
      size: params.size,
      side,
    };

    return await this.client.createAndPostOrder(userOrder);
  }

  async cancelOrder(orderId: string): Promise<unknown> {
    return await this.client.cancelOrder({ orderID: orderId });
  }

  async cancelAll(): Promise<unknown> {
    return await this.client.cancelAll();
  }

  async getTickSize(tokenId: string): Promise<string> {
    return await this.client.getTickSize(tokenId);
  }

  async getNegRisk(tokenId: string): Promise<boolean> {
    return await this.client.getNegRisk(tokenId);
  }

  getAddress(): string {
    if (!this.config.privateKey) throw new Error('No private key configured');
    const wallet = new Wallet(this.config.privateKey);
    return wallet.address;
  }
}
