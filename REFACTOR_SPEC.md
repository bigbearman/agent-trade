# agent-trade — Refactor Spec

## Overview
Refactor `whales-market-mcp` into `agent-trade` — a universal MCP server for AI agent trading across multiple venues.

## Architecture: Adapter Pattern

```
src/
├── index.ts              # MCP server entry point (tool registration)
├── core/
│   ├── types.ts           # Shared types (TradeIntent, OrderBook, etc.)
│   ├── wallet.ts          # WalletManager (Solana + EVM) — from existing
│   ├── safety.ts          # SpendTracker, price sanity, limits — from existing
│   └── utils.ts           # formatResult, handleError, helpers
├── adapters/
│   ├── adapter.ts         # Base adapter interface
│   ├── whales-market/     # Whales Market adapter
│   │   ├── index.ts       # WhalesMarketAdapter implements TradingAdapter
│   │   ├── api-client.ts  # API client (from existing)
│   │   ├── solana-trading.ts
│   │   ├── evm-trading.ts
│   │   ├── constants.ts
│   │   ├── accounts.ts
│   │   ├── evm-constants.ts
│   │   ├── idl/
│   │   └── abi/
│   └── polymarket/        # Polymarket adapter (Phase 2)
│       ├── index.ts       # PolymarketAdapter implements TradingAdapter
│       ├── clob-client.ts # Polymarket CLOB API
│       └── types.ts
└── registry.ts            # Adapter registry — loads enabled adapters
```

## Base Adapter Interface

```typescript
// src/adapters/adapter.ts

export interface Market {
  id: string;
  name: string;
  symbol: string;
  venue: string;            // 'whales-market' | 'polymarket'
  category: string;         // 'pre-market' | 'prediction' | 'dex'
  chain?: string;
  status: string;
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

export interface AdapterTool {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}
```

## Adapter Registry

```typescript
// src/registry.ts

export class AdapterRegistry {
  private adapters: Map<string, TradingAdapter> = new Map();
  
  register(adapter: TradingAdapter): void;
  get(name: string): TradingAdapter | undefined;
  list(): TradingAdapter[];
  getConfigured(): TradingAdapter[];
}
```

## MCP Tool Design (Universal)

Tools are venue-agnostic with `venue` parameter:

| Tool | Description |
|------|-------------|
| `list_venues` | List all available/configured trading venues |
| `search_markets` | Search markets across venues (or specific venue) |
| `get_market` | Get market details |
| `get_order_book` | Get order book for a market |
| `get_recent_trades` | Get recent trades |
| `trade` | Create buy/sell (agent mode: execute, user mode: preview) |
| `cancel` | Cancel open order |
| `get_positions` | Get portfolio/positions |
| `get_orders` | Get open orders |
| `wallet_status` | Get wallet info, balance, spend limits |
| `setup_wallet` | Wallet setup/generation |

Plus adapter-specific custom tools registered via `getCustomTools()`.

## Env Vars

```
# Global
AGENT_TRADE_MODE=agent|user          # Default: user
AGENT_TRADE_VENUES=whales-market,polymarket  # Comma-separated enabled venues

# Wallet (shared across venues)
AT_WALLET_TYPE=solana|evm
AT_AGENT_PRIVATE_KEY=...
AT_SPEND_LIMIT_PER_TX=50
AT_DAILY_LIMIT=200
AT_SOLANA_RPC=...
AT_EVM_RPC=...

# Whales Market specific
WM_API_URL=https://api.whales.market
WM_AUTH_TOKEN=...

# Polymarket specific (Phase 2)
PM_API_URL=https://clob.polymarket.com
PM_API_KEY=...
PM_API_SECRET=...
PM_API_PASSPHRASE=...

# HTTP mode
MCP_HTTP_PORT=
MCP_HTTP_HOST=127.0.0.1
```

## Migration Notes

### From wm-mcp
1. Move existing code into `adapters/whales-market/`
2. Extract wallet + safety into `core/`
3. Rewrite `index.ts` to use registry pattern
4. All existing WM tools become adapter methods
5. WM-specific tools (like `get_statistics`) become custom tools
6. Keep backward compat: if only WM configured, behavior identical to wm-mcp

### What stays the same
- Solana trading code (solana-trading.ts, accounts.ts, constants.ts, idl/)
- EVM trading code (evm-trading.ts, evm-constants.ts, abi/)
- WalletManager core logic
- SpendTracker logic
- Safety checks (price sanity, spend limits)

### What changes
- `index.ts` — complete rewrite (tool registration via registry)
- `api-client.ts` → `adapters/whales-market/api-client.ts`
- `trading.ts` → split into adapter methods
- `types.ts` → `core/types.ts` (universal) + adapter-specific types
- Package name, description, keywords, bin name

## Package.json Changes
```json
{
  "name": "agent-trade",
  "version": "0.1.0",
  "description": "MCP server for AI agent trading — any agent, any venue",
  "bin": { "agent-trade": "dist/index.js" },
  "keywords": ["mcp", "ai-agent", "trading", "polymarket", "defi", "prediction-market"]
}
```

## Phase Plan
- **Phase 1 (now):** Refactor architecture + Whales Market adapter working
- **Phase 2 (next):** Polymarket adapter
- **Phase 3:** Jupiter (Solana DEX) adapter
