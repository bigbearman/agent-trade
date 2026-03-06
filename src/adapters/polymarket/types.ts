// Polymarket-specific types

// Gamma API response types (read-only market data)

export interface GammaEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  markets: GammaMarket[];
  startDate: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  liquidity: number;
  volume: number;
  commentCount: number;
  tags: GammaTag[];
}

export interface GammaMarket {
  id: string;
  question: string;
  slug: string;
  conditionId: string;
  clobTokenIds: string[];
  outcomePrices: string;
  outcomes: string;
  volume: number;
  liquidity: number;
  startDate: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  acceptingOrders: boolean;
  negRisk: boolean;
  description: string;
  image: string;
  icon: string;
  tags: GammaTag[];
}

export interface GammaTag {
  id: string;
  label: string;
  slug: string;
}

// CLOB trading types

export interface PolymarketApiCreds {
  apiKey: string;
  secret: string;
  passphrase: string;
}

export interface PolymarketConfig {
  privateKey?: string;
  apiCreds?: PolymarketApiCreds;
  signatureType?: number;
  funderAddress?: string;
}

export function getPolymarketConfig(): PolymarketConfig {
  const privateKey = process.env.PM_PRIVATE_KEY;

  let apiCreds: PolymarketApiCreds | undefined;
  if (process.env.PM_API_KEY && process.env.PM_API_SECRET && process.env.PM_API_PASSPHRASE) {
    apiCreds = {
      apiKey: process.env.PM_API_KEY,
      secret: process.env.PM_API_SECRET,
      passphrase: process.env.PM_API_PASSPHRASE,
    };
  }

  return {
    privateKey,
    apiCreds,
    signatureType: process.env.PM_SIGNATURE_TYPE ? parseInt(process.env.PM_SIGNATURE_TYPE, 10) : 0,
    funderAddress: process.env.PM_FUNDER_ADDRESS,
  };
}
